# Business Logic & Domain Model

**Last Updated:** 2026-08-21

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

1. **Validate Subscription Limits**
   - Check if user's plan allows more orders this month
   - File: `backend/src/modules/subscription/subscription.service.ts::assertCanCreateOrder()`
   - If limit exceeded: throw `ORDER_MONTHLY_LIMIT_EXCEEDED`

2. **Check Idempotency**
   - If `Idempotency-Key` header provided, check if order was already created
   - Return cached response with `X-Idempotency-Replayed: true` header
   - Expires after 24 hours
   - File: `backend/src/modules/orders/entities/idempotency-key.entity.ts`

3. **Validate References**
   - Recipient must exist and belong to the user
   - Each Product in OrderItems must exist and belong to the user
   - Throw `RECIPIENT_NOT_FOUND` or `PRODUCT_NOT_FOUND` if missing

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

File: `backend/src/modules/orders/orders.service.ts::confirm()`

**Cancellation Flow:**

Only DRAFT orders can be cancelled. Cancellation is a soft delete:
- Set `deleted_at` timestamp
- Status remains unchanged (but query filters exclude soft-deleted orders by default)

File: `backend/src/modules/orders/orders.service.ts::cancel()`

---

### 2. Receipt & Invoice PDF Generation

**States:** PENDING → GENERATING → GENERATED (or FAILED)

File: `backend/src/modules/receipts/entities/receipt.entity.ts`

**Trigger:** User requests PDF for a CONFIRMED order.

**High-Level Process:**

1. **Create Receipt Record** (PENDING)
   - Check: order is CONFIRMED
   - Check: no existing receipt for this order
   - Create Receipt with `status: PENDING`, `progress: 0`
   - File: `backend/src/modules/receipts/receipts.service.ts::generateReceipt()`

2. **Enqueue Job** (async, BullMQ)
   - Add job to `receipt-generation` queue
   - Return receipt record immediately to user
   - File: `backend/src/modules/receipts/receipts.service.ts` (calls queue)

3. **Process Job** (background worker, sequential)
   - Load order + recipient + items + products
   - Load user settings (logo, language, receipt template)
   - Select template based on `receipt_template_id` (from UserSettings)
   - Render HTML from template
   - Convert HTML → PDF via headless browser (Puppeteer or similar)
   - Upload PDF to S3
   - Update Receipt: `status: GENERATED`, `pdf_url: s3_url`, `progress: 100`
   - Emit WebSocket progress update to connected client
   - File: `backend/src/modules/receipts/receipt-generation.processor.ts`

4. **Emit Progress** (WebSocket)
   - On job start, progress update, and completion
   - Client subscribes to receipt generation events: `receipts/progress/:userId`
   - File: `backend/src/modules/receipts/receipts.gateway.ts`

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

- Free plan: only STANDARD, COMPACT, CLASSIC templates
- Pro plan: all except DARK, BRANDED, DELIVERY, PROFORMA
- Business plan: all 15 templates

File: `backend/src/modules/subscription/config/plans.config.ts`

**Language Support:**

Receipt title is language-aware (not hardcoded "Invoice" or "Receipt").

File: `backend/src/modules/settings/services/settings.service.ts::getTemplateLanguage()`

---

### 3. Subscription & Billing (Paddle)

**Entities:**

- `UserSubscription`: Plan, Paddle subscription ID, billing cycle dates
- `Product`: User's products (not to be confused with Paddle products; these are the items being sold)
- `Order`: Transactions recorded in ReceiptMaster

**Plans & Limits:**

File: `backend/src/modules/subscription/config/plans.config.ts`

```typescript
export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    maxProducts: 5,           // Can create up to 5 products
    maxOrdersPerMonth: 50,    // Up to 50 orders/month
    allowedTemplates: ["standard", "compact", "classic"],
  },
  pro: {
    maxProducts: 100,
    maxOrdersPerMonth: 1000,
    allowedTemplates: [/* 11 out of 15 */],
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

```typescript
async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
  const payload = this.jwtService.verify(refreshToken);  // Throws if invalid/expired
  const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
  if (!user) throw ApiErrors.USER_NOT_FOUND(payload.sub);

  const tokens = this.issueTokens(user);
  return { user, ...tokens };
}
```

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

**Entity:**

File: `backend/src/modules/settings/entities/user-settings.entity.ts`

- `receipt_template_id`: Which template style to use for receipts
- `receipt_title`: What to call receipts ("Invoice" vs "Receipt" vs "Proforma", language-aware)
- `logo_url`: S3 URL to user's uploaded logo
- `template_language`: Language for receipt text

**Access:**

File: `backend/src/modules/settings/services/settings.service.ts`

- `getSettings(userId)`: Load user settings, create defaults if not exists
- `updateSettings(userId, updates)`: Update specific fields

**Logo Upload:**

- User uploads logo via `/settings/logo` endpoint
- Stored in S3 (`LOGOS_BUCKET`)
- URL saved to UserSettings
- Inserted in receipt PDF on render

---

## Dashboard & Analytics

**Cached Queries:**

File: `backend/src/modules/orders/orders.service.ts`

Dashboard metrics are expensive (aggregations, date grouping). Solutions:

1. **Cache with TTL** (5 minutes, configurable)
   - Query runs, result stored in Redis
   - Subsequent queries return cached value
   - On order mutation, invalidate cache pattern

2. **Cache Keys:**
   - `dashboard:getTotalRevenue:${userId}:${dateRange}` → cache value
   - On `createOrder()`, `updateOrder()`, `deleteOrder()`, call `invalidateDashboardCache(userId)`

**Metrics Provided:**

- Total Revenue (all-time, selected period)
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
   - Free plan: max 5 products, 50 orders/month, 3 templates
   - Pro plan: max 100 products, 1000 orders/month, 11 templates
   - Business plan: unlimited everything

5. **Tenant Isolation:**
   - Every query must filter by `user_id`
   - RLS policies enforce this at DB level as defense-in-depth
   - No cross-tenant data leakage

6. **Idempotency:**
   - Same `Idempotency-Key` within 24 hours returns same response
   - Prevents duplicate orders if client retries

7. **Soft Deletes:**
   - Orders can be cancelled (soft-deleted via `deleted_at` timestamp)
   - Queries exclude soft-deleted records unless explicitly included
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
