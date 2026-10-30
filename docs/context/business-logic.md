# Business Logic & Domain Model

**Last Updated:** 2026-10-30

This document describes the core business flows, entities, and rules that govern ReceiptMaster.

## Domain Entities & Relationships

```
User (subscription owner)
├── many Products        (owned by user, scoped to tenant)
├── many Recipients      (owned by user, scoped to tenant)
├── many Orders          (created by user)
├── many Receipts        (generated from orders)
└── one UserSubscription (plan, Paddle integration)

Order
├── one Recipient        (to)
├── many OrderItems      (line items)
│   └── each OrderItem
│       └── one Product  (what was sold)
└── many Receipts        (generated documents)

Receipt
└── one Order            (source transaction)
```

All entities are tenant-scoped via `user_id` foreign key.

---

## Core Flows

### 1. Order Lifecycle

**States:** DRAFT → CONFIRMED; DRAFT or CONFIRMED → CANCELLED (terminal). Deletion is separate.

File: `backend/src/modules/orders/entities/order.entity.ts`

```typescript
export enum OrderStatus {
  DRAFT = "draft",            // In progress, can be edited
  CONFIRMED = "confirmed",    // Locked, ready for receipt
  CANCELLED = "cancelled",    // Terminal status; the order stays as history (not deleted)
}
```

**Creation Flow:**

1. **Check Idempotency**
   - If `Idempotency-Key` is provided, lock it and replay the cached response before checking quota
   - Replays still work when the account has since reached its monthly order limit
   - Expires after 24 hours; response includes `X-Idempotency-Replayed: true`
   - File: `backend/src/modules/orders/entities/idempotency-key.entity.ts`

2. **Validate Subscription Limits**
   - Acquire a transaction-scoped advisory lock per user before counting monthly orders
   - This serializes creates across different products, including accounts with no subscription row
   - Reject an additional order beyond the plan limit with `ORDER_MONTHLY_LIMIT_EXCEEDED`
   - File: `backend/src/modules/subscription/subscription.service.ts::assertCanCreateOrderInTx()`

3. **Validate References**
   - Recipient must exist and belong to the user
   - Each Product in OrderItems must exist and belong to the user
   - Throw `RECIPIENT_NOT_FOUND` or `PRODUCT_NOT_FOUND` if missing
   - Reject duplicate `productId` entries and mixed product currencies with 400 `VALIDATION_ERROR`
   - Optional custom `unitPriceCents` is an integer at least zero; explicit zero is preserved

4. **Create Atomic Transaction**
   - Insert Order (DRAFT status)
   - Insert OrderItems for each line item, each freezing the locked product's purchase cost in
     `unit_cost_cents` (see *Historical profit* below)
   - Calculate total (subtotal + tax/discounts, if any)
   - Cache idempotency response

5. **Invalidate Dashboard Cache**
   - Clear dashboard metrics cache so next dashboard query is fresh

File: `backend/src/modules/orders/orders.service.ts::create()`

**Confirmation Flow:**

Only DRAFT orders can be confirmed. `confirm()` locks the order row (`FOR UPDATE`), checks DRAFT under
the lock and updates conditionally, so a cancel that committed first is seen and wins.
`approveBatch()` locks all its orders in id order (like `deleteBatch`) and checks DRAFT under the
locks. Once confirmed:
- Status changes to CONFIRMED
- Order is locked (cannot be edited)
- Can now generate Receipt
- Line costs are not re-read: they were frozen when the draft lines were written

**Auto-generated receipt (opt-in):** when `user_settings.autoGenerateReceipt` is on, `confirm()` and `approveBatch()` call `ReceiptsService.generateReceipt(orderId, user)` with default settings for every newly confirmed order, after the status change has committed. Calls are sequential (generation takes the per-tenant advisory lock). Any failure — plan limits, snapshot validation, a settings lookup error — is logged and swallowed: confirmation always succeeds and the manual "Generate receipt" path remains. Because the account keeps only the 10 newest generated receipts, bulk-approving many orders with the flag on evicts older receipts (see the ten-generated-receipt limit in step 2 below).

File: `backend/src/modules/orders/orders.service.ts::confirm()` / `autoGenerateReceipts()`

**Cancellation Flow:**

Cancellation is a status change to CANCELLED, allowed from DRAFT and from CONFIRMED (the UI offers
both). It is not a deletion and returns no stock. One transaction:

1. Tenant lock `pg_advisory_xact_lock(hashtextextended(userId, 1))` — the receipt generation/promotion
   lock — then the order row `FOR UPDATE` (404 if missing; `ORDER_ALREADY_CANCELLED` if cancelled).
2. If CONFIRMED: `ReceiptsService.voidForCancellation()` locks the order's non-void receipts in id
   order and voids each (`void_reason = "order_cancelled"`, `voided_at`), revoking `public_token` and
   clearing `replacement_*` and every `pending_*` field. A pending logo that differs from the active one
   gets its 24 h cleanup grace; the active PDF, frozen content and active logo stay as history. The
   order's `is_locked` is left alone (manual void unlocks; a cancelled order is never edited again).
3. Conditional update to CANCELLED. After commit: dashboard cache invalidation, return `findOne`.

Receipts voided by hand before the cancel keep their own reason and timestamp. Stock comes back only
from deleting the order (single or batch), exactly once, cancelled or not.

Races (all PostgreSQL-tested in `test/order-lifecycle.e2e-spec.ts` unless noted):

| Concurrent with cancel | Outcome |
|---|---|
| confirm / `approveBatch` | order lock + DRAFT check under it: whichever commits second sees the other; a confirm can never resurrect a cancelled order |
| generation request (manual or auto) | precreation re-checks CONFIRMED under tenant → order locks; if it committed first, the cancel voids its PROCESSING receipt; after the cancel it is rejected (auto-generation logs and swallows) |
| queued/in-flight render | claim, promotion (`CONFIRMED` check under tenant → order locks, `matches`) and `failed()` all no-op on a VOID receipt; the outbox deletes the entry; no `receipt.completed` event |
| regenerate / repair / share / manual void | 409 / conflict / 400 / 400 on the VOID receipt |
| edit / delete | order row lock; edit rejected (not DRAFT), delete restores stock once |
| eviction | runs under the same tenant lock |

Lock order everywhere: tenant → order → receipts → leases; manual void and repair start at the order
row and never take the tenant lock afterwards, so no cycle exists.

Deletion is a separate soft-delete operation:
- Lock live orders inside the transaction before restoring stock and setting `deleted_at`
- Single and overlapping batch deletes restore reserved quantities exactly once
- Batch order locks and affected product locks follow deterministic ID order
- Updating line items locks and persists the union of old/new products, so removed products regain stock
- Order updates/deletes invalidate dashboard caches

Files: `backend/src/modules/orders/orders.service.ts::cancel()`,
`backend/src/modules/receipts/receipts.service.ts::voidForCancellation()`

---

### 2. Receipt & Invoice PDF Generation

**Statuses** (`ReceiptStatus`): `PROCESSING` → `GENERATED`, or `FAILED`; a generated
receipt can later be `VOID`. There is at most **one receipt row per order** (unique
`order_id`), so a retry reuses the same row rather than inserting a new one.

File: `backend/src/modules/receipts/entities/receipt.entity.ts`

**Trigger:** User requests PDF for a CONFIRMED order, or the order is confirmed while the account's `autoGenerateReceipt` setting is on.

**High-Level Process:**

1. **Prepare and freeze outside locks.** Resolve authoritative account defaults or a preset plus validated document overrides. Capture transaction/recipient values, title provenance, contact visibility, document language and formatting. Load immutable normalized logo bytes and compile final HTML with embedded fonts/logo and complete PDF options.
2. **Commit durable intent.** Revalidate authoritative revisions and locked order/recipient inputs in a short transaction. Create/reuse the unique order receipt, save one pending candidate, and insert an identifier-only outbox entry. Quota enforcement is serialized; the existing ten-generated-receipt eviction policy remains. Publish to Redis after commit.
3. **Render the frozen candidate.** BullMQ retries use stored HTML/options only; changes to settings, logos, recipients or templates do not change a queued candidate. Each attempt uploads to a fresh immutable key. Promotion atomically checks tenant/generation/pending/active-version/order/lifecycle and switches the entire active document.
4. **Retry and replacement.** Initial generation uses PROCESSING/FAILED. A generated document keeps its active PDF and public availability during replacement, with separate processing/failed replacement status. A failed candidate stays retryable and the old artifact is never deleted first. A default failed-generation retry reuses its frozen candidate; an explicitly supplied new configuration prepares a new design while retaining captured transaction inputs. Legacy jobs without frozen candidates require explicit owner reconstruction. Empty-body regeneration now reproduces frozen content; applying current/new design requires explicit `replace`. This deliberately changes the former current-settings regeneration behavior. Missing active files repair only from trustworthy frozen HTML/options; temporary download failures do not cause reconstruction. Legacy missing snapshots require explicit owner-confirmed reconstruction, and historical fidelity is not invented. Share revocation and concurrent void cannot be undone by promotion.

5. **Emit Progress** (WebSocket)
   - On job start, each stage, and completion/failure
   - Events: `receipt.progress`, `receipt.completed`, `receipt.failed` (room `user:<id>`)
   - File: `backend/src/modules/receipts/receipts.gateway.ts`
   - **Delivery is best-effort.** The socket can be blocked or drop mid-job, so the UI
     never treats a missing `receipt.completed` as "still generating": it falls back to
     the receipt's real status (`GET /receipts/:id`, and polling `GET /orders` while any
     receipt is `PROCESSING`). See `docs/context/frontend.md` → Real-Time Updates.

**Receipt Templates:**

15 styles available, set in UserSettings:

```typescript
export enum ReceiptStyle {
  STANDARD,   // Default
  COMPACT,    // Minimal fields
  CLASSIC,    // Formal invoice
  MODERN,     // Clean, contemporary
  ELEGANT,    // Serif fonts, sophisticated
  VINTAGE,    // Warm, retro
  TECH,       // Futuristic, minimal
  WAVE,       // Wavy graphics
  MINIMAL,    // Bare essentials
  CORPORATE,  // Business letterhead
  THERMAL,    // Receipt-printer style
  DARK,       // Dark background
  BRANDED,    // With logo & branding
  DELIVERY,   // For delivery orders
  PROFORMA,   // Pro-forma invoice (not payment-received)
}
```

Files: `backend/src/modules/receipts/templates/` (contains HTML templates)

**Plan-Based Restrictions:**

- Free plan: STANDARD, COMPACT, MINIMAL, THERMAL templates
- Pro plan: all templates
- Business plan: all 15 templates

File: `backend/src/modules/subscription/config/plans.config.ts`

**Language Support:**

Receipt title and the HTML `lang` use the selected `en`/`ru`/`uk` language. Delivery and
Proforma use their localised document names when the raw stored title is null,
empty or whitespace. Explicitly saved nonempty titles are preserved even when equal
to the language's invoice default.
`SettingsService.getAllPdfSettings()` preserves this provenance in the internal
`hasCustomReceiptTitle` flag, passed through generation, regeneration and test receipts.
Legacy callers that omit provenance still recognise the language's default title. Delivery remains
price-free and Proforma retains its watermark; neither implies payment was received.
Every style supports footer title and subtitle independently. Item columns display only
real order fields (description, quantity, unit price and line total), without invented
units or item taxes. Corporate does not label an ordinary invoice a debit memo.

A4 styles wrap long fields, bound logos in both dimensions, keep fitting item rows intact,
and keep totals/end blocks together. The Standard footer flows after the totals. Thermal
is an 80 mm roll with a height measured from the rendered content, including loaded fonts;
production PDFs and test PDFs use the same metadata and generator. Modern has no QR payment
feature and Wave graphics are static in PDF.

File: `backend/src/modules/settings/services/settings.service.ts::getTemplateLanguage()`

---

Sharing stores a random 64-character hexadecimal token. Revocation and voiding persist SQL NULL;
both public metadata and PDF paths return 404 after revocation/voiding. Delayed PDF regeneration
updates only PDF fields and cannot restore an old token/status. Concurrent share creation uses
one winning token and cannot attach a token to an already voided receipt.

### 3. Subscription & Billing (Paddle)

Payments are an explicit capability: strict `BILLING_ENABLED` defaults to false. The
current release disables new payments, portal management, webhook processing and the
scheduled canceled-subscription downgrade. Existing free/paid plans, stored subscription
data, usage reads and quota enforcement are preserved. Disabled payment endpoints return
503 `BILLING_DISABLED`; no SDK is constructed. Enabling billing in production requires
complete Paddle credentials, price IDs, frontend URL and explicit production environment.


**Entities:**

- `UserSubscription`: Plan, Paddle subscription ID, billing cycle dates
- `Product`: User's products (not to be confused with Paddle products; these are the items being sold)
- `Order`: Transactions recorded in ReceiptMaster

**Plans & Limits:**

File: `backend/src/modules/subscription/config/plans.config.ts`

```typescript
export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    maxProducts: 10,           // Can create up to 10 products
    maxOrdersPerMonth: 20,    // Up to 20 orders/month
    allowedTemplates: ["standard", "compact", "minimal", "thermal"],
  },
  pro: {
    maxProducts: 100,
    maxOrdersPerMonth: 500,
    allowedTemplates: null, // all templates
  },
  business: {
    maxProducts: null,        // Unlimited
    maxOrdersPerMonth: null,  // Unlimited
    allowedTemplates: [/* all 15 */],
  },
};
```

**Subscription Lifecycle:**

1. **User Registers**
   - Starts on FREE plan
   - Granted default admin user subscription at startup (via seed data)

2. **User Upgrades to Pro**
   - Clicks "Upgrade" in app
   - Redirected to Paddle checkout (external)
   - After payment, Paddle sends webhook

3. **Paddle Webhook Received**
   - Event type: `subscription.created` or `subscription.updated`
   - Webhook signature verified using PADDLE_WEBHOOK_SECRET
   - Extract `subscription_id`, `status`, `billing_cycle` (start/end dates)
   - Update UserSubscription record
   - File: `backend/src/modules/paddle/paddle.service.ts::handleWebhookEvent()`

4. **Entitlement Check on Action**
   - On every `createOrder()`, `createProduct()`, or template selection, assert limits
   - File: `backend/src/modules/subscription/subscription.service.ts::assertCanCreate*()`
   - Order and product quotas are checked inside the creating transaction
     (`assertCanCreateOrderInTx`, `assertCanCreateProductInTx`) under a per-user advisory lock,
     reading the plan without creating a subscription row (no row = free)
   - Throws 402 (Payment Required) if limit exceeded or template restricted

**Paddle Configuration:**

File: `backend/src/config/env.schema.ts`

```
PADDLE_API_KEY                 # For server-side API calls
PADDLE_WEBHOOK_SECRET          # For signature verification
PADDLE_PRO_PRICE_ID            # Paddle product price for Pro plan
PADDLE_BUSINESS_PRICE_ID       # Paddle product price for Business plan
PADDLE_ENVIRONMENT             # "sandbox" or "production"
```

**Webhook Handling:**

File: `backend/src/modules/paddle/paddle.controller.ts`

```typescript
@Post("paddle/webhook")
@HttpCode(HttpStatus.OK)
async webhook(
  @Req() req: RawBodyRequest<Request>,
  @Headers("paddle-signature") signature?: string,
) {
  // Step 1: Verify signature (if invalid, return 400 — don't retry)
  const event = await this.paddleService.verifyWebhook(rawBody, signature);

  // Step 2: Process event (if error, return 500 — Paddle retries)
  await this.paddleService.handleWebhookEvent(event);

  return { ok: true };
}
```

**Important:** Signature verification must pass, or the webhook is rejected (400). Processing errors return 500, and Paddle retries.

---

### 4. Telegram Notifications

**Purpose:** Notify user when order is created or receipt is generated.

**Configuration:**

File: `backend/src/config/env.schema.ts`

```
TELEGRAM_BOT_TOKEN              # Bot API token (from @BotFather)
TELEGRAM_BOT_OWNER_USER_ID      # UUID of the app owner (receives notifications)
TELEGRAM_WEBHOOK_SECRET         # Signing key for Telegram webhook
```

**Flow:**

1. **Order Created** → TelegramService sends message to owner
   - "New order from [recipient name]: [total] [currency]"

2. **Receipt Generated** → TelegramService sends message
   - "Receipt PDF generated for order [id]"

File: `backend/src/modules/telegram/telegram.service.ts`

**Webhook Handling:**

Telegram can send updates to `/tg/webhook` (exempt from API prefix). The controller:
- Verifies webhook secret
- Parses message
- Dispatches to appropriate handler

File: `backend/src/modules/telegram/telegram.controller.ts`

---

### 5. User Management & Authentication

**Entities:**

- `User`: Email, hashed password, active/inactive status
- Related: Products, Recipients, Orders, Receipts

**Flows:**

#### Registration

File: `backend/src/modules/users/users.service.ts::register()`

```typescript
async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
  // Validate email not already in use
  const existing = await this.usersRepository.findOne({ where: { email: registerDto.email } });
  if (existing) throw ApiErrors.USER_ALREADY_EXISTS(registerDto.email);

  // Hash password using bcrypt
  const hashedPassword = await bcrypt.hash(registerDto.password, 10);

  // Create user
  const user = this.usersRepository.create({
    email: registerDto.email,
    password: hashedPassword,
    isActive: true,
  });
  await this.usersRepository.save(user);

  // Grant free subscription
  // (auto-created by SubscriptionService.getOrCreate() on first access)

  // Issue JWT & refresh token
  const tokens = this.issueTokens(user);
  return { user, ...tokens };
}
```

#### Login

File: `backend/src/modules/users/users.service.ts::login()`

```typescript
async login(loginDto: LoginDto): Promise<AuthResponseDto> {
  const user = await this.usersRepository.findOne({ where: { email: loginDto.email } });
  if (!user) throw ApiErrors.INVALID_CREDENTIALS();

  const passwordValid = await bcrypt.compare(loginDto.password, user.password);
  if (!passwordValid) throw ApiErrors.INVALID_CREDENTIALS();

  // Rate limiting is handled by @Throttle decorator in controller

  const tokens = this.issueTokens(user);
  return { user, ...tokens };
}
```

#### Token Refresh

File: `backend/src/modules/users/users.service.ts::refreshToken()`

Refresh/logout bodies use a real `RefreshTokenDto`: `refresh_token` must be a string of
exactly 128 lowercase hexadecimal characters (the format produced by `randomBytes(64)`).
The service independently rejects malformed input before any token repository lookup/update.
Refresh is single-use and atomic: in one transaction a conditional
`UPDATE refresh_tokens SET revoked = true WHERE token = $1 AND revoked = false AND expires_at > now
RETURNING user_id` redeems the token, then the successor is inserted with the same transaction
manager. Concurrent refreshes with one token serialize on that row: the first commits, the rest
re-check, match nothing and get 401 `UNAUTHORIZED`. A failed successor insert rolls the redemption
back, so the token still works; expired tokens are rejected and stay unrevoked. It does not decode
refresh tokens as JWTs. Known gaps (separate task): tokens are stored in plaintext, refresh does not
check `isActive`, there is no reuse detection and no `/auth/refresh` throttle.

**JWT Strategy:**

File: `backend/src/modules/users/strategies/jwt.strategy.ts`

- Reads Authorization header (`Bearer <token>`)
- Verifies signature using `JWT_SECRET`
- Populates `req.user` with decoded payload

**Rate Limiting:**

File: `backend/src/app.module.ts`

```typescript
ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])  // 30 reqs per 60s globally
```

Controller-level override:

```typescript
@Throttle({ default: { ttl: 60000, limit: 5 } })  // 5 login attempts per 60s
```

---

### 6. Products & Recipients

**Products:**

File: `backend/src/modules/products/entities/product.entity.ts`

- User-owned catalog of items being sold (SKUs, not Paddle products)
- Name, price (in cents), currency
- Used when creating OrderItems
- Scoped to tenant via `user_id`

**Creation:**

File: `backend/src/modules/products/products.service.ts::create()`

- One transaction: `assertCanCreateProductInTx` takes `pg_advisory_xact_lock(hashtext('product-quota'),
  hashtext(userId))`, reads the plan (no subscription row = free), counts the tenant's products with
  the ORM (soft-deleted ones excluded), then the product is inserted
- Two creates for the last free slot: one succeeds, the other gets 402 `PRODUCT_LIMIT_EXCEEDED`;
  a create that rolls back after its insert releases the slot
- The audit log entry is written by `AuditLogInterceptor` only after the handler succeeds, so a
  rolled-back or rejected create is never logged
- With an `Idempotency-Key` (the onboarding wizard sends one) the transaction first takes the key's
  advisory lock and replays a stored response from the last 24 hours, so a retried or concurrent
  repeat creates nothing — even at the plan limit, because the quota lock comes after the key. Only
  a successful create stores its response (`common/idempotency/idempotent-create.ts`)
- Duplicate live names are rejected only by the partial unique index `IDX_products_user_name`
  `(user_id, name) WHERE deleted_at IS NULL` — no pre-check, so racing creates are settled by the
  database too. `ProductsService` maps that index's unique violation (SQLSTATE 23505, matched by
  index name via `common/utils/unique-violation.util.ts`) to 409 `PRODUCT_ALREADY_EXISTS` after the
  transaction rolls back; any other constraint violation stays a generic 500. A soft-deleted
  product's name is free again, and the same name in another tenant is unaffected

**Stock edits (`update()`):**

- Only fields present in the body are written, in one conditional `UPDATE … WHERE id AND user_id
  AND deleted_at IS NULL`; the product form sends only fields that differ from what it loaded
- `quantity` is a precondition write and requires `expectedQuantity`: the UPDATE adds
  `AND quantity = expectedQuantity`, so an edit based on a stale form cannot overwrite stock that an
  order changed (409 `PRODUCT_QUANTITY_CONFLICT`, nothing saved). A rename keeps the current stock
- A rename onto another live product's name hits the same index and is refused with 409
  `PRODUCT_ALREADY_EXISTS`, nothing saved
- Orders, order edits/deletes and Telegram orders keep changing stock under row locks or atomic
  increments; a stock edit parked behind such a lock re-checks after it commits

**Recipients:**

File: `backend/src/modules/recipients/entities/recipient.entity.ts`

- User-owned list of customers (recipients of orders)
- Name, email, address (optional)
- Used when creating Orders
- Scoped to tenant via `user_id`

**Creation:**

File: `backend/src/modules/recipients/recipients.service.ts::create()`

- Save and return (nothing checks e-mail uniqueness today)
- With an `Idempotency-Key`: same replay rules as products, in one transaction with the key lock

**Update (`update()`):** `null` clears `email`, `phone` or `address`. `name` is NOT NULL, so
`name: null` is refused with 400 `VALIDATION_ERROR` before the recipient is read — the same rule
(`common/utils/null-fields.util.ts`) products apply to every field except `supplier_id`

---

### 7. Settings & Customization

`user_settings` stores versioned complete `document_config`, a revision and a tenant-owned immutable logo pointer. Old individual field/logo endpoints adapt to this same persistence boundary. Explicit custom-title provenance is retained, including literal `Invoice` and surrounding nonblank whitespace. New V1 custom titles must contain non-whitespace text; automatic title mode resolves Delivery/Proforma by document language. The legacy title endpoint still maps blank/whitespace to automatic. Reads and preview do not create default settings rows.

Named tenant presets are independent copies (maximum 20, trimmed 1–80 character names, optimistic revisions). Explicit preset selection/use does not save account defaults. Per-document configuration is accepted from the Orders customization editor, with no account change. Unsupported template values remain in configurations but are excluded from rendering.

Money/date preferences control presentation only: bounded number/date locales, currency display, date/time style, hour cycle and valid IANA timezone. Integer cents and order currency are unchanged. Legacy defaults retain ru-RU money formatting, document-language numeric dates with four-digit years and seconds, visible contacts, automatic logo sizing and explicit deployment timezone for future documents. Numeric dates match the old TemplateService `toLocaleString(locale)` presentation in that timezone; en defaults h12, ru/uk h23. Short/medium/long date styles remain explicit choices. Configuration and timezone freeze with the candidate; existing stored choices and frozen HTML are unchanged.

Logo Save normalizes a compact PNG, uploads an immutable tenant asset before the settings transaction, then switches config/pointer in one DB commit. Upload or DB failure leaves the prior account configuration and logo valid. Removal detaches references; reference-aware leased cleanup runs through scheduled bounded tenant sweeps after a 24-hour grace. PDF uploads have durable intent, guarded attachment and transactional retirement; replacement failure preserves the active PDF. Cleanup retries storage failures and never deletes a referenced active/pending logo or active PDF. Preview normalization stays entirely in memory. Logo bytes are embedded once in frozen HTML and never repeated as base64 in configuration JSON.

Public metadata uses the active frozen visible projection. Internal snapshots/configs and pending asset references do not enter ordinary receipt/order/share JSON. Legacy PDFs with no frozen metadata remain downloadable with metadata explicitly unavailable.

---

## Dashboard & Analytics

**Cached Queries:**

File: `backend/src/modules/orders/orders-dashboard.service.ts` (`OrdersDashboardService`, read side
only; the writers in `OrdersService` and `TelegramService` invalidate)

Dashboard metrics exclude soft-deleted orders in all six raw revenue/turnover methods.
Dashboard metrics are expensive (aggregations, date grouping). Solutions:

1. **Cache with TTL** (5 minutes)
   - Query runs, result stored in Redis
   - Subsequent queries return cached value
   - On order mutation, invalidate cache pattern

2. **Cache Keys** (`backend/src/modules/orders/dashboard-cache.ts`):
   - `dashboard:v2:{method}:{userId}:{JSON args}`. The version segment changes with the payload
     shape, so entries cached by an older release are never served (they expire)
   - `OrdersService.invalidateDashboardCache(userId)` deletes `dashboard:*:{userId}:*` — every version — on order
     create/update/confirm/cancel/delete/batch and on Telegram order creation
   - Product price changes need no invalidation: profit no longer reads the current price

**Historical profit (cost snapshots).** In code "revenue" means profit and "turnover" means gross.
Profit is Σ (`unit_price_cents` − `unit_cost_cents`) × `qty` over the order's lines, using the nullable
`order_items.unit_cost_cents` snapshot — never the product's current `purchase_price_cents`.

- **Capture:** at order create (web and Telegram) from the locked product row; on a DRAFT edit a line
  with the same product and quantity keeps its stored cost (including NULL), any other line captures
  the current cost. Nothing is captured on confirm; once confirmed the lines are immutable. A
  product cost that is not a non-negative integer is stored as NULL rather than guessed.
- **Legacy lines** (written before snapshots existed) hold an estimate. Migration
  `1792310000000-BackfillOrderItemUnitCost`, the owner's knowing decision so existing users get their
  analytics back, set `unit_cost_cents` to the product's purchase price at backfill time and
  `unit_cost_estimated` to true on every line without a cost: all order statuses, soft-deleted orders
  and lines on soft-deleted products. That price estimates the historical cost, it is not the truth.
  It stays frozen like any snapshot, so a later price change does not move it. New lines keep
  capturing real snapshots with the flag false, and a line that already had one was not touched.
- **Unknown** (NULL) now remains only where no valid cost could be assigned: a negative product cost
  is never stored, at capture or by the backfill, and the backfill skips a line whose product belongs
  to another tenant (it logs their count and the release continues).
- **Queries** drop the join to `products` (it never filtered rows: the line FK guarantees the product
  row and products are only soft-deleted) and report `unknown_cost_lines`,
  `unknown_cost_turnover_cents` and `profit_complete` per group. The profit is NULL when no line of a
  group has a known cost; a day without orders is a complete 0. Turnover is unchanged.
- **UI:** null profit reads "—" with "Cost unknown"; incomplete profit gets a "Partial" badge whose
  tooltip names the excluded lines and turnover; the sparkline leaves gaps; the CSV leaves the profit
  cell empty and adds `profit_complete`, `unknown_cost_lines`, `unknown_cost_turnover` columns.
- **Rollout:** `1792300000000-AddOrderItemUnitCost` (additive nullable column + CHECK ≥ 0) and
  `1792310000000-BackfillOrderItemUnitCost` (the `unit_cost_estimated` flag and the estimates) are
  applied by `scripts/deploy-production.sh` with the new image before containers swap. Old code
  ignores both columns (the flag has a default, its inserts store a NULL cost), so rolling back to the
  old image is safe. Never run `AddOrderItemUnitCost`'s `down` in production: it drops the captured
  costs. The backfill's `down` clears only flagged lines and drops the flag, so real snapshots survive;
  a draft line edited after the backfill is written again with the flag false, so one that kept its
  estimate stays populated. Roll back to the old image before running that `down`: TypeORM includes
  the defaulted column in INSERT … RETURNING, so the current entity cannot write order lines once the
  column is gone. The migration does not touch Redis: dashboard entries cached just before
  it can keep showing the old figures for up to their 5-minute TTL.

**Metrics Provided:**

- Total Revenue (all-time, selected period)
- Daily Revenue (time series)
- Revenue by Product (breakdown)
- Revenue by Recipient (breakdown)
- Order Status Summary (draft/confirmed/cancelled counts)
- Turnover (order count variants of above)

Files:
- `backend/src/modules/orders/dto/dashboard-response.dto.ts` — Response shapes
- `backend/src/modules/orders/orders-dashboard.service.ts` — Implementations (the eight cached `get*` methods)

---

## Data Model Diagram

```
┌─────────────┐
│ User        │
├─────────────┤
│ id (PK)     │
│ email (UQ)  │
│ password    │
│ isActive    │
└──────┬──────┘
       │
       ├─── 1:N ────→ Product (user_id FK)
       │
       ├─── 1:N ────→ Recipient (user_id FK)
       │
       ├─── 1:N ────→ Order (user_id FK)
       │               ├─── 1:N ────→ OrderItem
       │               │               └─── M:1 ────→ Product
       │               └─── 1:N ────→ Receipt
       │
       ├─── 1:1 ────→ UserSubscription
       │               └─── (paddle_subscription_id, paddle_status, plan)
       │
       └─── 1:1 ────→ UserSettings
                       └─── (receipt_template_id, logo_url, language)

┌────────────────┐
│ Order          │
├────────────────┤
│ id (PK)        │
│ user_id (FK)   │
│ recipient_id   │
│ status (enum)  │
│ total_cents    │
│ currency       │
│ created_at     │
│ updated_at     │
│ deleted_at     │ (soft delete)
└────────────────┘

┌──────────────────────┐
│ OrderItem            │
├──────────────────────┤
│ id (PK)              │
│ order_id (FK)        │
│ product_id (FK)      │
│ unit_price_cents     │
│ unit_cost_cents NULL │ (cost snapshot or backfilled estimate; NULL = unknown)
│ unit_cost_estimated  │ (true = backfilled estimate; internal, never selected)
│ qty                  │
│ line_total_cents     │
└──────────────────────┘

┌────────────────┐
│ Receipt        │
├────────────────┤
│ id (PK)        │
│ order_id (FK)  │
│ user_id (FK)   │
│ status (enum)  │
│ pdf_url        │
│ progress (0-100)
│ created_at     │
└────────────────┘

┌──────────────────────┐
│ IdempotencyKey       │
├──────────────────────┤
│ idempotency_key (PK) │
│ order_id (FK)        │
│ response_data        │
│ expires_at (24h TTL) │
└──────────────────────┘
```

---

## Invariants & Business Rules

1. **Order Creation:**
   - Subscription limits must not be exceeded
   - Recipient must exist and belong to user
   - Products in OrderItems must exist and belong to user
   - Each OrderItem quantity must be ≥ 1

2. **Order State Machine:**
   - DRAFT → CONFIRMED
   - DRAFT → CANCELLED
   - CONFIRMED → CANCELLED (voids the order's documents and revokes share links; no stock return)
   - CANCELLED → terminal (cannot be confirmed, edited or re-cancelled; can still be deleted)
   - Every transition locks the order row and checks the status under the lock

3. **Receipt Generation:**
   - Can only generate receipt for CONFIRMED orders
   - Only one receipt per order
   - Template must be allowed by user's plan

4. **Subscription Entitlements:**
   - Free plan: max 10 products, 20 orders/month, 4 templates
   - Pro plan: max 100 products, 500 orders/month, all templates
   - Business plan: unlimited everything

5. **Tenant Isolation:**
   - Every query must filter by `user_id`
   - A post-auth interceptor and same-connection transaction-local context apply RLS to reads and writes
   - Public receipt tokens grant only SELECT access to their receipt graph, never full owner access
   - No cross-tenant data leakage

6. **Idempotency:**
   - Same `Idempotency-Key` within 24 hours returns same response (orders, products, recipients)
   - Prevents duplicate orders, products and recipients if the client retries, also concurrently
   - Keys are per user and per kind: an order, a product and a recipient key of the same value are
     independent

7. **Soft Deletes:**
   - Orders are deleted via the `deleted_at` timestamp; cancellation is a separate status change
     that keeps the order and its stock reservation
   - Queries exclude soft-deleted records unless explicitly included
   - All six raw revenue/turnover aggregation queries also filter `o.deleted_at IS NULL`
   - Preserves audit trail

8. **Data Integrity:**
   - All monetary amounts in cents (no floats, no precision loss)
   - Transactions are ACID (no partial updates)
   - Foreign key constraints prevent orphans

---

## See Also

- [backend-patterns.md](./backend-patterns.md) — NestJS module structure, services, guards, interceptors
- [api-reference.md](./api-reference.md) — HTTP endpoints, request/response bodies
- [frontend.md](./frontend.md) — React UI, how these flows surface to users

## Receipt design settings consistency

Blank/null/whitespace stored receipt titles use the selected document language and template: Delivery/Proforma retain their specialized localized names. A nonblank stored title, including the literal `Invoice`, remains custom. The UI receives explicit `hasCustomReceiptTitle` provenance; it shares the document-language query with the gallery rather than using the interface language for document previews.

Branded alone uses the configured accent (`#3B82F6` when unset); Proforma alone displays payment/delivery terms. All nine company fields survive partial company updates. Logo replacement validates and normalizes PNG/JPEG/GIF/static SVG to PNG before overwriting the existing fixed key; a failed upload does not pre-delete the previous logo. Footer title/subtitle save together atomically.

The ten-generated-receipt limit is rechecked under the tenant lock at each successful initial promotion, including multiple already queued candidates. Only eligible oldest generated documents are evicted; processing/failed receipts and other tenants are preserved. Eviction first chooses oldest rows, then locks/refetches their IDs in stable order before retiring any PDF/logo lease and deleting tenant-scoped pointers. Repair and promotion acquire their current receipt row before PDF lease locks. Order-file deletion explicitly requires the tenant and takes tenant → order → receipt-batch → lease locks, with no tenant lock added after an order lock. Replacements do not consume another slot. Outbox terminal reconciliation cannot overwrite a promoted or changed candidate. Late uploads retain durable cleanup intent until settlement, while only live unexpired uploading leases consume the 25 concurrent-upload slots, with per-object backoff and independent PDF/logo sweeps; there is no eager deletion after ambiguous commits. Automatic logos retain each original template cap and spacing, including Corporate 80 px with 10 px bottom margin.
