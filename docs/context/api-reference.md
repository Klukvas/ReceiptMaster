# API Reference

**Last Updated:** 2026-08-21

**Total Endpoints:** 90 across 12 controllers. This reference covers all controllers exhaustively.

ReceiptMaster API follows REST conventions. All endpoints require JWT authentication (Bearer token) unless noted otherwise.

**Base URL:** `http://localhost:3000/api/v1` (in development; configure via `API_PREFIX` env var)

**API Docs:** `{BASE_URL}/docs` (interactive Swagger UI)

---

## Authentication

### Register User

**POST** `/auth/register` (no auth required)

Creates a new user account.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| email | string | yes | Must be unique |
| password | string | yes | Min 8 chars recommended |

**Response** (201):
```typescript
{
  user: { id, email, createdAt },
  access_token: string,
  refresh_token: string,
  expires_in: number
}
```

**Errors:**
- 409 `USER_ALREADY_EXISTS` — Email already registered
- 400 `VALIDATION_ERROR` — Invalid input

---

### Login

**POST** `/auth/login` (no auth required)

Authenticates user and returns tokens. Rate-limited to 5 attempts per 60 seconds.

| Field | Type | Required |
|-------|------|----------|
| email | string | yes |
| password | string | yes |

**Response** (200):
```typescript
{
  user: { id, email, createdAt },
  access_token: string,
  refresh_token: string,
  expires_in: number
}
```

**Errors:**
- 401 `INVALID_CREDENTIALS` — Wrong email or password
- 429 Too Many Requests — Rate limit exceeded

---

### Refresh Token

**POST** `/auth/refresh` (no auth required)

Issues a new access token using a valid refresh token.

**Request Body:**
```typescript
{ refresh_token: string }
```

**Response** (200):
```typescript
{
  access_token: string,
  refresh_token: string,
  expires_in: number
}
```

**Errors:**
- 401 `UNAUTHORIZED` — Invalid or expired refresh token

---

### Logout

**POST** `/auth/logout` (requires auth)

Revokes the refresh token.

**Response** (200):
```typescript
{ ok: true }
```

---

### Get Current User Profile

**GET** `/auth/profile` (requires auth)

Returns authenticated user profile without password field.

**Response** (200):
```typescript
{
  id: string,
  email: string,
  isActive: boolean,
  createdAt: Date,
  updatedAt: Date
  // password field excluded
}
```

**Errors:**
- 401 `UNAUTHORIZED` — Missing or invalid JWT

---

### Update User Profile

**PATCH** `/auth/profile` (requires auth)

Updates user profile information.

**Request Body:**
```typescript
{
  // See backend/src/modules/users/dto/update-profile.dto.ts
  // All fields optional
}
```

**Response** (200): User object (without password)

**Errors:**
- 400 `VALIDATION_ERROR` — Invalid input
- 401 `UNAUTHORIZED` — Invalid JWT

---

### Change Password

**POST** `/auth/change-password` (requires auth)

Changes authenticated user's password.

**Request Body:**
```typescript
{
  oldPassword: string,
  newPassword: string,
  confirmPassword: string
}
```

**Response** (200):
```typescript
{ message: "Password changed successfully" }
```

**Errors:**
- 400 `VALIDATION_ERROR` — Passwords don't match or don't meet requirements
- 401 `UNAUTHORIZED` — Invalid JWT or old password incorrect

---

## Products

All endpoints require JWT auth. Scoped to authenticated user.

File: `backend/src/modules/products/products.controller.ts` (7 endpoints)

### Create Product

**POST** `/products` (requires auth)

Creates a new product in user's catalog.

**Errors:**
- 402 `PRODUCT_LIMIT_EXCEEDED` — Free plan limit (5 products)
- 409 `PRODUCT_ALREADY_EXISTS` — Duplicate name

**Request Body:**
```typescript
{
  name: string,
  price_cents: number,        // in cents, min 1
  currency: string,           // e.g., "EUR"
  sku?: string,
  stock_quantity?: number,    // optional, for inventory
}
```

**Response** (201):
```typescript
{
  id: string,
  user_id: string,
  name: string,
  price_cents: number,
  currency: string,
  sku?: string,
  stock_quantity?: number,
  created_at: Date,
  updated_at: Date
}
```

---

### List Products

**GET** `/products`

Paginated list of user's products.

**Query Params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| limit | number | 10 | Max 1000 |
| offset | number | 0 | For pagination |
| sort | string | - | Sortable: `created_at`, `price_cents`, `name` |
| sortOrder | enum | DESC | ASC or DESC |

**Response** (200):
```typescript
{
  data: Product[],
  meta: { total: number, page: number, limit: number }
}
```

---

### Get Product by ID

**GET** `/products/:id`

Returns single product.

**Errors:**
- 404 `PRODUCT_NOT_FOUND`

**Response** (200): `Product`

---

### Update Product

**PATCH** `/products/:id`

Updates product details.

**Request Body:** Same fields as Create (all optional)

**Response** (200): `Product`

---

### Delete Product

**DELETE** `/products/:id`

Soft-deletes product.

**Response** (200):
```typescript
{ ok: true }
```

**Errors:**
- 404 `PRODUCT_NOT_FOUND`
- 400 — Product cannot be deleted

---

### Bulk Delete Products

**DELETE** `/products/bulk`

Soft-deletes multiple products in one call.

**Request Body:**
```typescript
{ ids: string[] }  // Array of product UUIDs
```

**Response** (200):
```typescript
{ deleted: number }
```

---

### Get Low Stock Products

**GET** `/products/low-stock`

Returns products below stock threshold.

**Query Params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| threshold | number | 10 | Stock level below this is "low" |
| limit | number | 50 | Max 100 results |

**Response** (200):
```typescript
Product[]
```

---

## Suppliers

All endpoints require JWT auth. Scoped to authenticated user.

File: `backend/src/modules/suppliers/suppliers.controller.ts` (5 endpoints)

### Create Supplier

**POST** `/suppliers`

Creates a new supplier.

**Request Body:**
```typescript
{
  // See backend/src/modules/suppliers/dto/create-supplier.dto.ts
}
```

**Response** (201): `Supplier`

---

### List Suppliers

**GET** `/suppliers`

Paginated list of user's suppliers.

**Query Params:** Same as Products (limit, offset, sort, sortOrder)

**Response** (200):
```typescript
{
  data: Supplier[],
  meta: { total: number, page: number, limit: number }
}
```

---

### Get Supplier by ID

**GET** `/suppliers/:id`

**Path Params:**
- `id` (string, UUID)

**Response** (200): `Supplier`

**Errors:**
- 404 `SUPPLIER_NOT_FOUND`

---

### Update Supplier

**PATCH** `/suppliers/:id`

Updates supplier details.

**Request Body:** Same fields as Create (all optional). See `backend/src/modules/suppliers/dto/update-supplier.dto.ts`

**Response** (200): `Supplier`

**Errors:**
- 404 `SUPPLIER_NOT_FOUND`

---

### Delete Supplier

**DELETE** `/suppliers/:id`

Soft-deletes supplier.

**Response** (200):
```typescript
{ ok: true }
```

**Errors:**
- 404 `SUPPLIER_NOT_FOUND`

---

## Recipients

All endpoints require JWT auth. Scoped to authenticated user.

File: `backend/src/modules/recipients/recipients.controller.ts` (5 endpoints)

### Create Recipient

**POST** `/recipients`

Adds new customer to user's recipient list.

**Request Body:**
```typescript
{
  name: string,
  email: string,              // unique per user
  address?: string,
  city?: string,
  postal_code?: string,
  country?: string,
}
```

**Response** (201): `Recipient`

**Errors:**
- 409 `RECIPIENT_ALREADY_EXISTS` — Email already registered for this user

---

### List Recipients

**GET** `/recipients`

Paginated list of user's recipients.

**Query Params:** Same as Products (limit, offset, sort, sortOrder)

**Response** (200):
```typescript
{
  data: Recipient[],
  meta: { total: number, page: number, limit: number }
}
```

---

### Get Recipient by ID

**GET** `/recipients/:id`

**Errors:**
- 404 `RECIPIENT_NOT_FOUND`

**Response** (200): `Recipient`

---

### Update Recipient

**PATCH** `/recipients/:id`

Updates recipient details.

**Request Body:** Same fields as Create (all optional)

**Response** (200): `Recipient`

---

### Delete Recipient

**DELETE** `/recipients/:id`

Soft-deletes recipient.

**Response** (200): `{ ok: true }`

---

## Orders

All endpoints require JWT auth. Scoped to authenticated user.

File: `backend/src/modules/orders/orders.controller.ts` (17 endpoints)

### Create Order

**POST** `/orders` (requires auth)

Creates new order. Supports idempotency via `Idempotency-Key` header.

**Headers:**

| Header | Type | Optional | Notes |
|--------|------|----------|-------|
| Idempotency-Key | string | yes | Valid for 24 hours; prevents duplicates |

**Request Body:**
```typescript
{
  recipient_id: string,       // UUID
  items: [
    {
      product_id: string,     // UUID
      quantity: number,       // min 1
      unit_price_cents: number, // in cents
    }
  ]
}
```

**Response** (201):
```typescript
{
  id: string,
  user_id: string,
  recipient_id: string,
  status: "draft",
  subtotal_cents: number,
  total_cents: number,
  currency: string,
  items: OrderItem[],
  created_at: Date,
  updated_at: Date
}
```

**Special Response Header:**
- `X-Idempotency-Replayed: true` — Returned from cache (HTTP 200 instead of 201)

**Errors:**
- 404 `RECIPIENT_NOT_FOUND` — Recipient doesn't exist
- 404 `PRODUCT_NOT_FOUND` — Product doesn't exist
- 402 `ORDER_MONTHLY_LIMIT_EXCEEDED` — Free plan limit (50 orders/month)

---

### List Orders

**GET** `/orders`

Paginated list of user's orders.

**Query Params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| limit | number | 10 | |
| offset | number | 0 | |
| sort | string | - | Sortable: `created_at`, `total_cents`, `status`, `recipient_name` |
| sortOrder | enum | DESC | ASC or DESC |
| status | enum | - | Filter: `draft`, `confirmed`, `cancelled` |
| minAmount | number | - | Min total in cents |
| maxAmount | number | - | Max total in cents |
| productId | string | - | Filter by product UUID |
| startDate | string | - | ISO date (e.g., 2026-01-01) |
| endDate | string | - | ISO date |

**Response** (200):
```typescript
{
  data: Order[],
  meta: { total: number, page: number, limit: number }
}
```

---

### Get Order by ID

**GET** `/orders/:id`

**Errors:**
- 404 `ORDER_NOT_FOUND`

**Response** (200): `Order`

---

### Update Order (DRAFT only)

**PATCH** `/orders/:id`

Modifies draft order. Cannot update once confirmed.

**Request Body:**
```typescript
{
  recipient_id?: string,
  items?: OrderItem[]
  // Only modifiable in DRAFT state
}
```

**Response** (200): `Order`

**Errors:**
- 400 `ORDER_CANNOT_BE_MODIFIED` — Order is not DRAFT

---

### Confirm Order

**PATCH** `/orders/:id/confirm`

Locks order, prevents further edits. Required before generating receipt.

**Response** (200): `Order` (status updated to `confirmed`)

**Errors:**
- 400 `ORDER_ALREADY_CONFIRMED` — Already confirmed
- 400 `ORDER_CANNOT_BE_MODIFIED` — In cancelled state

---

### Cancel Order

**PATCH** `/orders/:id/cancel`

Soft-deletes order (marks as cancelled).

**Response** (200): `Order` (status updated to `cancelled`)

**Errors:**
- 400 `ORDER_ALREADY_CANCELLED` — Already cancelled

---

### Delete Order

**DELETE** `/orders/:id`

Deletes an order.

**Path Params:**
- `id` (string, UUID)

**Response** (200):
```typescript
{ ok: true }
```

**Errors:**
- 404 `ORDER_NOT_FOUND`
- 400 — Order cannot be deleted

---

### Batch Approve Orders

**POST** `/orders/batch-approve`

Confirms multiple draft orders in one call.

**Request Body:**
```typescript
{
  orderIds: string[]  // Array of order UUIDs
}
```

**Response** (200):
```typescript
{ approved: number }
```

**Errors:**
- 400 `BATCH_ORDERS_NOT_ALL_DRAFT` — Some orders not in DRAFT state

---

### Batch Delete Orders

**POST** `/orders/batch-delete`

Soft-deletes multiple orders.

**Request Body:**
```typescript
{
  orderIds: string[]
}
```

**Response** (200):
```typescript
{ deleted: number }
```

---

### Dashboard Metrics

File: `backend/src/modules/orders/orders.controller.ts` — dashboard routes (7 of 17 total)

#### Daily Revenue (Sparkline Data)

**GET** `/orders/dashboard/daily-revenue`

Time-series revenue data for sparkline/chart (last N days).

**Query Params:**
- `days` (number, optional) — Number of days to retrieve. Default: 7. Max: 365.

**Response** (200):
```typescript
[
  {
    date: string,          // ISO date, e.g., "2026-08-20"
    revenue_cents: number
  }
]
```

---

#### Order Status Summary

**GET** `/orders/dashboard/status-summary`

Count of orders in each status (draft/confirmed/cancelled).

**Response** (200):
```typescript
{
  draft: number,
  confirmed: number,
  cancelled: number
}
```

---

#### Revenue by Products

**GET** `/orders/dashboard/revenue-by-products`

Revenue breakdown by product across all orders.

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional)

**Response** (200):
```typescript
[
  {
    product_id: string,
    product_name: string,
    revenue_cents: number,
    order_count: number
  }
]
```

---

#### Revenue by Recipients

**GET** `/orders/dashboard/revenue-by-recipients`

Revenue breakdown by customer (recipient).

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional)

**Response** (200):
```typescript
[
  {
    recipient_id: string,
    recipient_name: string,
    revenue_cents: number,
    order_count: number
  }
]
```

---

#### Total Revenue

**GET** `/orders/dashboard/total-revenue`

All-time or date-range total revenue.

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional)

**Response** (200): See `backend/src/modules/orders/dto/dashboard-response.dto.ts` TotalRevenueDto
```typescript
{
  total_cents: number,
  currency: string
}
```

---

#### Turnover by Products

**GET** `/orders/dashboard/turnover-by-products`

Product quantity/count breakdown (complement to revenue).

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional)

**Response** (200): See `backend/src/modules/orders/dto/dashboard-response.dto.ts` TurnoverByProductDto[]

---

#### Turnover by Recipients

**GET** `/orders/dashboard/turnover-by-recipients`

Order count breakdown by customer.

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional)

**Response** (200): See `backend/src/modules/orders/dto/dashboard-response.dto.ts` TurnoverByRecipientDto[]

---

#### Total Turnover

**GET** `/orders/dashboard/total-turnover`

Total order count (optionally date-filtered).

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional)

**Response** (200): See `backend/src/modules/orders/dto/dashboard-response.dto.ts` TotalTurnoverDto

---

## Receipts

Primary receipt management. All endpoints require JWT auth unless noted. Scoped to authenticated user.

File: `backend/src/modules/receipts/receipts.controller.ts` (13 endpoints)

### Create Receipt (Default Template)

**POST** `/receipts/orders/:orderId/receipt`

Generates PDF receipt/invoice for confirmed order using user's default template. Generation is asynchronous.

**Path Params:**
- `orderId` (string, UUID) — Order to generate receipt for

**Response** (201):
```typescript
{
  id: string,
  order_id: string,
  user_id: string,
  status: "pending",      // Job queued; transitions to "generating" → "generated"
  pdf_url: null,          // Populated when generation completes
  progress: 0,            // 0-100
  created_at: Date,
  updated_at: Date
}
```

**Errors:**
- 404 `ORDER_NOT_FOUND` — Order doesn't exist or not confirmed
- 409 `RECEIPT_ALREADY_EXISTS` — Receipt already generated for this order
- 402 `TEMPLATE_PLAN_RESTRICTED` — Template not allowed on user's plan

**Note:** Monitor progress via WebSocket `/receipts/progress/:userId` or poll `/receipts/:id`.

---

### Create Compact Receipt

**POST** `/receipts/orders/:orderId/receipt/compact`

Forces compact template regardless of user's template setting.

**Path Params:**
- `orderId` (string, UUID)

**Response** (201): `Receipt` (same shape as Create Receipt)

**Errors:**
- 404 `ORDER_NOT_FOUND`
- 409 `RECEIPT_ALREADY_EXISTS`
- 402 `TEMPLATE_PLAN_RESTRICTED`

---

### Create Standard Receipt

**POST** `/receipts/orders/:orderId/receipt/standard`

Forces standard template regardless of user's template setting.

**Path Params:**
- `orderId` (string, UUID)

**Response** (201): `Receipt`

**Errors:**
- 404 `ORDER_NOT_FOUND`
- 409 `RECEIPT_ALREADY_EXISTS`
- 402 `TEMPLATE_PLAN_RESTRICTED`

---

### List Receipts

**GET** `/receipts`

Paginated list of all user's generated receipts.

**Query Params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| offset | number | 0 | |
| limit | number | 10 | |

**Response** (200):
```typescript
{
  data: Receipt[],
  meta: { total: number, page: number, limit: number }
}
```

---

### Get Receipt by ID

**GET** `/receipts/:id`

Retrieves receipt metadata and current status.

**Path Params:**
- `id` (string, UUID)

**Response** (200): `Receipt`

**Errors:**
- 404 `RECEIPT_NOT_FOUND`

---

### Get Receipt PDF

**GET** `/receipts/:id/pdf`

Downloads receipt as PDF file.

**Path Params:**
- `id` (string, UUID)

**Response** (200): Binary PDF file
- Content-Type: application/pdf
- Content-Disposition: inline

**Errors:**
- 404 `RECEIPT_NOT_FOUND`
- 400 — PDF file is not a valid PDF

---

### Print Receipt to Printer

**POST** `/receipts/:id/print`

Sends generated receipt to physical printer.

**Path Params:**
- `id` (string, UUID)

**Query Params:**
- `printer` (string, optional) — Printer name; defaults to system default

**Response** (200):
```typescript
{ ok: true }
```

**Errors:**
- 404 `RECEIPT_NOT_FOUND`
- 500 `RECEIPT_PRINT_FAILED` — Printer offline or error

---

### Get Available Printers

**GET** `/receipts/printers`

Lists connected receipt printers (if configured).

**Response** (200):
```typescript
[
  {
    name: string,
    status: string     // "ready", "offline", etc.
  }
]
```

---

### Void Receipt

**POST** `/receipts/:id/void`

Voids a receipt and unlocks its order for editing.

**Path Params:**
- `id` (string, UUID)

**Request Body:**
```typescript
{ reason: string }  // Required: reason for voiding
```

**Response** (200): `Receipt` (status updated)

**Errors:**
- 404 `RECEIPT_NOT_FOUND`
- 400 `RECEIPT_IS_ALREADY_VOIDED`

---

### Regenerate Receipt PDF

**POST** `/receipts/:id/regenerate`

Forces re-generation of receipt PDF from current order and settings.

**Path Params:**
- `id` (string, UUID)

**Response** (200): `Receipt`

**Errors:**
- 404 `RECEIPT_NOT_FOUND`
- 500 — PDF generation error

---

### Generate Test Receipt Preview

**POST** `/receipts/test-preview`

Generates a test PDF using current user's settings (no order required).

**Response** (200): Binary PDF file
- Content-Type: application/pdf
- Inline preview of how receipts will look

**Errors:**
- 500 — PDF generation error

---

### Generate Public Share Link

**POST** `/receipts/:id/share`

Creates a public token allowing unauthenticated access to receipt PDF.

**Path Params:**
- `id` (string, UUID)

**Response** (200):
```typescript
{
  token: string,           // Share token
  public_url: string,      // Full public URL to view PDF
  expires_at?: Date
}
```

**Errors:**
- 404 `RECEIPT_NOT_FOUND`

---

### Revoke Public Share Link

**POST** `/receipts/:id/share/revoke`

Disables public access to receipt.

**Path Params:**
- `id` (string, UUID)

**Response** (200):
```typescript
{ message: "Public link revoked" }
```

**Errors:**
- 404 `RECEIPT_NOT_FOUND`

---

## Subscription & Billing

All endpoints require JWT auth.

File: `backend/src/modules/subscription/subscription.controller.ts` (3 endpoints)

### Get Subscription Status

**GET** `/subscription/status`

Returns current plan and usage metrics.

**Response** (200):
```typescript
{
  plan: "free" | "pro" | "business",
  usage: {
    productsCount: number,
    ordersThisMonth: number
  },
  limits: {
    maxProducts: number | null,       // null = unlimited
    maxOrdersPerMonth: number | null,
    allowedTemplates: string[]
  },
  paddleStatus: string | null,        // "active", "trialing", etc. (if subscribed)
  currentPeriodEnd: string | null,    // ISO date (if subscribed)
  hasPaddleSubscription: boolean
}
```

---

### Create Checkout Transaction (Paddle)

**POST** `/subscription/checkout`

Initiates Paddle checkout for plan upgrade.

**Request Body:**
```typescript
{
  plan: "pro" | "business"
}
```

**Response** (200):
```typescript
{
  transaction_id: string,
  checkout_url: string    // Redirect user here
}
```

---

### Get Customer Portal URL (Paddle)

**POST** `/subscription/portal`

Generates URL for Paddle customer portal (manage billing, cancel, etc.).

**Response** (200):
```typescript
{
  portal_url: string      // Redirect user here
}
```

---

## Settings

All endpoints require JWT auth. Scoped to authenticated user.

File: `backend/src/modules/settings/settings.controller.ts` (26 endpoints)

### Receipt Design & Template

#### Get Receipt Design Settings

**GET** `/settings/receipt-design`

Returns current receipt customization settings.

**Response** (200): See `backend/src/modules/settings/dto/settings-response.dto.ts` ReceiptDesignResponseDto

---

#### Get Available Templates

**GET** `/settings/templates`

Lists all receipt templates available to user (filtered by plan).

**Response** (200):
```typescript
[
  {
    id: string,              // "standard", "compact", etc.
    name: string,
    description: string,
    category: string,
    features: string[],
    colors: string[],
    locked: boolean          // True if not allowed by current plan
  }
]
```

---

#### Get Template Setting

**GET** `/settings/template`

Returns user's currently selected template ID.

**Response** (200):
```typescript
{ data: { templateId: string } }
```

---

#### Set Template

**POST** `/settings/template`

Updates user's template selection. Validates against subscription plan.

**Request Body:**
```typescript
{ templateId: string }
```

**Response** (200):
```typescript
{ message: "Template setting updated successfully" }
```

**Errors:**
- 402 `TEMPLATE_PLAN_RESTRICTED` — Template not allowed on current plan

---

### Receipt Text & Display

#### Get Receipt Title

**GET** `/settings/receipt-title`

Returns current receipt title (e.g., "Invoice", "Receipt", "Proforma").

**Response** (200):
```typescript
{ data: { title: string } }
```

---

#### Update Receipt Title

**POST** `/settings/receipt-title`

Sets custom receipt title.

**Request Body:**
```typescript
{ title: string }
```

**Response** (200):
```typescript
{ message: "Receipt title updated successfully" }
```

---

#### Get Template Language

**GET** `/settings/template-language`

Returns current receipt template language.

**Response** (200):
```typescript
{ data: { language: string } }  // e.g., "en", "ru", "uk"
```

---

#### Update Template Language

**POST** `/settings/template-language`

Sets template rendering language.

**Request Body:**
```typescript
{ language: string }
```

**Response** (200):
```typescript
{ message: "Template language updated successfully" }
```

---

#### Get Footer Title

**GET** `/settings/footer-title`

Returns footer title text (appears at bottom of receipt).

**Response** (200):
```typescript
{ data: { footerTitle: string } }
```

---

#### Update Footer Title

**POST** `/settings/footer-title`

Sets footer title text.

**Request Body:**
```typescript
{ footerTitle: string }
```

**Response** (200):
```typescript
{ message: "Footer title updated successfully" }
```

---

#### Get Footer Subtitle

**GET** `/settings/footer-subtitle`

Returns footer subtitle/tagline.

**Response** (200):
```typescript
{ data: { footerSubtitle: string } }
```

---

#### Update Footer Subtitle

**POST** `/settings/footer-subtitle`

Sets footer subtitle.

**Request Body:**
```typescript
{ footerSubtitle: string }
```

**Response** (200):
```typescript
{ message: "Footer subtitle updated successfully" }
```

---

### Visual Customization

#### Get Primary Color

**GET** `/settings/primary-color`

Returns primary accent color used in receipt design.

**Response** (200):
```typescript
{ data: { primaryColor: string } }  // hex format, e.g., "#2563EB"
```

---

#### Update Primary Color

**POST** `/settings/primary-color`

Sets primary accent color for receipt.

**Request Body:**
```typescript
{ primaryColor: string }  // Must be valid hex: #RRGGBB
```

**Response** (200):
```typescript
{ message: "Primary color updated successfully" }
```

**Errors:**
- 400 `VALIDATION_ERROR` — Invalid hex color format

---

#### Upload Logo

**POST** `/settings/logo/upload`

Uploads company logo (replaces existing). File stored in Object Storage.

**Request:** Multipart form data
- `logo` (file) — Image file (JPG, PNG, GIF, SVG)
  - Max size: 5 MB
  - Validated by MIME type

**Response** (200):
```typescript
{
  message: string,
  filename: string,           // e.g., "logo-{userId}.png"
  originalName: string,
  size: number,               // bytes
  url: string,                // Object Storage URL
  userId: string
}
```

**Errors:**
- 400 — File format not supported (not image/*)
- 413 — File too large (> 5 MB)
- 500 `FILE_UPLOAD_FAILED` — Storage error

---

#### Get Logo

**GET** `/settings/logo`

Retrieves user's uploaded logo as image file.

**Response** (200): Binary image file
- Content-Type: image/png
- Cached for 1 hour (Cache-Control: public, max-age=3600)

**Errors:**
- 404 — Logo not found

---

#### Check Logo Exists

**GET** `/settings/logo/exists`

Checks if user has an uploaded logo.

**Response** (200):
```typescript
{
  hasLogo: boolean,
  userId: string,
  message: string
}
```

---

#### Delete Logo

**POST** `/settings/logo/delete`

Removes user's logo.

**Response** (200):
```typescript
{
  message: "Logo deleted successfully",
  userId: string
}
```

**Errors:**
- 500 `FILE_DELETE_FAILED` — Storage error

---

### Business Information

#### Get Company Info

**GET** `/settings/company-info`

Returns all company/business information.

**Response** (200): See `backend/src/modules/settings/dto/settings-response.dto.ts` CompanyInfoResponseDto
- companyName, companyAddress, companyEmail, companyPhone
- companyTaxId, companyIban, companySwift, companyWebsite, companyTagline

---

#### Update Company Info

**POST** `/settings/company-info`

Updates company details (all fields optional).

**Request Body:**
```typescript
{
  companyName?: string,
  companyAddress?: string,
  companyEmail?: string,
  companyPhone?: string,
  companyTaxId?: string,
  companyIban?: string,
  companySwift?: string,
  companyWebsite?: string,
  companyTagline?: string
}
```

**Response** (200):
```typescript
{ message: "Company information updated successfully" }
```

---

### Terms & Conditions

#### Get Payment Terms

**GET** `/settings/payment-terms`

Returns payment terms text (shown on receipts).

**Response** (200):
```typescript
{ data: { paymentTerms: string } }
```

---

#### Update Payment Terms

**POST** `/settings/payment-terms`

Sets payment terms (max 500 chars).

**Request Body:**
```typescript
{ paymentTerms: string }
```

**Response** (200):
```typescript
{ message: "Payment terms updated successfully" }
```

**Errors:**
- 400 `VALIDATION_ERROR` — Must be string, max 500 chars

---

#### Get Delivery Terms

**GET** `/settings/delivery-terms`

Returns delivery terms text.

**Response** (200):
```typescript
{ data: { deliveryTerms: string } }
```

---

#### Update Delivery Terms

**POST** `/settings/delivery-terms`

Sets delivery terms (max 500 chars).

**Request Body:**
```typescript
{ deliveryTerms: string }
```

**Response** (200):
```typescript
{ message: "Delivery terms updated successfully" }
```

**Errors:**
- 400 `VALIDATION_ERROR` — Must be string, max 500 chars

---

### Onboarding

#### Get Onboarding Status

**GET** `/settings/onboarding-status`

Returns whether user has completed initial onboarding.

**Response** (200):
```typescript
{ data: { completed: boolean } }
```

---

#### Complete Onboarding

**POST** `/settings/onboarding-complete`

Marks onboarding as complete.

**Response** (200):
```typescript
{ data: { completed: true } }
```

---

## Public Receipts

No authentication required. Public access via share tokens.

File: `backend/src/modules/receipts/public-receipts.controller.ts` (2 endpoints)

### Get Public Receipt Data

**GET** `/public/receipts/:token`

Retrieves receipt data using public share token (no auth).

**Path Params:**
- `token` (string) — Public share token from `/receipts/:id/share`

**Response** (200): Receipt metadata

**Errors:**
- 404 — Receipt not found or share link revoked
- Rate limited to 20 requests/min per IP

---

### Download Public Receipt PDF

**GET** `/public/receipts/:token/pdf`

Downloads receipt PDF using public share token (no auth).

**Path Params:**
- `token` (string)

**Response** (200): Binary PDF file
- Content-Type: application/pdf
- Content-Disposition: inline

**Errors:**
- 404 — Receipt not found or share link revoked
- Rate limited to 20 requests/min per IP

---

## Test & Development Endpoints

**DEV/TEST-ONLY** — Do not rely on these in production. Subject to change.

File: `backend/src/modules/receipts/controllers/pdf-test.controller.ts` (3 endpoints)

These endpoints are guarded by JWT auth but exist purely for development and testing receipt templates.

### Generate Test PDF (GET)

**GET** `/pdf-test/generate-test-pdf`

Generates test PDF with sample data (development only).

**Query Params:**
- `template` (string, optional) — Template ID: "standard", "compact", etc. Default: "standard"
- `logo` (boolean, optional) — Include sample logo. Default: false
- `language` (string, optional) — Language code: "en", "ru", "uk". Default: "en"

**Response** (200): Binary PDF file

**Valid Templates:** standard, compact, elegant, minimal, classic, modern

**Valid Languages:** en, ru, uk

---

### Generate Test PDF (POST)

**POST** `/pdf-test/generate-test-pdf`

Generates test PDF with sample data (development only).

**Request Body:**
```typescript
{
  template?: string,    // "standard", "compact", etc.
  withLogo?: boolean,
  language?: string     // "en", "ru", "uk"
}
```

**Response** (200): Binary PDF file

---

### Preview Template (GET)

**GET** `/pdf-test/preview-template`

Renders template as HTML (no PDF) for quick testing.

**Query Params:**
- `template` (string, optional)
- `logo` (boolean, optional)
- `language` (string, optional)

**Response** (200): HTML document
- Content-Type: text/html

---

## Webhooks

### Paddle Billing Webhook

**POST** `/paddle/webhook` (no API prefix; no auth required)

Inbound webhook from Paddle billing platform. Signature-verified.

**Headers:**
- `paddle-signature` (required) — HMAC-SHA256 signature
  - Secret: `PADDLE_WEBHOOK_SECRET` env var

**Request Body:** Paddle Event
- `type` — Event type, e.g., "subscription.created", "subscription.updated", "subscription.canceled"
- `data` — Event-specific payload

**Response** (200):
```typescript
{ ok: true }
```

**Signature Verification Failure:**
- 400 `Bad Request` — Missing or invalid signature (do not retry)

**Rate Limiting:**
- 60 requests/min per endpoint

**Events Handled:**
- `subscription.created` — User upgraded plan
- `subscription.updated` — Billing cycle changed
- `subscription.canceled` — User cancelled subscription

**See Also:** See `backend/src/modules/paddle/paddle.service.ts` for event handling logic.

---

### Telegram Bot Webhook

**POST** `/tg/webhook` (no API prefix; no auth required)

Inbound webhook from Telegram Bot API.

**Headers:**
- `x-telegram-bot-api-secret-token` (optional) — Webhook secret token
  - Secret: `TELEGRAM_WEBHOOK_SECRET` env var (optional)

**Request Body:** Telegram Update
```typescript
{
  update_id: number,
  message?: { /* Telegram Message object */ },
  // ... other update fields
}
```

**Response** (200):
```typescript
{ ok: true }
```

**Signature Verification Failure (if secret configured):**
- 403 `Forbidden` — Invalid or missing secret token

**Note:** The Telegram module is for bot integration and messaging; exact functionality depends on `TelegramService` implementation. See `backend/src/modules/telegram/telegram.service.ts`.

---

## Health & Utility

### Health Check

**GET** `/health`

No auth required. Returns API status.

**Response** (200):
```typescript
{
  status: "ok",
  timestamp: Date
}
```

---

## Error Response Format

All errors follow this shape:

```typescript
{
  error: string,      // User-friendly message (no SQL, stack traces, or internals)
  errorCode: string   // Machine-readable code (e.g., "ORDER_NOT_FOUND", "PRODUCT_LIMIT_EXCEEDED")
}
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Resource created |
| 400 | Bad request (validation error, invalid state transition) |
| 401 | Unauthorized (invalid/missing JWT) |
| 402 | Payment required (plan limit exceeded, feature restricted) |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict (duplicate, state error) |
| 429 | Too many requests (rate limited) |
| 500 | Internal server error |

---

## Pagination

All list endpoints return paginated results:

```typescript
{
  data: T[],
  meta: {
    total: number,   // Total records matching filter
    page: number,    // For convenience (computed from offset/limit)
    limit: number    // Records per page
  }
}
```

**Defaults:** `limit: 10, offset: 0`

**Max limit:** `1000`

To fetch next page: `offset = current_offset + limit`

---

## Rate Limiting

- Global: 30 requests per 60 seconds per IP
- Auth endpoints (login/register): 5 requests per 60 seconds per IP
- Paddle webhook: 60 requests per 60 seconds (per webhook endpoint)

Returns 429 (Too Many Requests) when limit exceeded.

---

## WebSocket (Receipt Generation Progress)

**Connection:** `ws://localhost:3000/receipts/progress/:userId`

**Auth:** Pass JWT in query string: `?token=<access_token>`

**Events:**

### progress

Emitted during receipt generation:

```typescript
{
  receiptId: string,
  orderId: string,
  progress: number,    // 0-100
  stage: string        // "generating_pdf", "uploading_s3", "done", etc.
}
```

### error

Emitted if generation fails:

```typescript
{
  receiptId: string,
  error: string
}
```

---

## See Also

- [backend-patterns.md](./backend-patterns.md) — How to extend the API
- [business-logic.md](./business-logic.md) — Domain rules and flows
- [frontend.md](./frontend.md) — Frontend client documentation (peer agent)
