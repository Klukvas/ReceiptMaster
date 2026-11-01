# Business Logic & Domain Model

**Last Updated:** 2026-11-01

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

**States:** DRAFT → CONFIRMED → (optionally) CANCELLED

File: `backend/src/modules/orders/entities/order.entity.ts`

```typescript
export enum OrderStatus {
  DRAFT = "draft",            // In progress, can be edited
  CONFIRMED = "confirmed",    // Locked, ready for receipt
  CANCELLED = "cancelled",    // Soft-deleted, no longer relevant
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
   - Insert OrderItems for each line item
   - Calculate total (subtotal + tax/discounts, if any)
   - Cache idempotency response

5. **Invalidate Dashboard Cache**
   - Clear dashboard metrics cache so next dashboard query is fresh

File: `backend/src/modules/orders/orders.service.ts::create()`

**Confirmation Flow:**

Only DRAFT orders can be confirmed. Once confirmed:
- Status changes to CONFIRMED
- Order is locked (cannot be edited)
- Can now generate Receipt

**Auto-generated receipt (opt-in):** when `user_settings.autoGenerateReceipt` is on, `confirm()` and `approveBatch()` call `ReceiptsService.generateReceipt(orderId, user)` with default settings for every newly confirmed order, after the status change has committed. Calls are sequential (generation takes the per-tenant advisory lock). Any failure — plan limits, snapshot validation, a settings lookup error — is logged and swallowed: confirmation always succeeds and the manual "Generate receipt" path remains. Because the account keeps only the 10 newest generated receipts, bulk-approving many orders with the flag on evicts older receipts (see the ten-generated-receipt limit in step 2 below).

File: `backend/src/modules/orders/orders.service.ts::confirm()` / `autoGenerateReceipts()`

**Cancellation Flow:**

Cancellation locks the order, returns its reserved quantities to the products in the same transaction, then sets status CANCELLED (a second cancel is rejected, so stock is returned once). Deletion is a separate soft-delete operation:
- Deleting an already cancelled order (single or batch) does not restore stock again
- Lock live orders inside the transaction before restoring stock and setting `deleted_at`
- Single and overlapping batch deletes restore reserved quantities exactly once
- Batch order locks and affected product locks follow deterministic ID order
- Updating line items locks and persists the union of old/new products, so removed products regain stock
- Order updates/deletes invalidate dashboard caches

File: `backend/src/modules/orders/orders.service.ts::cancel()`

---

### 2. Receipt & Invoice PDF Generation

**Retention cap:** an account keeps its 10 most recent generated receipts (`ReceiptsService.MAX_RECEIPTS`). Generating number 11 retires the oldest one and its public link stops working. The UI (`useOrders`) shows a notice when the manual "Generate Receipt" action, or Confirm / bulk Approve with auto-generate on, will push the oldest receipt out. The backend itself never asks: it evicts silently.

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
Refresh looks up an unrevoked stored opaque token, rejects expired tokens, revokes the old token
and issues a new access/refresh pair. It does not decode refresh tokens as JWTs.

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

- Validate subscription: check product count limit
- Check no duplicate name for this user
- Save and return

**Recipients:**

File: `backend/src/modules/recipients/entities/recipient.entity.ts`

- User-owned list of customers (recipients of orders)
- Name, email, address (optional)
- Used when creating Orders
- Scoped to tenant via `user_id`

**Creation:**

File: `backend/src/modules/recipients/recipients.service.ts::create()`

- Validate no duplicate email for this user
- Save and return

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

File: `backend/src/modules/orders/orders.service.ts`

Dashboard metrics exclude soft-deleted orders in all six raw revenue/turnover methods.
Dashboard metrics are expensive (aggregations, date grouping). Solutions:

1. **Cache with TTL** (5 minutes, configurable)
   - Query runs, result stored in Redis
   - Subsequent queries return cached value
   - On order mutation, invalidate cache pattern

2. **Cache Keys:**
   - `dashboard:getTotalRevenue:${userId}:${dateRange}` → cache value
   - On `createOrder()`, `updateOrder()`, `deleteOrder()`, call `invalidateDashboardCache(userId)`

**Metrics Provided:**

Naming: the code and API call the profit metrics "revenue" (`SUM((unit_price - purchase_price) * qty)`), while "turnover" is the sales amount. The UI labels (en/ru/uk) say Profit / Прибыль / Прибуток for the revenue metrics and Turnover for sales; the translation keys keep the `revenue` names.

- Total Revenue (profit; all-time, selected period)
- Daily Revenue (time series)
- Revenue by Product (breakdown)
- Revenue by Recipient (breakdown)
- Order Status Summary (draft/confirmed/cancelled counts)
- Turnover (order count variants of above)

Files:
- `backend/src/modules/orders/dto/dashboard-response.dto.ts` — Response shapes
- `backend/src/modules/orders/orders.service.ts::*Dashboard*()` — Implementations

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
   - DRAFT → CONFIRMED (only state)
   - DRAFT → CANCELLED (only state)
   - CONFIRMED → (locked, cannot transition)
   - CANCELLED → (locked, cannot transition)

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
   - Same `Idempotency-Key` within 24 hours returns same response
   - Prevents duplicate orders if client retries

7. **Soft Deletes:**
   - Orders are deleted via the `deleted_at` timestamp; cancellation is a separate status change
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
