# API Reference

**Last Updated:** 2026-11-08

**Total Endpoints:** 113 routes across 17 controllers; 112 are in the OpenAPI contract (the signed Paddle webhook is excluded from Swagger). This reference covers all controllers exhaustively.

ReceiptMaster API follows REST conventions. All endpoints require JWT authentication (Bearer token) unless noted otherwise.

**Base URL:** `http://localhost:3000/api/v1` (in development; configure via `API_PREFIX` env var)

**API Docs:** `{BASE_URL}/docs` (interactive Swagger UI)

**Contract:** `backend/openapi.json` is generated from the controllers (`yarn openapi:export` in `backend/`; paths there have no `API_PREFIX`). CI's `contract-test` job fails when the committed file differs from the code or a routed handler is undocumented, then generates the frontend types from it and type-checks the frontend. Zod-validated bodies, the JSON/multipart document draft envelope, success bodies and `{ error, errorCode }` failures are documented for the document-config, preset, preview and receipt create/regenerate routes; receipt list/get/void/share/revoke document their projected bodies. POST handlers without `@HttpCode` answer 201 (Nest's default) and are documented that way; only the Telegram and Paddle webhooks set 200 explicitly. These 13 routes were missing from the contract until 2026-10-29: `GET /products/stock-value`, `GET`/`POST /settings/auto-receipt`, `POST /settings/footer`, `GET`/`PUT /settings/document-config`, `GET`/`POST /settings/document-presets`, `GET`/`PUT`/`DELETE /settings/document-presets/:id`, `POST /receipts/preview`, `GET /billing/config`. The Telegram webhook (`tg/webhook`) stays documented as a regular operation.

---

## Authentication

### Register User

**POST** `/auth/register` (no auth required)

Creates a new user account.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| email | string | yes | Must be unique. Trimmed and lowercased before validation, so `A@x.com` and `a@x.com` are one account; login accepts any casing (also for older accounts stored with capitals). The same applies to `POST /auth/login` and profile email updates |
| password | string | yes | Min 8 characters (`MIN_PASSWORD_LENGTH`, `users/dto/password-policy.ts`). Login still accepts shorter input so accounts created under the old minimum of 6 can sign in; changing a password requires 8+ for the new one only |

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
- 401 `INVALID_CREDENTIALS` — Wrong email or password
- 429 Too Many Requests — Rate limit exceeded

---

### Refresh Token

**POST** `/auth/refresh` (no auth required)

Issues a new access token using a valid stored opaque refresh token. `refresh_token` must be a
string of exactly 128 lowercase hexadecimal characters; malformed bodies return 400 before token
lookup, and invalid/expired tokens return 401. Logout uses the same validated request body.

A refresh token is **single use**. Redeeming it and storing its successor commit together: of
concurrent requests with the same token exactly one gets 201 and the others get the same 401
`UNAUTHORIZED` body as an unknown token; if storing the successor fails, nothing is redeemed and
the old token still works. An expired token is rejected and left as it is, and so is the token of
a deactivated user (`isActive = false`).

**Reuse detection.** Every successor belongs to the rotation family its login started. A redeemed
token presented again within 30 s of its redemption is treated as a lost race between tabs (or a
retry) and only gets the 401; presented later, the 401 also revokes every live token of that family
(the session that kept rotating has to log in again; other logins of the user are unaffected).

Throttled to 20 requests per 60 s per client IP (429). Tokens issued from this release on are
stored as SHA-256 only; tokens issued earlier keep their stored plaintext until they expire (30 days).

**Request Body:**
```typescript
{ refresh_token: string }
```

**Response** (201):
```typescript
{
  access_token: string,
  refresh_token: string,
  user: { id: string; email: string }
}
```

**Errors:**
- 400 — Malformed/missing refresh token
- 401 `UNAUTHORIZED` — Unknown, expired, already redeemed or replayed refresh token, or inactive user
- 429 — More than 20 refreshes in 60 s from this client IP

---

### Logout

**POST** `/auth/logout` (requires auth)

Revokes the refresh token. A logged-out token presented later gets a plain 401; only a token that
a refresh already redeemed counts as a replay.

**Response** (201):
```typescript
{ message: "Logged out successfully" }
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

Changes authenticated user's password and, in the same transaction, revokes all of the user's
refresh tokens — including the successor of a refresh that is committing at the same moment.

**Request Body:**
```typescript
{
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
}
```

**Response** (201):
```typescript
{ message: "Password changed successfully" }
```

**Errors:**
- 400 `VALIDATION_ERROR` — with an English detail: "New password and confirmation do not match", "Current password is incorrect" (field `currentPassword`) or "New password must be different from the current one"
- 401 `UNAUTHORIZED` — Invalid JWT

---

## Products

All endpoints require JWT auth. Scoped to authenticated user.

File: `backend/src/modules/products/products.controller.ts` (8 endpoints)

### Create Product

**POST** `/products` (requires auth)

Creates a new product in user's catalog. Supports idempotency via `Idempotency-Key`.

**Headers:**

| Header | Type | Optional | Notes |
|--------|------|----------|-------|
| Idempotency-Key | string | yes | 1–255 visible ASCII characters (400 `VALIDATION_ERROR` otherwise); valid for 24 hours |

**Idempotency (since 2026-10-29):** within 24 hours a repeated key from the same user creates
nothing and answers 201 with the first response's body plus `X-Idempotency-Replayed: true`, also
when two requests with the key arrive at once (they are serialized on the key) and also once the
plan's product limit has been reached (the key is checked before the quota). Only successful creates
are stored: a refused or failed create is run again on retry. A repeated key with a *different* body
still replays the first response — the client then PATCHes the difference. Without the header the
route behaves as before. The key is stored as `product:` + SHA-256 of the key in `idempotency_keys`,
so it never collides with an order or recipient key of the same value.

**Errors:**
- 400 `VALIDATION_ERROR` — Invalid `Idempotency-Key`
- 402 `PRODUCT_LIMIT_EXCEEDED` — Plan product limit reached (free: 10, pro: 100). The count excludes
  soft-deleted products and is taken in the insert's transaction under a per-tenant lock, so two
  creates racing for the last slot get one 201 and one 402; a rolled-back create frees its slot.
- 409 `PRODUCT_ALREADY_EXISTS` — Another live (not soft-deleted) product of this user has exactly
  this name. The partial unique index decides, so of two racing creates one gets 201 and the other
  409; a refused create stores no `Idempotency-Key` response, so a retry is checked again

**Request Body:**
```typescript
{
  name: string,                  // trimmed, non-empty, max 255
  purchase_price_cents: number,  // integer cents, 0 to 2147483647
  sale_price_cents: number,      // integer cents, 0 to 2147483647
  quantity: number,              // 0 to 2147483647 (Postgres integer)
  currency: string,              // enum, e.g. "UAH"
  supplier_id?: string | null,   // UUID
}
```

**Response** (201):
```typescript
{
  id: string,
  user_id: string,
  name: string,
  purchase_price_cents: number,
  sale_price_cents: number,
  quantity: number,
  currency: string,
  supplier_id: string | null,
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
| sortBy | string | `created_at` | Sortable: `name`, `purchase_price_cents`, `sale_price_cents`, `quantity`, `created_at` |
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
- 400 — `:id` is not a UUID (same on `PATCH` and `DELETE`; it was a database error, 500)
- 404 `PRODUCT_NOT_FOUND`

**Response** (200): `Product`

---

### Update Product

**PATCH** `/products/:id`

Updates only the fields present in the body (`UpdateProductDto`): `name`, `purchase_price_cents`,
`sale_price_cents`, `currency`, `supplier_id` (`null` clears it), and stock as a precondition write.
Absent fields are left untouched, so a rename never overwrites stock that orders changed meanwhile.

**Stock contract:** `quantity` must be sent together with `expectedQuantity` (integer ≥ 0, the stock
the client last saw) and vice versa. The update is one conditional statement that applies only while
the stored quantity still equals `expectedQuantity`; a request parked behind an order's row lock
re-checks after that order commits. Nothing in the body is saved on a mismatch.

```typescript
{ name: "Renamed" }                          // rename only, stock untouched
{ quantity: 15, expectedQuantity: 8 }        // set stock to 15 if it is still 8
```

**Response** (200): the re-read `Product`; an empty body changes nothing and returns it.

**Errors:**
- 400 `VALIDATION_ERROR` — `quantity` without `expectedQuantity` or vice versa (class-validator
  errors such as a negative or fractional `expectedQuantity` return 400 `HTTP_EXCEPTION`)
- 404 `PRODUCT_NOT_FOUND` — Missing, soft-deleted or another tenant's product
- 409 `PRODUCT_QUANTITY_CONFLICT` — Stock no longer equals `expectedQuantity`; reload with
  `GET /products/:id` and resend against the current value. **Compatibility change (2026-10-29):**
  a client sending `quantity` alone now gets 400 instead of a blind overwrite.
- 409 `PRODUCT_ALREADY_EXISTS` — The new `name` belongs to another live product; nothing is saved

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

**GET** `/products/stock-value`

Aggregate worth of everything currently in stock for the authenticated user, at
both cost and retail price. Soft-deleted products are excluded. All products share
one currency (UAH), so a single total is returned.

**Response** (200):
```typescript
{
  currency: "UAH";
  purchaseValueCents: number; // Σ quantity × purchase_price_cents
  saleValueCents: number;     // Σ quantity × sale_price_cents
  totalUnits: number;         // Σ quantity
  productCount: number;       // non-deleted products
}
```

---

## Suppliers

All endpoints require JWT auth. Scoped to authenticated user.

File: `backend/src/modules/suppliers/suppliers.controller.ts` (5 endpoints)

**Supplier ↔ product link.** A product has at most one supplier, stored in `products.supplier_id` (set via `POST/PATCH /products` with `supplier_id`). `Supplier.products` and `product_count` are that link read from the supplier's side; there is no `productIds` on the supplier endpoints (it is ignored if sent). The old `supplier_products` join table is no longer mapped; migration `BackfillProductSupplierFromJoinTable1792500000000` copied its rows into `supplier_id` (oldest supplier wins for a product linked to several) and left the table in place for a later cleanup migration.

### Create Supplier

**POST** `/suppliers`

Creates a new supplier.

**Request Body:**
```typescript
{
  name: string,               // trimmed, non-empty, max 255
  email?: string,             // lowercased, max 255
  phone?: string,             // digits, spaces and + ( ) . - only, max 50
  address?: string,
  contactPerson?: string,     // max 255
  notes?: string,
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

Adds new customer to user's recipient list. Supports idempotency via `Idempotency-Key`.

**Headers:**

| Header | Type | Optional | Notes |
|--------|------|----------|-------|
| Idempotency-Key | string | yes | 1–255 visible ASCII characters (400 `VALIDATION_ERROR` otherwise); valid for 24 hours |

Same replay semantics as **Create Product** (24 hours, 201 + `X-Idempotency-Replayed: true`,
concurrent repeats create one recipient, only successful creates are stored; stored key
`recipient:` + SHA-256). Without the header the route behaves as before.

**Request Body:**
```typescript
{
  name: string,               // trimmed, non-empty, max 255
  email?: string,             // normalised to lowercase, max 255, unique per user (case-insensitive)
  phone?: string,             // digits, spaces and + ( ) . - only, max 50
  address?: string,           // max 1000
  legal_name?: string,        // max 255; counterparty requisites below are all optional
  tax_id?: string,            // 8 digits (ЄДРПОУ) or 10 digits (РНОКПП); checksum not verified
  tax_id_kind?: "edrpou" | "rnokpp", // derived from the tax_id length when omitted
  iban?: string,              // UA + 27 digits, mod-97 checked; spaces/NBSP/case normalised, stored compact
  bank_name?: string,         // max 200
  legal_address?: string,     // max 1000
  city?: string,
  postal_code?: string,
  country?: string,
}
```

**Response** (201): `Recipient`

**Errors:**
- 400 `VALIDATION_ERROR` — Invalid `Idempotency-Key`
- 409 `RECIPIENT_ALREADY_EXISTS` — Email already registered for this user
- 400 validation errors — blank name, over-long values, malformed phone or email, invalid IBAN or tax ID
- 400 `VALIDATION_ERROR` — `tax_id_kind` that disagrees with the `tax_id` length, or a kind without a `tax_id`

---

### List Recipients

**GET** `/recipients`

Paginated list of user's recipients.

**Query Params:** `limit`, `offset`, `search` (name, email or phone contains), `sortOrder`, and `sortBy`: `name`, `email`, `phone`, `created_at` (default), `order_count` or `total_spent_cents`. The last two sort by the aggregates every row carries (confirmed orders only). Ties fall back to newest first, then id, so paging is stable.

**Response** (200):
```typescript
{
  data: (Recipient & { order_count: number, total_spent_cents: number })[],
  total: number, offset: number, limit: number
}
```

---

### Get Recipient by ID

**GET** `/recipients/:id`

**Errors:**
- 400 — `:id` is not a UUID (same on `PATCH` and `DELETE`)
- 404 `RECIPIENT_NOT_FOUND`

**Response** (200): `Recipient`

---

### Update Recipient

**PATCH** `/recipients/:id`

Updates recipient details.

**Request Body:** Same fields as Create (all optional); `null` clears `email`, `phone`, `address` or any
requisite (`legal_name`, `tax_id`, `iban`, `bank_name`, `legal_address`); the onboarding wizard sends
only changed fields this way. A new `tax_id` without a kind recomputes the kind; `tax_id: null` clears
both. `tax_id_kind` alone is accepted only when it matches the stored `tax_id` (400 `VALIDATION_ERROR`
otherwise, and it cannot be cleared on its own).

**Response** (200): `Recipient`

**Errors:**
- 409 `RECIPIENT_ALREADY_EXISTS` — Email belongs to another recipient of this user (saving a recipient's own email is fine)
- 400 `VALIDATION_ERROR` — `name: null` (the name is required and cannot be cleared); nothing is
  saved. Other class-validator failures return 400 `HTTP_EXCEPTION`
- 404 `RECIPIENT_NOT_FOUND` — Missing or another tenant's recipient

---

### Delete Recipient

**DELETE** `/recipients/:id`

Permanently deletes a recipient that has no orders. Recipients have no soft delete.

**Response** (200): empty body

**Errors:**
- 404 `RECIPIENT_NOT_FOUND` — Missing or another tenant's recipient
- 409 `RECIPIENT_HAS_ORDERS` — The recipient has an order, live or soft-deleted; nothing is deleted

**Errors:**
- 409 `RECIPIENT_HAS_ORDERS` — The recipient still has orders and cannot be deleted

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
  recipientId: string,       // UUID
  items: [
    {
      productId: string,     // UUID
      qty: number,       // min 1
      unitPriceCents?: number, // integer cents, zero allowed
    }
  ]
}
```

**Response** (201):
```typescript
{
  id: string,
  order_number: number,   // per account: 1, 2, 3, ... never reused (soft-deleted orders keep theirs)
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

`OrderItem` carries `returned_qty: number` (units already taken back by issued, non-void `return_note` documents; `0` until a note exists; `qty - returned_qty` is what can still be returned) and `unit_cost_cents: number | null` — the product's purchase cost frozen when the
draft line was written. Lines created before cost snapshots hold an estimate: the product's cost when
they were backfilled. Null = unknown, which now remains only for a negative product cost or a line
whose product belongs to another tenant. It appears only in the owner's order/receipt JSON; frozen documents, PDFs and the public share page never include
it. The internal `unit_cost_estimated` flag is never returned.

**Special Response Header:**
- `X-Idempotency-Replayed: true` — Returned from cache (original response status is reused)

Duplicate `productId` entries and products with different currencies are rejected on create/update
with 400 `VALIDATION_ERROR`. Supply items as `{ productId, qty, unitPriceCents? }`; an explicit
`unitPriceCents: 0` is valid. Idempotency replays run before monthly quota refusal; parallel creates
are serialized per user for the quota check.

**Errors:**
- 400 `VALIDATION_ERROR` — Duplicate product or mixed currencies
- 404 `RECIPIENT_NOT_FOUND` — Recipient doesn't exist
- 404 `PRODUCT_NOT_FOUND` — Product doesn't exist
- 402 `ORDER_MONTHLY_LIMIT_EXCEEDED` — Free plan limit (20 orders/month)

---

### List Orders

**GET** `/orders`

Paginated list of user's orders.

**Query Params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| limit | number | 10 | |
| offset | number | 0 | |
| search | string | - | Recipient name contains the text; a bare number or `#17` also matches that `order_number` |
| sortBy | string | `created_at` | Sortable: `created_at`, `order_number`, `total_cents`, `status`, `recipient_name` |
| sortOrder | enum | DESC | ASC or DESC |
| status | enum | - | Filter: `draft`, `confirmed`, `cancelled` |
| minAmount | number | - | Min total in cents |
| maxAmount | number | - | Max total in cents |
| productId | string | - | Filter by product UUID |
| startDate | string | - | ISO date (e.g., 2026-01-01): from the start of that UTC day |
| endDate | string | - | ISO date (e.g., 2026-01-31): includes that whole UTC day. A full timestamp is an exact upper bound |

**Response** (200):
```typescript
{
  data: Order[],
  meta: { total: number, page: number, limit: number }
}
```

---

### Get Order by ID

**GET** `/orders/ids`

Ids of every order the list would show for the same filters (`search`, `status`, `minAmount`, `maxAmount`, `productId`, `startDate`, `endDate`), newest first, for "select all N" in the UI. Declared before `GET /orders/:id`.

`minAmount` / `maxAmount` (also on `GET /orders`) must be whole cents, digits only, `0..2147483647`; `productId` must be a UUID; `status` (also on `GET /orders`, empty means no filter) must be `draft`, `confirmed` or `cancelled`. Anything else is `400 VALIDATION_ERROR` naming the field (it was a database error, 500; `?status=foo` included). `offset` is capped at 1 000 000 on every paginated list (`PaginationDto`); a larger value is a 400.

**Response** (200):
```typescript
{
  ids: string[],   // at most 500 (one batch)
  total: number    // how many orders match in all; total > ids.length means ids is only the newest part
}
```

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
  recipientId?: string,
  items?: Array<{ productId: string; qty: number; unitPriceCents?: number }>
  // Only modifiable in DRAFT state
}
```

**Response** (200): `Order`

Replaced items restore removed products' stock and reserve the new items atomically. A line with the
same product and quantity as before keeps its `unit_cost_cents` (including null); any other line
captures the product's current purchase cost.

**Errors:**
- 400 `VALIDATION_ERROR` — Duplicate product IDs or mixed currencies
- 400 `ORDER_CANNOT_BE_MODIFIED` — Order is not DRAFT

---

### Confirm Order

**PATCH** `/orders/:id/confirm`

DRAFT → CONFIRMED under the order row lock; prevents further edits. Required before generating a
receipt. A cancel that committed first wins (the confirm then gets 400). Line costs are not re-read.

If the account's `autoGenerateReceipt` setting is on (see [Auto-generate receipt on confirm](#auto-generate-receipt-on-confirm)), the default receipt is queued right after the status change, exactly as an empty-body `POST /receipts/orders/:orderId/receipt`. A generation failure is logged and never fails the confirm; the order stays confirmed and can be generated manually.

**Response** (200): `Order` (status updated to `confirmed`)

**Errors:**
- 404 `ORDER_NOT_FOUND`
- 400 `ORDER_CANNOT_BE_MODIFIED` — Not DRAFT (already confirmed or cancelled)

---

### Cancel Order

**PATCH** `/orders/:id/cancel`

Marks a DRAFT or CONFIRMED order `cancelled`. It is **not** a deletion: the order stays listed and
keeps its stock reservation — only `DELETE /orders/:id` returns stock (exactly once).

Cancelling a DRAFT or CONFIRMED order (a draft may carry a quotation), in the same transaction, voids every non-void receipt of the order
(`status: void`, `void_reason: "order_cancelled"`, `voided_at`), revokes its public share link and
drops any pending candidate/replacement, so a delayed worker can no longer promote it. The voided PDF
stays downloadable by the owner as history; a receipt already voided by hand keeps its own reason.
Afterwards generate/regenerate/share/void/repair on that receipt are rejected and the order can be
neither confirmed nor edited.

**Response** (200): `Order` (status `cancelled`, its receipts `void`)

**Errors:**
- 404 `ORDER_NOT_FOUND`
- 400 `ORDER_ALREADY_CANCELLED` — Already cancelled

---

### Delete Order

**DELETE** `/orders/:id`

Deletes an order (soft delete, stock returned). In the same transaction the share links (`public_token`) of every document the order carries are revoked (set to `null`, so `/r/:token` answers 404); statuses and files are not touched.

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

Confirms multiple draft orders in one call. The orders are row-locked in id order and must all still
be DRAFT under the lock (a concurrent cancel wins). With `autoGenerateReceipt` on, a default receipt is queued for each approved order after the transaction commits (sequentially, failures logged per order and never fail the response).

**Request Body:**
```typescript
{
  orderIds: string[]  // Array of order UUIDs
}
```

**Response** (201):
```typescript
{ approved: number }
```

**Errors:**
- 400 `BATCH_ORDERS_NOT_ALL_DRAFT` — Some orders not in DRAFT state

---

### Batch Delete Orders

**POST** `/orders/batch-delete`

Soft-deletes multiple orders; like `DELETE /orders/:id` it revokes the share links of their documents in the same transaction.

**Request Body:**
```typescript
{
  orderIds: string[]
}
```

**Response** (201):
```typescript
{ deleted: number }
```

---

### Dashboard Metrics

File: `backend/src/modules/orders/orders.controller.ts` — dashboard routes (8 of 17 total), served by
`OrdersDashboardService` (`orders-dashboard.service.ts`)

"Revenue" in these routes is **profit**: Σ (unit price − `order_items.unit_cost_cents`) × qty over
confirmed, non-deleted orders. It never reads the product's current purchase price, so changing a
product's cost does not rewrite history. Lines from before cost snapshots count with their backfilled
estimate, so they are included and not reported as unknown. Lines whose cost is unknown (NULL, now only
a negative product cost or a line whose product belongs to another tenant) are left out of the sum and
reported instead — an unknown cost is never
counted as zero. Every profit payload carries:

```typescript
type ProfitCompleteness = {
  unknown_cost_lines: number,          // lines excluded for unknown cost
  unknown_cost_turnover_cents: number, // their line totals
  profit_complete: boolean,            // unknown_cost_lines === 0
}
```

The profit field is `number | null`: null when no line of the group has a known cost. Groups are
sorted by profit `DESC NULLS LAST`. Turnover routes are unchanged and count every line.

#### Daily Revenue (Sparkline Data)

**GET** `/orders/dashboard/daily-revenue`

Time-series profit and turnover for sparkline/chart (last N days).

**Query Params:**
- `days` (number, optional) — Number of days to retrieve. Default: 7.

**Response** (200):
```typescript
[
  {
    date: string,                // "2026-08-20"
    revenue_cents: number | null, // 0 for a day without orders; null when every line that day has an unknown cost
    turnover_cents: number,
    ...ProfitCompleteness
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
- `endDate` (string, ISO date, optional; a date includes that whole UTC day, a full timestamp is an exact upper bound)

**Response** (200):
```typescript
[
  {
    product_id: string,
    product_name: string,
    total_revenue_cents: number | null,
    total_quantity: number,
    currency: string,
    ...ProfitCompleteness
  }
]
```

---

#### Revenue by Recipients

**GET** `/orders/dashboard/revenue-by-recipients`

Revenue breakdown by customer (recipient).

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional; a date includes that whole UTC day, a full timestamp is an exact upper bound)

**Response** (200):
```typescript
[
  {
    recipient_id: string,
    recipient_name: string,
    total_revenue_cents: number | null,
    total_orders: number,
    currency: string,
    ...ProfitCompleteness
  }
]
```

---

#### Total Revenue

**GET** `/orders/dashboard/total-revenue`

All-time or date-range total revenue.

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional; a date includes that whole UTC day, a full timestamp is an exact upper bound)

**Response** (200): See `backend/src/modules/orders/dto/dashboard-response.dto.ts` TotalRevenueDto
```typescript
{
  total_revenue_cents: number | null, // 0 (complete) when there are no confirmed lines
  total_orders: number,
  currency: string,
  ...ProfitCompleteness
}
```

---

#### Turnover by Products

**GET** `/orders/dashboard/turnover-by-products`

Product quantity/count breakdown (complement to revenue).

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional; a date includes that whole UTC day, a full timestamp is an exact upper bound)

**Response** (200): See `backend/src/modules/orders/dto/dashboard-response.dto.ts` TurnoverByProductDto[]

---

#### Turnover by Recipients

**GET** `/orders/dashboard/turnover-by-recipients`

Order count breakdown by customer.

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional; a date includes that whole UTC day, a full timestamp is an exact upper bound)

**Response** (200): See `backend/src/modules/orders/dto/dashboard-response.dto.ts` TurnoverByRecipientDto[]

---

#### Total Turnover

**GET** `/orders/dashboard/total-turnover`

Total order count (optionally date-filtered).

**Query Params:**
- `startDate` (string, ISO date, optional)
- `endDate` (string, ISO date, optional; a date includes that whole UTC day, a full timestamp is an exact upper bound)

**Response** (200): See `backend/src/modules/orders/dto/dashboard-response.dto.ts` TotalTurnoverDto

---

## Receipts

Primary receipt management. All endpoints require JWT auth unless noted. Scoped to authenticated user.

File: `backend/src/modules/receipts/receipts.controller.ts` (14 endpoints)

### Create Receipt (Default Template)

**POST** `/receipts/orders/:orderId/receipt`

Generates a frozen PDF receipt/invoice for a confirmed order. Optional config/preset/overrides and staged logo use the document draft envelope described below; empty body uses defaults. Generation is asynchronous and account defaults are unchanged.

**Path Params:**
- `orderId` (string, UUID) — Order to generate receipt for

**Response** (201): `ReceiptProjection`, e.g.
```typescript
{
  id: string,
  order_id: string,
  status: "processing",   // Durable intent committed; transitions to "generated" or "failed"
  pdf_url: null,          // Populated when generation completes
  progress: 0,            // 0-100
  created_at: string,
  active_revision: number,
  replacement_status: null
  // …plus number, hash, template_id/version, error_message, voided_at, void_reason, public_token, replacement_error
}
```

**Errors:**
- 404 `ORDER_NOT_FOUND` — Order doesn't exist or not confirmed
- 409 `RECEIPT_ALREADY_EXISTS` — Receipt already generated for this order; also 409 when the selected preset changed since `presetRevision`
- 402 `TEMPLATE_PLAN_RESTRICTED` — Template not allowed on user's plan
- 429 `RATE_LIMITED` — more than 20 issuing requests a minute from this user (also on `/receipt/compact` and `/receipt/standard`)

The 201 body is `ReceiptIssueResult`: the projection above plus the optional `warnings` (`SIGNOFF_UNAVAILABLE`, see *Create Document*).

Receipt creation commits a durable outbox entry with the receipt before publishing to Redis.
Queue outages retry automatically without blocking the HTTP response on Redis readiness. Repeated requests return an existing PROCESSING generation;
FAILED retries create a new generation. Existing active generations are not reset by receipt age.

**Note:** Monitor progress via WebSocket `/receipts/progress/:userId` or poll `/receipts/:id`.

---

### Create Compact Receipt

**POST** `/receipts/orders/:orderId/receipt/compact`

Forces compact template regardless of user's template setting.

**Path Params:**
- `orderId` (string, UUID)

**Response** (201): `ReceiptProjection` (same shape as Create Receipt)

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

**Response** (201): `ReceiptProjection`

**Errors:**
- 404 `ORDER_NOT_FOUND`
- 409 `RECEIPT_ALREADY_EXISTS`
- 402 `TEMPLATE_PLAN_RESTRICTED`

---

### Create Document (waybill, invoice, act)

**POST** `/receipts/orders/:orderId/documents`

Generic generation for the supported types. `/receipts/orders/:orderId/receipt*` stay as they were and always create a waybill. The body is the JSON/multipart draft envelope (`payload` field + optional `logo`), validated by `documentGenerationSchema`:

```typescript
{
  type: "waybill" | "invoice" | "act" | "sales_receipt" | "packing_list" | "quote" | "return_note",     // required
  // design fields, as in POST /receipts/orders/:orderId/receipt
  config?, presetId?, presetRevision?, overrides?, logoAction?: "keep" | "replace" | "remove",
  details?: InvoiceDetails | ActDetails | QuoteDetails | ReturnNoteDetails    // invoice, act, quote (default {}) and return_note (required)
}
InvoiceDetails = { dueDate?: "YYYY-MM-DD", paymentTermDays?: 1..365 }  // at most one of the two
ActDetails     = { contractRef?: string (1..200, trimmed), period?: { from, to } }  // ISO dates, from <= to
QuoteDetails   = { validUntil?: "YYYY-MM-DD", paymentTerms?: string, deliveryTerms?: string }  // terms trimmed, 1..300 chars; strict (dueDate / paymentTermDays are a 400)
ReturnNoteDetails = { lines: { orderItemId: uuid, qty: int >= 1 }[] (1..200, each orderItemId once), reason?: string }  // reason trimmed, 1..300; strict; no default
```

`type` is read first: an unknown value is `400 VALIDATION_ERROR`. `sales_receipt` (товарний чек, **not a fiscal document**; shows the notice, items, totals, VAT, amount in words, seller signature) and `packing_list` (пакувальний лист; items and quantities only, **no prices, sums or VAT** in the PDF, the stored HTML or the public projection) take no `details` (a `details` key is `400 VALIDATION_ERROR`). The sales receipt's last total line is the neutral "Всього" / "Всего" / "Total" (not "Всього до сплати": the goods are paid at the sale). An invoice, act, sales receipt or packing list needs a CONFIRMED order (otherwise `400 ORDER_CANNOT_BE_MODIFIED`), on any plan.

`quote` (комерційна пропозиція; an offer, **not an invoice**: it prints the notice "Пропозиція не є рахунком …", items, totals and VAT like an invoice but no payment details, the last total line is "Загальна вартість", then the validity and the optional payment/delivery terms, one supplier signature with М.П.) takes a **DRAFT or CONFIRMED** order (a CANCELLED one is `400 ORDER_CANNOT_BE_MODIFIED`) and **does not lock** the order. `validUntil` defaults to the issue date + 14 days and must lie within `[issueDate, issueDate + 365 days]`, the issue date being the generation day in the document's time zone; otherwise `400 VALIDATION_ERROR` (`Validation error for details.validUntil: must not be earlier than the issue date` / `…: must be within 365 days of the issue date`), before a number is drawn. A voided quotation can be issued again under a new number; a repeat of a failed one is `{type:"quote",details:{}}`. Cancelling the order voids a live quotation with the other documents. Each type has its own number series, one document per type and order, and its own 10-document retention.

`return_note` (накладна на повернення товару; ru «накладная на возврат товара», en "Goods Return Note") records goods that come back under an order. It needs a CONFIRMED order (otherwise `400 ORDER_CANNOT_BE_MODIFIED`), is **informational**: it does **not** change stock, is **not a fiscal document** and **not a settlement/tax-invoice adjustment («розрахунок коригування»)**, and **does not lock** the order. `details.lines` is required (a missing `details` or an empty `lines` is `400 VALIDATION_ERROR`); every `orderItemId` must belong to the order. Unlike every other type, an order may carry **several live return notes** (partial returns): they are not limited by the one-document-per-type rule and do not conflict with each other (no `DOCUMENT_ALREADY_EXISTS`). The limit is the ledger: each `OrderItem` exposes `returned_qty` (units already taken back by earlier non-void return notes, `0 <= returned_qty <= qty`), so a request may return at most `qty - returned_qty` of a line. Asking for more is `422 RETURN_QUANTITY_EXCEEDED` with `items: [{ orderItemId, requested, remaining }]`, and no number is drawn. The ledger is read when the request arrives and checked again atomically at issue time, so two parallel notes cannot both take the last unit. A **voided** return note gives its quantities back (the ledger decreases). Return notes are never evicted by the retention cap. `details.lines` is mandatory (never defaulted), so there is no blind `{details:{}}` retry of a failed note; the UI offers no retry button for it and asks for a new note instead.

An invoice's due date is `issueDate` (the generation day in the document's time zone) plus `paymentTermDays`, else the settings' `defaultPaymentTermDays`, else 5 days; an explicit `dueDate` earlier than the issue date is `400 INVOICE_DUE_DATE_BEFORE_ISSUE_DATE` with the stable body `{ error, errorCode, field: "details.dueDate", dueDate, issueDate }` (both dates `YYYY-MM-DD`; the client localizes from `errorCode` and shows `field`); it is raised in preflight, so no number is burned. The heading is fixed per type and language (uk "Рахунок на оплату" / "Акт виконаних робіт (наданих послуг)", ru "Счёт на оплату" / "Акт выполненных работ (оказанных услуг)", en "Invoice" / "Act of Completed Work (Services Rendered)") and ignores a custom title. Requests with a non-empty `details` are explicit input and rebuild a FAILED candidate; `{}` retries the frozen candidate.

**Response** (201): `ReceiptIssueResult` = `ReceiptProjection` plus the optional `warnings` (below) (`document_type` set; PDF is produced asynchronously, as for a waybill). The PDF file name is `invoice-<number>.pdf` / `act-<number>.pdf` / `sales_receipt-<number>.pdf` / `packing_list-<number>.pdf` / `quote-<number>.pdf` / `return_note-<number>.pdf`; a waybill stays `receipt-<number>.pdf`.

**`warnings` (non-blocking).** When the account has a signature and/or stamp, the chosen style prints them, but an image cannot be read when the document is prepared (object gone, checksum mismatch, asset no longer ready), the document is still issued (201) without it and the body carries `warnings: [{ code: "SIGNOFF_UNAVAILABLE", kinds: ("signature" | "stamp")[], message }]` (`kinds` lists only the failed ones). The key is absent when there is nothing to warn about, is not stored, and appears only in the response of the call that built the document (`POST /receipts/orders/:orderId/documents`, `/receipt`, `/receipt/compact`, `/receipt/standard`, `POST /receipts/:id/regenerate` with `mode: "replace"`), never in `GET` bodies. A style that does not print images never warns.

**Rate limit.** Per signed-in user, not per IP: 20 issues a minute **in total across** the five issuing routes above (`/receipt`, `/receipt/compact`, `/receipt/standard`, `/documents`, `/:id/regenerate` share one bucket, `ThrottleBucket("document-issue")`); the 21st is `429 RATE_LIMITED` with `{ error, errorCode: "RATE_LIMITED", retryAfterSeconds }` and a `Retry-After` header (seconds).

**Double submit of a return note.** A second `return_note` request for the same order with exactly the same `details.lines` (same items and quantities) and `reason` within 10 seconds of a live (processing or generated) one creates nothing and answers with the first note (same `id` and `number`, 201), before the quantity check, so a double click on the last pieces does not turn into `RETURN_QUANTITY_EXCEEDED`. That answer carries no `warnings` of the second call: it returns the first note as it is. Different lines, quantities or reason, or a voided/failed first note, make a new note as before.

**Errors:**
- 400 `DOCUMENT_TYPE_NOT_SUPPORTED`, `VALIDATION_ERROR`, `ORDER_CANNOT_BE_MODIFIED`
- 429 `RATE_LIMITED` — more than 20 issuing requests a minute from this user
- 400 `VALIDATION_ERROR` (`details.dueDate`) — an invoice `dueDate` more than 365 days after the issue date (the same ceiling as `paymentTermDays`) or before it (`INVOICE_DUE_DATE_BEFORE_ISSUE_DATE`)
- 400 `DOCUMENT_TEMPLATE_UNSUPPORTED` — the selected style is not in the type's `layout.allowedStyles` (invoice, act, sales receipt, packing list and quote: `standard`, `classic`, `minimal`, `corporate`; every other style, including `delivery` which prints no amounts and `compact` which cannot show the IBAN, is refused). `GET /settings/templates` lists the types a style can carry in `capabilities.documentTypes`
- 402 `TEMPLATE_PLAN_RESTRICTED`
- 404 `ORDER_NOT_FOUND`
- 409 `DOCUMENT_ALREADY_EXISTS` (a live document of this type already exists, never for `return_note`; or a voided waybill/sales receipt/packing list: those types are not reissued; a voided invoice, act or quote is not a conflict and the next request issues a new one under a new number) — a waybill sent here keeps `RECEIPT_ALREADY_EXISTS`; also 409 when the order, defaults, preset or the buyer's requisites changed while preparing
- 422 `DOCUMENT_AMOUNT_INVALID` — the order total or currency cannot be printed (e.g. a lowercase or non-ISO currency code); checked in preflight, so no number is drawn.
- 422 `RETURN_QUANTITY_EXCEEDED` — a `return_note` asks for more of a line than is left to return (`qty - returned_qty`); `items` lists each short line with `requested` and `remaining`.
- 422 `DOCUMENT_REQUISITES_MISSING` — body `{ error, errorCode, fields: string[], warnings: string[] }`. `fields` blocks generation: invoice needs `seller.name`, `seller.taxId` (with a determinable ЄДРПОУ/РНОКПП kind), `seller.iban` (valid UA IBAN), and `seller.vatId` when `companyVatPayer` is true; act needs `seller.name`, `seller.taxId`, `seller.signatoryName`, `seller.signatoryPosition`, and `seller.vatId` when `companyVatPayer` is true (as an invoice does); sales receipt needs `seller.name` (and `seller.vatId` for a VAT payer); packing list needs `seller.name`; quote needs `seller.name` (and `seller.vatId` for a VAT payer). `warnings` lists absent soft fields (invoice: `seller.bankName`, `seller.legalForm`, `seller.vatPayer`, `buyer.taxId`; act: `buyer.legalName`, `buyer.taxId`, `details.contractRef`; sales receipt: `seller.taxId`, `seller.vatPayer`; packing list: none; quote: `seller.taxId`, `seller.legalForm`, `seller.vatPayer`); they are also stored in the snapshot. Required seller fields are checked on the stored values and ignore the visibility switches.

The requisites, issue/due/validity dates, title and the VAT rate (`vatRatePercent`, 20 today, kept by a replacement) are frozen in `snapshot.document`, which is never part of the public projection. The public **JSON** (`GET /public/receipts/:token`) is unchanged: it shows the seller's IBAN and tax code only as the style's visibility settings allow, exactly as for a waybill, and never the buyer's IBAN/tax id, the seller's VAT id (ІПН), the signatory, VAT amounts or the amount in words. For a packing list the public JSON has `money: false`, no `subtotal_cents`/`total_cents`, and items with only `product_name` and `qty`. The **PDF** behind `GET /public/receipts/:token/pdf` is the document itself and carries every requisite the invoice or act prints (both parties' codes and addresses, the payment details, the ІПН, the signatory); anyone holding the link can download it, so revoke the share token to withdraw it.

---

### List Receipts

**GET** `/receipts`

Paginated list of the account's documents for the Documents page: filters, search, sorting, and the order each document belongs to. Documents of soft-deleted orders are not listed. Another account's documents are never visible (row-level security plus the `user_id` filter).

**Query Params** (`ListDocumentsQueryDto`; every key the client's `useServerPagination` sends is declared):

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| offset | integer | 0 | 0 to 1,000,000 (anything else, including `1.5` or `1e30`, is `400`) |
| limit | integer | 20 | 1 to 100 |
| type | `DocumentType` | all | A cleared (empty) value means no filter; an unknown value is `400` |
| status | `processing` \| `generated` \| `failed` \| `void` | all | Same rules as `type` |
| startDate, endDate | `YYYY-MM-DD` | none | Calendar days **in the account's document time zone** (`document_config.formatting.timeZone`, `Europe/Kyiv` by default; the same zone that dates the documents), both ends included: from the start of `startDate` to the end of `endDate` in that zone, independent of the server's own time zone and daylight saving. Must be real dates. 00:00 to 03:00 Kyiv time belongs to its own day, not to the previous UTC day |
| search | string, at most 100 after trimming | none | Matches the document number (`ILIKE`), the recipient's name and legal name (`ILIKE`; `%`, `_` and `\` are literal). A value of digits, with an optional leading `#` (up to 9 digits), also matches the order number exactly |
| sortBy | `created_at` \| `number` \| `document_type` \| `status` | `created_at` | Allowlist by own keys only (`__proto__`, `constructor` and the like are ignored, see `common/utils/sort-column.util.ts`; the same helper guards the orders, products, suppliers and recipients lists); any other value is ignored. `number` and `status` sort as stored (text / enum order) |
| sortOrder | `ASC` \| `DESC` | `DESC` | Ties break by document id in the same direction |

**Response** (200): `ReceiptListResponse`
```typescript
{
  data: DocumentListItem[],
  total: number,    // matches of the filters, not of the page
  offset: number,
  limit: number
}

// ReceiptProjection plus the order; nothing of ReceiptProjection changed.
type DocumentListItem = ReceiptProjection & {
  order: {
    id: string,
    order_number: number,
    status: "draft" | "confirmed" | "cancelled",
    recipient_name: string | null   // the recipient's current name, not the one frozen in the document
  } | null
}
```

---

### Receipt Retention

**GET** `/receipts/retention` (requires auth)

How close the account is to the retention cap (10 generated documents of a document type) and which document promoting the next one of that type would delete, so the UI can ask first. `replaces` is always `null` for `invoice`, `act` and `return_note`: they are never evicted and the cap is not enforced for them. Declared before `GET /receipts/:id`.

**Query Params:**
- `type` (optional): one of `waybill`, `invoice`, `quote`, `act`, `sales_receipt`, `packing_list`, `return_note`. Defaults to `waybill`; any other value returns 400 `VALIDATION_ERROR`.

**Response** (200):
```typescript
{
  limit: number,               // 10
  count: number,               // generated documents of that type the account holds
  replaces: { id: string, number: string, order_id: string } | null  // oldest document of that type once count >= limit
}
```

---

### Get Receipt by ID

**GET** `/receipts/:id`

Retrieves receipt metadata and current status.

**Path Params:**
- `id` (string, UUID)

**Response** (200): `ReceiptProjection`

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
- Content-Disposition: `inline; filename="<ASCII fallback>"; filename*=UTF-8''<percent-encoded name>` (see *Download file names* below)

**Errors:**
- 404 `RECEIPT_NOT_FOUND`
- 400 — PDF file is not a valid PDF

**Download file names.** The name is `receipt-<number>.pdf` for a waybill and `<type>-<number>.pdf` for the others. Since a number may carry a prefix with non-Latin letters (`РФ-2026-000043`), `receipts/content-disposition.ts::pdfDisposition` writes an ASCII `filename` (every non-ASCII character, `"`, `\` and `%` becomes `_`) plus an RFC 5987 `filename*` with the exact name. Both PDF endpoints (`/receipts/:id/pdf` and `/public/receipts/:token/pdf`) use it; writing the raw name used to make Node throw on a non-Latin-1 header and answer 500.

---

### Print Receipt to Printer

**POST** `/receipts/:id/print`

Sends generated receipt to physical printer.

**Path Params:**
- `id` (string, UUID)

**Query Params:**
- `printer` (string, optional) — Printer name; defaults to system default

**Response** (201):
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

**Request Body** (optional, `ReceiptVoidRequest`):
```typescript
{ reason?: string }  // trimmed; at most 500 characters; omitted (or empty) leaves void_reason empty
```

**Response** (201): `ReceiptProjection` (status updated)

**Errors:**
- 404 `RECEIPT_NOT_FOUND`
- 400 `RECEIPT_IS_ALREADY_VOIDED`
- 400 (global validation pipe: `errorCode: "HTTP_EXCEPTION"`, `error` is a list of messages) — `reason` is not a string or is longer than 500 characters (`VoidReceiptDto`); it used to reach the database and answer 500

---

### Regenerate / replace Receipt PDF

**POST** `/receipts/:id/regenerate`

Empty body or `{ mode: "reproduce" }` queues reproduction from the frozen active snapshot (or retries a failed frozen candidate). **Compatibility change:** it no longer silently applies current account settings. Legacy trustworthy HTML uses known legacy PDF options; absent trustworthy content returns 409 `RECONSTRUCTION_REQUIRED` and preserves any active PDF.

Explicit replacement accepts `{ mode: "replace", expectedActiveRevision, config?, presetId?, presetRevision?, overrides?, logoAction?, confirmReconstruction? }` as JSON or the multipart draft envelope. Config and preset selection are mutually exclusive. Replacement of a legacy document without frozen transaction input requires `confirmReconstruction: true`; it does not assert historical fidelity. Reproduce rejects config/logo changes. A stale revision or running replacement returns 409.

**Response** (201): `ReceiptIssueResult` (`ReceiptProjection` plus the optional `warnings`, see *Create Document*; only `mode: "replace"` rebuilds the HTML and can warn). Limited to 20 a minute per user, counted together with the other issuing routes (`429 RATE_LIMITED`). Generated status/PDF remain active until a successful guarded promotion. Poll `replacement_status` (`processing`/`failed`/null) and `active_revision`; a successful replacement changes the PDF served by existing share links. Failure never deletes the old PDF or restores revoked tokens/void status.

**Errors:** 400 invalid body or reproduce with new configuration; 402 `TEMPLATE_PLAN_RESTRICTED`; 404 `RECEIPT_NOT_FOUND`; 409 stale revision/preset, running replacement or `RECONSTRUCTION_REQUIRED`; 413 request above 6 MiB or logo above 5 MiB.

---

### Generate Test Receipt Preview

**POST** `/receipts/test-preview`

Generates a test PDF using current user's settings (no order required).

**Response** (201): Binary PDF file
- Content-Type: application/pdf
- Inline preview of how receipts will look

**Errors:**
- 429 `RATE_LIMITED` — more than 10 previews a minute from this user
- 500 `PREVIEW_FAILED` `{ error: "Could not generate the preview", errorCode }` — the cause is only logged

---

### Generate Public Share Link

**POST** `/receipts/:id/share`

Creates a public token allowing unauthenticated access to receipt PDF. Concurrent creators receive
the same winning token; a concurrent void cannot be overwritten by a late share update.

**Path Params:**
- `id` (string, UUID)

A document of a deleted order is not found, and the token is written only while the order is still live (re-checked inside the UPDATE).

**Response** (201): `ReceiptShareResponse`
```typescript
{
  token: string,           // Share token
  url: string              // Full public URL (`<FRONTEND_URL>/r/<token>`)
}
```

**Errors:**
- 400 — the document is not `generated` (still processing, failed or void)
- 404 `RECEIPT_NOT_FOUND` — unknown id, another tenant's document, or its order was deleted

---

### Revoke Public Share Link

**POST** `/receipts/:id/share/revoke`

Persists SQL NULL for the share token. Public metadata and PDF requests using the revoked token
return 404. Voiding also clears the share token.

**Path Params:**
- `id` (string, UUID)

**Response** (201): `ReceiptProjection` with `public_token: null`

**Errors:**
- 404 `RECEIPT_NOT_FOUND`

---

## Subscription & Billing

`GET /api/v1/billing/config` is public and returns `{ billingEnabled: boolean }`.
`BILLING_ENABLED` defaults to false. When false, checkout, portal and signed webhook
POSTs return HTTP 503 with `errorCode: BILLING_DISABLED` and perform no payment or
subscription mutations. Subscription status/usage reads and existing plan limits remain
available. Direct webhook service entry points and scheduled canceled-plan downgrades
are also disabled. Enabling production billing requires all Paddle settings below.


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
    ordersThisMonth: number    // orders created this UTC month, excluding cancelled and deleted ones
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

File: `backend/src/modules/settings/settings.controller.ts` (29 endpoints)

### Receipt Design & Template

#### Get Receipt Design Settings

**GET** `/settings/receipt-design`

Returns current receipt customization settings, including `hasCustomReceiptTitle`. Blank/null stored titles are automatic: the receipt language and template determine their display title (Delivery/Proforma have specialized titles); an explicitly stored title such as `Invoice` remains custom. The unset Branded accent color resolves to `#3B82F6`.

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

Updates user's template selection. Validates the known nonempty template ID before checking the subscription plan (unknown IDs return 400 on every plan; locked known templates return 402).

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

Sets custom receipt title (required string, at most 200 characters; blank/whitespace restores the automatic localized title).

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

Sets template rendering language. Only `en`, `ru` and `uk` are accepted.

**Request Body:**
```typescript
{ language: string }
```

**Response** (200):
```typescript
{ message: "Template language updated successfully" }
```

---

#### Update Footer Atomically

**POST** `/settings/footer`

Body: `{ footerTitle: string, footerSubtitle: string }` (both required, at most 500 characters each; blank strings clear the corresponding text). Validates both fields before one partial database upsert, so a failed request cannot save only one field. The existing individual footer routes remain compatible and update only their supplied column.

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
  - Exact MIME allowlist and real byte-format validation; mismatched MIME/bytes are rejected
  - PNG/JPEG/GIF/static SVG are normalized to PNG before storage (GIF first frame)
  - At most 4096 × 4096 input pixels per dimension, 16M decoded pixels; output fits within 2048 × 2048 (or 1024 × 1024 when needed to keep the normalized PNG under 5 MB)
  - SVG scripts, event handlers, foreign objects and external resources are rejected; local fragment references are supported
  - The stable `logos/logo-{userId}.png` key is overwritten after successful validation, without pre-deleting the existing object

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

Retrieves the selected immutable tenant logo as PNG, with legacy fixed-key reads normalized in memory until an authorized Save/generation copies them. GET never rewrites storage.

**Response** (200): Binary image file
- Content-Type: image/png
- Cache-Control: private, no-store

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
- Requisites, `null` when not filled: companyTaxIdKind (`edrpou` | `rnokpp`), companyLegalForm,
  companyBankName, companyVatPayer, companyVatId, companySignatoryName, companySignatoryPosition,
  defaultPaymentTermDays

---

#### Update Company Info

**POST** `/settings/company-info`

Updates only supplied company fields. At least one recognized field is required; optional blank strings clear values. Every supplied value must be a string. Name: 200 chars; address/tagline/website: 500; email: 254; phone/tax ID/IBAN/SWIFT: 100. Nonblank email and website receive format validation (HTTP(S), with or without explicit protocol).

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
  companyTagline?: string,
  // Requisites: null (or "" for text) clears. Stored in columns, never in the document config.
  companyTaxIdKind?: "edrpou" | "rnokpp" | null,
  companyLegalForm?: string | null,          // trimmed, max 64
  companyBankName?: string | null,           // max 200
  companyVatPayer?: boolean | null,
  companyVatId?: string | null,              // 10 or 12 digits
  companySignatoryName?: string | null,      // max 255
  companySignatoryPosition?: string | null,  // max 255
  defaultPaymentTermDays?: number | null     // integer 1..365
}
```

When `companyTaxIdKind` and `companyTaxId` arrive in one request, the number must match the kind
(8 digits ЄДРПОУ, 10 РНОКПП; 400 otherwise). `companyTaxId` and `companyIban` stay free text.

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

### Auto-generate receipt on confirm

Account flag (`user_settings.autoGenerateReceipt`, default `false`). When on, `PATCH /orders/:id/confirm` and `POST /orders/batch-approve` queue the default receipt for each newly confirmed order.

#### Get Auto-Receipt Flag

**GET** `/settings/auto-receipt`

**Response** (200):
```typescript
{ data: { enabled: boolean } }
```

---

#### Set Auto-Receipt Flag

**POST** `/settings/auto-receipt`

**Request Body:** `{ enabled: boolean }` (strict; other keys → 400 `VALIDATION_ERROR`)

**Response** (200):
```typescript
{ data: { enabled: boolean } }
```

### Document numbering

Per document type (`waybill`, `invoice`, `quote`, `act`, `sales_receipt`, `packing_list`, `return_note`) an account can choose how the next numbers look and where the counter starts. Business rules: [business-logic.md → Document numbers](./business-logic.md). The routes live in the receipts module (`receipts/document-numbering.controller.ts`).

#### Get Numbering Settings

**GET** `/settings/document-numbering`

**Response** (200) — all seven types, always, with the historical default for a type that was never configured:
```typescript
{ types: NumberingSetting[] }

type NumberingSetting = {
  documentType: DocumentType,
  prefix: string,        // 0 to 16 characters, default ""
  padding: number,       // 1 to 9, default 6
  includeYear: boolean,  // default true
  nextValue: number,     // the counter value the next document gets (for a waybill: higher of document_counters and users.receipt_counter, plus 1)
  minStart: number,      // lowest startNumber that is still accepted; equals nextValue
  nextNumber: string     // preview, e.g. "РФ-2026-000043"
}
```

---

#### Set Numbering Format

**PUT** `/settings/document-numbering/:type`

**Request Body:**
```typescript
{
  prefix: string,        // trimmed; letters, digits, . _ - and space only; at most 16; MUST NOT end with a digit; no / \ " or control characters
  padding: number,       // integer 1..9
  includeYear: boolean,
  startNumber?: number   // integer 1..2_000_000_000; only raises the counter so that the next number is this one
}
```
Format printed: `prefix + (includeYear ? "<UTC year>-" : "") + String(value).padStart(padding, "0")`. With the defaults (`""`, 6, `true`) that is exactly the old `2026-000042`.

**Response** (200): `NumberingSetting` (the saved one).

**Errors:**
- 400 `VALIDATION_ERROR` — the message names the field (`prefix`, `padding`, `includeYear` or `startNumber`) or `type` (unknown document type)
- 409 `NUMBERING_START_TOO_LOW` — `startNumber` would reuse a number already issued. Body: `{ error, errorCode, minStart }`; `minStart` is the lowest start that is accepted. Nothing is saved (not even the format)

The change applies to documents drawn after it; issued documents keep their number. A retry of a failed document keeps its number. A voided invoice, act or quotation issued again gets a number in the format that applies at that moment.

---

### Signature and stamp

Account-level images printed on documents whose style has a signature block (`capabilities.signoff` in `GET /settings/templates`: `standard`, `classic`, `minimal`, `corporate`). Business rules: [business-logic.md → Signature and stamp](./business-logic.md).

**SignoffImage** = `{ assetId: string, width: number, height: number, bytes: number, updatedAt: string }` (the stored, normalized PNG; a new upload is a new asset).

#### Get State

**GET** `/settings/signoff` → `{ signature: SignoffImage | null, stamp: SignoffImage | null }`

#### Get Image

**GET** `/settings/signoff/:kind/image` — `kind` is `signature` or `stamp` (anything else is `400`, on every `/settings/signoff/:kind` route).

**Response** (200): the stored PNG with `Content-Type: image/png`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`. 404 when not set. Needs the bearer token, so a client fetches it as a blob rather than through an `<img src>`.

#### Replace

**PUT** `/settings/signoff/:kind` — `multipart/form-data` with exactly one part, the file field `file`. No other fields.

**Response** (200): `SignoffImage`.

**Errors:**
- 400 `VALIDATION_ERROR` (message names `signature` or `stamp`) — not a PNG or JPEG, the file's first bytes do not match its declared type, a side outside 32..4096 px, animated PNG, undecodable, or no `file` part (`REQUIRED_FIELD_MISSING`)
- 413 — file above 2 MiB (refused while streaming, before decoding)
- 429 `RATE_LIMITED` — more than 10 uploads a minute from this user (counted per user, not per address)

The error text is `Validation error for <kind>: Use a PNG or JPEG image, 32 to 4096 px on each side, up to 2 MB`. The server decodes in memory, applies the EXIF orientation, drops all metadata (EXIF, GPS, ICC), fits the image inside 800 x 300 (signature) or 600 x 600 (stamp) without enlarging, and stores a PNG of at most 256 KiB.

#### Remove

**DELETE** `/settings/signoff/:kind` → 204, idempotent (also when nothing was set). Documents already issued keep their images; the stored object is deleted by scheduled cleanup after a 24-hour grace.

---

## Public Receipts

No authentication required. Public access via share tokens.

File: `backend/src/modules/receipts/public-receipts.controller.ts` (2 endpoints)

### Get Public Receipt Data

**GET** `/public/receipts/:token`

Retrieves receipt data using a 64-character hexadecimal share token (no auth). Access is limited
to the generated receipt and its order/items/recipient; the token grants no writes or access to
other data from the owner. Malformed, revoked and void tokens return 404. Both public endpoints send
`X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store` (a shared cache must not keep a copy past a revocation), on error responses of the PDF endpoint too (set before the lookup). The share page `/r/:token` carries `<meta name="robots" content="noindex">`; `robots.txt` deliberately does not disallow `/r/` (a crawler blocked there never sees the noindex), only `/api/`.

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
- Cache-Control: `private, no-store`
- Content-Disposition: `inline; filename="<ASCII fallback>"; filename*=UTF-8''<name>` (same helper as the authenticated download)
- The PDF contains the signature and stamp images the document was issued with, when its style prints them (they are embedded in the frozen HTML; the JSON data of `GET /public/receipts/:token` never carries images)

**Errors:**
- 404 — Receipt not found or share link revoked, or its stored file is missing: the body of a missing-file 404 is always the fixed `File not found: receipt PDF` (`FILE_NOT_FOUND`); the storage path (bucket, key, account id) is only written to the server log
- Rate limited to 20 requests/min per IP

---

## Test & Development Endpoints

**Template previews** — authenticated sample-data rendering without creating orders or receipts.

File: `backend/src/modules/receipts/controllers/pdf-test.controller.ts` (3 endpoints)

These JWT-guarded endpoints also serve the settings/onboarding template previews. They use shared translations and fonts, and do not persist sample data. Test PDFs use each template's production PDF options, including the content-sized 80 mm Thermal roll.

### Generate Test PDF (GET)

**GET** `/pdf-test/generate-test-pdf`

Generates a PDF with sample data and the selected template's production page options.

**Query Params:**
- `template` (string, optional) — Template ID: "standard", "compact", etc. Default: "standard"
- `logo` (boolean, optional) — Include sample logo. Default: false
- `language` (string, optional) — Language code: "en", "ru", "uk". Default: "en"

**Response** (200): Binary PDF file

**Valid Templates:** standard, compact, classic, modern, elegant, vintage, tech, wave, minimal, corporate, thermal, dark, branded, delivery, proforma. Invalid template/language values return HTTP 400.

**Valid Languages:** en, ru, uk

---

### Generate Test PDF (POST)

**POST** `/pdf-test/generate-test-pdf`

Generates a PDF with sample data and the selected template's production page options.

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

Renders the same prepared sample data as localised HTML, including selected-language `lang`, shared fonts, Delivery signature labels and Proforma labels/watermark. No PDF or stored receipt is created.

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

All errors follow this shape (`ApiErrorResponse` in the OpenAPI contract):

```typescript
{
  error: string,      // User-friendly message (no SQL, stack traces, or internals)
  errorCode: string   // Machine-readable code (e.g., "ORDER_NOT_FOUND", "PRODUCT_LIMIT_EXCEEDED")
  // Some errors add machine-readable fields, e.g. DOCUMENT_REQUISITES_MISSING: fields[], warnings[]
}
```

`GlobalExceptionFilter` builds this body for every error. Plain Nest HTTP exceptions get `errorCode: "HTTP_EXCEPTION"` unless the exception object carries its own `errorCode` (e.g. `RECONSTRUCTION_REQUIRED`); other extra fields such as `revision` are dropped. An `ApiErrorResponse` with `details` (e.g. `DOCUMENT_REQUISITES_MISSING`) spreads them into the body. Class-validator DTO failures can put an array of messages in `error`. Any other error — a database `QueryFailedError`, a runtime exception — is answered `500 { error: "Internal server error", errorCode: "INTERNAL_SERVER_ERROR" }`; its original message and stack are only logged.

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
- `/auth/refresh`: 20 requests per 60 seconds per IP
- Paddle webhook: 60 requests per 60 seconds (per webhook endpoint)

"IP" is the client address the frontend nginx saw: the API trusts exactly one proxy hop
(`X-Forwarded-For` entries a client writes itself are ignored).

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

## Versioned document configuration and previews

All routes require JWT auth. New read routes reject unknown query parameters; UUID paths, complete configs, partial overrides and write bodies use strict Zod validation. Complete V1 config includes company fields, template ID, document language, automatic/custom title (custom text must contain non-whitespace characters; literal `Invoice` stays custom), footer/accent/terms, tenant logo reference/layout, per-contact visibility and bounded Intl formatting. Unsupported values are retained. Logo bytes/storage keys are never config fields.

- `GET /settings/document-config` → `{ data: { config, revision } }`, without creating a settings row.
- `PUT /settings/document-config` → committed `{ data: { config, revision } }`; requires `expectedRevision`. A stale save returns 409 with `errorCode: "DOCUMENT_REVISION_CONFLICT"` (the current revision is not included, so clients reload it with `GET`); the UI shows the reload/compare/discard block only for that code, while other errors (validation, limits) appear next to the Save button. Preset update/delete and receipt regeneration report stale revisions as a plain 409 (`HTTP_EXCEPTION`).
- `GET /settings/document-presets` → `{ data: [{ id, name, revision, updated_at }] }` summaries.
- `GET /settings/document-presets/:id` → editable `{ data: { id, name, revision, config } }`.
- `POST /settings/document-presets` → create with `name` and draft.
- `PUT /settings/document-presets/:id` → update with `name`, draft and `expectedRevision`.
- `DELETE /settings/document-presets/:id` → JSON `{ expectedRevision }`, returns `{ data: { deleted: true } }`.
- `POST /receipts/preview` → actual PDF bytes, `private, no-store`; complete unsaved draft plus optional authorized `orderId` (sample data otherwise). No persistence. At most two expensive previews concurrently (429 while busy), and 30 previews a minute per user (`429 RATE_LIMITED`).

Draft writes/preview accept multipart `payload` containing JSON plus optional `logo` file: one file ≤5 MiB, payload ≤64 KiB, bounded fields/parts/headers. `logoAction` is `keep` (default), `replace` (requires file) or `remove` (forbids file). Unknown fields/parts, MIME/byte mismatch, unsafe SVG and out-of-range values are rejected. JSON bodies work when no file is supplied.

Formatting `dateStyle` is `numeric | short | medium | long`. Legacy defaults use `numeric` (four-digit year, original numeric date/time presentation), medium time, language-resolved hour cycle and the fixed default timezone `Europe/Kyiv` (`DEFAULT_DOCUMENT_TIME_ZONE`) for accounts without saved formatting. Stored explicit styles are not rewritten. Blank custom titles return friendly 400 validation; the old receipt-title endpoint still accepts blank as an automatic-title reset.

Account Save needs a complete config; preset create/update use complete copies. Generation/replacement can use `config` or `presetId`+`presetRevision`, followed by partial `overrides`. Effective template entitlement is enforced. Presets have 1–80 character trimmed names, maximum 20 per tenant and bounded revisions. Foreign-tenant preset/logo IDs are rejected. Saving/selecting presets does not change defaults.

`GET /settings/templates` includes typed `capabilities`: actual company/recipient bindings, money, accent (Branded only), terms (Proforma only), generated timestamp, A4/Thermal paper, `signoff` (boolean: the style prints the account's signature and stamp image; true only for standard/classic/minimal/corporate), `documentTypes` (the document types the style can carry: always `waybill`, plus `invoice`, `act`, `sales_receipt`, `packing_list`, `quote` and `return_note` for standard/classic/minimal/corporate), logo bounds/alignment and template revision. Requests with declared Content-Length above 6 MiB are rejected early. Multipart raw streams are capped at 6 MiB before Multer, including preamble, boundaries, headers and epilogue, even without Content-Length (chunked transport). The bounded envelope is replayed only after complete capture; aborts/oversize never reach the controller. Multer file/field/part/header limits still apply. Automatic sizing preserves the actual original CSS geometry for all 15 styles: Compact synthetic 100×400 tall logos display at 30×120 px and 800×180 wide logos at 200×45 px; Thermal retains its legacy automatic cap inside the 80 mm paper. Manual sizing clamps Thermal to 120×72 px and other styles to 200×120 px. Retained unsupported config is not rendered.

Receipt list/create/get/void/share-revoke responses use small allowlisted projections; internal HTML/config/pending assets are private. New public metadata uses frozen visible values and formatting, with Delivery money omitted. Legacy metadata is explicitly unavailable when historical projection cannot be trusted; existing PDF access is preserved.

Automatic Corporate logos preserve the original 80 px height cap and 10 px bottom margin; explicit sizing remains within declared bounds. A tenant with 25 live unexpired uploading PDF/logo leases receives a retryable 409 on new upload reservation. Expired uncertain PUT intent stays durable but does not block ordinary new uploads; existing ready assets and preview remain available.
