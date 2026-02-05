# ReceiptMaster - Product Documentation

## Table of Contents

1. [Product Overview](#product-overview)
2. [Business Logic](#business-logic)
3. [API Endpoints](#api-endpoints)
4. [Data Models](#data-models)
5. [User Flows](#user-flows)

---

## Product Overview

### What is ReceiptMaster?

ReceiptMaster is a SaaS application for small businesses to manage products, track inventory, process orders, and generate professional PDF invoices/receipts. The system supports multi-tenancy where each user has isolated access to their own data.

### Core Features

| Feature | Description |
|---------|-------------|
| **Product Management** | Create, update, delete products with purchase/sale prices and inventory tracking |
| **Customer Management** | Manage recipients (customers) with contact information |
| **Order Processing** | Create orders with multiple items, custom pricing, status management |
| **Invoice Generation** | Generate professional PDF receipts with customizable templates |
| **Analytics Dashboard** | View revenue and turnover reports by product/customer |
| **Company Branding** | Upload logo, customize receipt appearance and footer text |
| **Multi-language Support** | UI and receipts available in English, Ukrainian, Russian |
| **Telegram Integration** | Create orders via Telegram bot |

### Technology Stack

- **Backend**: NestJS (Node.js), TypeORM, PostgreSQL
- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
- **PDF Generation**: Playwright (headless Chromium)
- **File Storage**: Hetzner Object Storage (S3-compatible)
- **Infrastructure**: Hetzner Cloud, Docker, GitHub Actions

---

## Business Logic

### User Authentication

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Register   │────►│  Get JWT    │────►│  Access     │
│  (email/pw) │     │  Token      │     │  Protected  │
└─────────────┘     └─────────────┘     │  Resources  │
                                        └─────────────┘
                                              │
┌─────────────┐     ┌─────────────┐           │
│   Login     │────►│  Get JWT    │───────────┘
│  (email/pw) │     │  Token      │
└─────────────┘     └─────────────┘
```

**Rules:**
- Email must be unique per user
- Password minimum 6 characters (hashed with bcrypt, 10 rounds)
- JWT tokens expire in 24 hours
- All resources are isolated by `user_id`

### Product Lifecycle

```
┌─────────────────────────────────────────────────────────┐
│                    PRODUCT                               │
├─────────────────────────────────────────────────────────┤
│  Fields:                                                 │
│  - name (required, max 255 chars)                       │
│  - purchase_price_cents (cost price, integer)           │
│  - sale_price_cents (selling price, integer)            │
│  - quantity (inventory count, integer >= 0)             │
│  - currency (default: UAH)                              │
└─────────────────────────────────────────────────────────┘
```

**Business Rules:**
1. All prices stored in cents (integer) to avoid floating-point errors
2. Quantity is decremented when order is created
3. Quantity is restored when order is deleted or items are removed
4. Cannot delete a product if it's used in CONFIRMED orders
5. Deleting a product removes associated order items from DRAFT orders

### Order Lifecycle

```
                    ┌─────────────┐
                    │   CREATE    │
                    │   ORDER     │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
            ┌───────│    DRAFT    │───────┐
            │       └──────┬──────┘       │
            │              │              │
            │              │              │
            ▼              ▼              ▼
     ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
     │   DELETE    │ │  CONFIRMED  │ │  CANCELLED  │
     │   (removed) │ └──────┬──────┘ └─────────────┘
     └─────────────┘        │              ▲
                           │              │
                           └──────────────┘
```

**Order Statuses:**

| Status | Description | Allowed Actions |
|--------|-------------|-----------------|
| `draft` | Order created, not finalized | Edit, Confirm, Cancel, Delete |
| `confirmed` | Order finalized, ready for receipt | Cancel, Generate Receipt |
| `cancelled` | Order cancelled | None (terminal state) |

**Business Rules:**
1. Orders must have at least one item
2. Each item must reference a valid product owned by the user
3. Item quantity must not exceed available product stock
4. Custom unit price can be specified per item (overrides product's sale price)
5. `subtotal_cents` = sum of all `line_total_cents`
6. `total_cents` = `subtotal_cents` (no taxes implemented yet)
7. Product data is denormalized into order items (product_name, unit_price) for historical accuracy
8. Inventory is decremented on order creation, restored on deletion

### Receipt (Invoice) Generation

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CONFIRMED     │────►│   GENERATE      │────►│   GENERATED     │
│   ORDER         │     │   RECEIPT       │     │   RECEIPT       │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌────────────────────────────────┼────────────────────────────────┐
                        │                                │                                │
                        ▼                                ▼                                ▼
                 ┌─────────────┐                  ┌─────────────┐                  ┌─────────────┐
                 │  DOWNLOAD   │                  │   PRINT     │                  │ REGENERATE  │
                 │    PDF      │                  │  (printer)  │                  │    PDF      │
                 └─────────────┘                  └─────────────┘                  └─────────────┘
```

**Receipt Statuses:**

| Status | Description |
|--------|-------------|
| `generated` | Active receipt with valid PDF |
| `void` | Cancelled/invalid receipt |

**Business Rules:**
1. Only CONFIRMED orders can have receipts generated
2. One active receipt per order (unique constraint on order_id)
3. Receipt number format: `YYYY-NNNNNN` (year + sequential 6-digit number)
4. PDF is stored in object storage with SHA-256 hash for integrity
5. Receipts can be regenerated (updates PDF, keeps same number)
6. System maintains maximum 10 receipts (oldest auto-deleted)

### Receipt Templates

| Template ID | Name | Description |
|-------------|------|-------------|
| `standard` | Standard | Full-featured invoice layout |
| `compact` | Compact | Condensed single-page format |
| `classic` | Classic | Traditional business style |
| `modern` | Modern | Contemporary minimalist design |
| `elegant` | Elegant | Premium sophisticated look |
| `vintage` | Vintage | Retro-styled invoice |
| `tech` | Tech | Technology company style |
| `wave` | Wave | Creative wavy design |
| `minimal` | Minimal | Ultra-clean minimal design |
| `corporate` | Corporate | Enterprise professional style |

### Revenue vs Turnover Calculation

**Revenue (Profit):**
```
Revenue = Σ (unit_price_cents - purchase_price_cents) × quantity
```
Revenue represents actual profit after subtracting cost.

**Turnover (Gross Sales):**
```
Turnover = Σ line_total_cents
```
Turnover represents total sales value without cost deduction.

### Inventory Management

```
┌─────────────────────────────────────────────────────────────────┐
│                     INVENTORY FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Product Created] ──► quantity = initial_quantity               │
│                                                                  │
│  [Order Created] ──► quantity -= order_item.qty                  │
│                                                                  │
│  [Order Item Updated] ──► quantity += old_qty, quantity -= new_qty│
│                                                                  │
│  [Order Deleted] ──► quantity += order_item.qty                  │
│                                                                  │
│  [Product Manually Updated] ──► quantity = new_value             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Tenancy Model

All data is isolated by `user_id`:

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER A                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Products │  │Recipients│  │  Orders  │  │ Receipts │        │
│  │ user_id=A│  │ user_id=A│  │ user_id=A│  │ user_id=A│        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         USER B                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Products │  │Recipients│  │  Orders  │  │ Receipts │        │
│  │ user_id=B│  │ user_id=B│  │ user_id=B│  │ user_id=B│        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Base URL

```
Development: http://localhost:3000/api/v1
Production:  https://your-domain.com/api/v1
```

### Authentication

All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

---

### Auth Endpoints

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (201):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Errors:**
- `409 USER_ALREADY_EXISTS` - Email already registered

---

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Errors:**
- `401 INVALID_CREDENTIALS` - Wrong email or password

---

#### Get Profile
```http
GET /auth/profile
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

#### Update Profile
```http
PATCH /auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newemail@example.com"
}
```

**Response (200):** Updated user object

**Errors:**
- `409 USER_ALREADY_EXISTS` - Email taken by another user

---

#### Change Password
```http
POST /auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

**Response (200):**
```json
{
  "message": "Пароль успешно изменен"
}
```

**Errors:**
- `400 VALIDATION_ERROR` - Passwords don't match or current password wrong

---

### Products Endpoints

#### Create Product
```http
POST /products
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Product Name",
  "purchase_price_cents": 5000,
  "sale_price_cents": 7500,
  "quantity": 100,
  "currency": "UAH"
}
```

**Response (201):** Created product object

---

#### List Products
```http
GET /products?limit=10&offset=0
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Product Name",
      "purchase_price_cents": 5000,
      "sale_price_cents": 7500,
      "quantity": 100,
      "currency": "UAH",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

---

#### Get Product
```http
GET /products/:id
Authorization: Bearer <token>
```

**Response (200):** Product object

**Errors:**
- `404 PRODUCT_NOT_FOUND` - Product doesn't exist or belongs to another user

---

#### Update Product
```http
PATCH /products/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "sale_price_cents": 8000
}
```

**Response (200):** Updated product object

---

#### Delete Product
```http
DELETE /products/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Product deleted"
}
```

**Errors:**
- `400 BAD_REQUEST` - Product used in confirmed orders

---

### Recipients Endpoints

#### Create Recipient
```http
POST /recipients
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Customer Name",
  "email": "customer@example.com",
  "phone": "+380501234567",
  "address": "123 Main St, City"
}
```

**Response (201):** Created recipient object

---

#### List Recipients
```http
GET /recipients?limit=10&offset=0
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Customer Name",
      "email": "customer@example.com",
      "phone": "+380501234567",
      "address": "123 Main St, City",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

---

#### Get Recipient
```http
GET /recipients/:id
Authorization: Bearer <token>
```

---

#### Update Recipient
```http
PATCH /recipients/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone": "+380509876543"
}
```

---

#### Delete Recipient
```http
DELETE /recipients/:id
Authorization: Bearer <token>
```

**Errors:**
- `400 BAD_REQUEST` - Recipient has associated orders

---

### Orders Endpoints

#### Create Order
```http
POST /orders
Authorization: Bearer <token>
Content-Type: application/json
Idempotency-Key: unique-request-id-123

{
  "recipientId": "recipient-uuid",
  "items": [
    {
      "productId": "product-uuid",
      "qty": 2,
      "unitPriceCents": 7500
    },
    {
      "productId": "another-product-uuid",
      "qty": 1
    }
  ]
}
```

**Notes:**
- `unitPriceCents` is optional; defaults to product's `sale_price_cents`
- `Idempotency-Key` header prevents duplicate orders on retries

**Response (201):** Created order object with items

**Errors:**
- `404 RECIPIENT_NOT_FOUND` - Invalid recipient
- `404 PRODUCT_NOT_FOUND` - Invalid product
- `400 VALIDATION_ERROR` - Insufficient stock

---

#### List Orders
```http
GET /orders?limit=10&offset=0&status=draft
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` - Items per page (default: 10)
- `offset` - Skip items (default: 0)
- `status` - Filter by status: `draft`, `confirmed`, `cancelled`

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "recipient_id": "recipient-uuid",
      "status": "draft",
      "subtotal_cents": 22500,
      "total_cents": 22500,
      "currency": "UAH",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "recipient": { ... },
      "items": [ ... ],
      "receipts": [ ... ]
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 10
}
```

---

#### Get Order
```http
GET /orders/:id
Authorization: Bearer <token>
```

**Response (200):** Full order object with recipient, items, receipts

---

#### Update Order
```http
PATCH /orders/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "recipientId": "new-recipient-uuid",
  "items": [
    {
      "productId": "product-uuid",
      "qty": 3
    }
  ]
}
```

**Notes:**
- Only DRAFT orders can be updated
- Updating items replaces all existing items
- Inventory is adjusted automatically

**Errors:**
- `400 ORDER_CANNOT_BE_MODIFIED` - Order not in DRAFT status

---

#### Confirm Order
```http
PATCH /orders/:id/confirm
Authorization: Bearer <token>
```

**Response (200):** Order with status `confirmed`

**Errors:**
- `400 ORDER_CANNOT_BE_MODIFIED` - Order not in DRAFT status

---

#### Cancel Order
```http
PATCH /orders/:id/cancel
Authorization: Bearer <token>
```

**Response (200):** Order with status `cancelled`

**Errors:**
- `400 ORDER_ALREADY_CANCELLED` - Already cancelled

---

#### Delete Order
```http
DELETE /orders/:id
Authorization: Bearer <token>
```

**Notes:**
- Inventory is restored for all items
- Associated receipts and PDF files are deleted

---

### Dashboard Endpoints

#### Total Revenue
```http
GET /orders/dashboard/total-revenue?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "total_revenue_cents": 150000,
  "total_orders": 25,
  "currency": "UAH"
}
```

---

#### Revenue by Products
```http
GET /orders/dashboard/revenue-by-products?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

**Response (200):**
```json
[
  {
    "product_id": "uuid",
    "product_name": "Product Name",
    "total_revenue_cents": 50000,
    "total_quantity": 20,
    "currency": "UAH"
  }
]
```

---

#### Revenue by Recipients
```http
GET /orders/dashboard/revenue-by-recipients?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

**Response (200):**
```json
[
  {
    "recipient_id": "uuid",
    "recipient_name": "Customer Name",
    "total_revenue_cents": 75000,
    "total_orders": 10,
    "currency": "UAH"
  }
]
```

---

#### Total Turnover
```http
GET /orders/dashboard/total-turnover?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

---

#### Turnover by Products
```http
GET /orders/dashboard/turnover-by-products?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

---

#### Turnover by Recipients
```http
GET /orders/dashboard/turnover-by-recipients?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

---

### Receipts Endpoints

#### Generate Receipt
```http
POST /receipts/orders/:orderId/receipt
Authorization: Bearer <token>
```

**Response (201):**
```json
{
  "id": "uuid",
  "order_id": "order-uuid",
  "number": "2024-000001",
  "pdf_url": "https://storage.example.com/receipts/...",
  "pdf_path": "object-storage://bucket/receipts/...",
  "hash": "sha256...",
  "status": "generated",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**Errors:**
- `400 ORDER_CANNOT_BE_MODIFIED` - Order not CONFIRMED
- `409 RECEIPT_ALREADY_EXISTS` - Receipt already generated

---

#### List Receipts
```http
GET /receipts
Authorization: Bearer <token>
```

---

#### Get Receipt
```http
GET /receipts/:id
Authorization: Bearer <token>
```

---

#### Download PDF
```http
GET /receipts/:id/pdf
Authorization: Bearer <token>
```

**Response:** Binary PDF file with `Content-Disposition: attachment`

---

#### Regenerate Receipt
```http
POST /receipts/:id/regenerate
Authorization: Bearer <token>
```

**Notes:** Regenerates PDF with current template settings, keeps same receipt number

---

#### Get Available Printers
```http
GET /receipts/printers
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "printers": ["HP LaserJet", "EPSON TM-T20"]
}
```

---

#### Print Receipt
```http
POST /receipts/:id/print?printer=HP%20LaserJet
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Чек 2024-000001 отправлен на печать (принтер: HP LaserJet)"
}
```

---

### Settings Endpoints

#### Upload Logo
```http
POST /settings/logo/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

logo: <binary file>
```

**Response (200):**
```json
{
  "message": "Logo uploaded successfully",
  "url": "https://storage.example.com/logos/..."
}
```

---

#### Get Logo
```http
GET /settings/logo
Authorization: Bearer <token>
```

**Response:** Binary image file

---

#### Delete Logo
```http
POST /settings/logo/delete
Authorization: Bearer <token>
```

---

#### Get Available Templates
```http
GET /settings/templates
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "compact",
      "name": "Compact",
      "description": "Condensed single-page format",
      "category": "business",
      "features": ["compact", "professional"],
      "colors": {
        "primary": "#1a365d",
        "secondary": "#2d3748",
        "accent": "#3182ce"
      }
    }
  ]
}
```

---

#### Get/Set Template
```http
GET /settings/template
Authorization: Bearer <token>

POST /settings/template
Authorization: Bearer <token>
Content-Type: application/json

{
  "templateId": "modern"
}
```

---

#### Get/Set Receipt Title
```http
GET /settings/receipt-title
POST /settings/receipt-title
{ "title": "INVOICE" }
```

---

#### Get/Set Template Language
```http
GET /settings/template-language
POST /settings/template-language
{ "language": "en" }
```

**Supported:** `en`, `uk`, `ru`

---

#### Get/Set Footer Title
```http
GET /settings/footer-title
POST /settings/footer-title
{ "footerTitle": "Thank you for your business!" }
```

---

#### Get/Set Footer Subtitle
```http
GET /settings/footer-subtitle
POST /settings/footer-subtitle
{ "footerSubtitle": "Contact us at support@company.com" }
```

---

#### Get/Set Company Info
```http
GET /settings/company-info
POST /settings/company-info
{
  "companyName": "Acme Corporation",
  "companyAddress": "123 Business St, City, Country",
  "companyEmail": "billing@acme.com",
  "companyPhone": "+1-555-123-4567",
  "companyTaxId": "123456789",
  "companyIban": "UA213223130000026007233566001",
  "companySwift": "XXXXXXXXX",
  "companyWebsite": "https://acme.com",
  "companyTagline": "Quality products since 1990"
}
```

---

### Health Check

```http
GET /health
```

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600
}
```

---

## Data Models

### User
```typescript
{
  id: UUID;
  email: string;          // Unique
  password: string;       // Bcrypt hashed
  isActive: boolean;      // Default: true
  createdAt: DateTime;
  updatedAt: DateTime;
}
```

### Product
```typescript
{
  id: UUID;
  name: string;                  // Max 255 chars
  purchase_price_cents: number;  // Cost price in cents
  sale_price_cents: number;      // Selling price in cents
  quantity: number;              // Inventory count
  currency: "UAH";               // Currency code
  user_id: UUID;                 // Owner
  created_at: DateTime;
  updated_at: DateTime;
}
```

### Recipient
```typescript
{
  id: UUID;
  name: string;                  // Required
  email?: string;
  phone?: string;
  address?: string;
  telegram_user_id?: string;     // Telegram integration
  username?: string;
  first_name?: string;
  last_name?: string;
  user_id: UUID;                 // Owner
  created_at: DateTime;
  updated_at: DateTime;
}
```

### Order
```typescript
{
  id: UUID;
  recipient_id: UUID;
  status: "draft" | "confirmed" | "cancelled";
  subtotal_cents: number;
  total_cents: number;
  currency: string;
  created_by: string;            // Default: "manually"
  user_id: UUID;                 // Owner
  created_at: DateTime;
  updated_at: DateTime;

  // Relations
  recipient: Recipient;
  items: OrderItem[];
  receipts: Receipt[];
}
```

### OrderItem
```typescript
{
  id: UUID;
  order_id: UUID;
  product_id: UUID;
  product_name: string;          // Denormalized
  unit_price_cents: number;      // Denormalized
  qty: number;
  line_total_cents: number;      // unit_price_cents × qty
  user_id: UUID;                 // Owner
}
```

### Receipt
```typescript
{
  id: UUID;
  order_id: UUID;                // Unique
  number: string;                // Unique, format: YYYY-NNNNNN
  pdf_url?: string;              // Public URL
  pdf_path?: string;             // Storage path
  hash?: string;                 // SHA-256 of PDF
  status: "generated" | "void";
  user_id: UUID;                 // Owner
  created_at: DateTime;
}
```

### UserSettings
```typescript
{
  id: UUID;
  userId: UUID;                  // Unique
  templateId: string;            // Default: "compact"
  companyName?: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyTaxId?: string;
  companyIban?: string;
  companySwift?: string;
  companyWebsite?: string;
  companyTagline?: string;
  receiptTitle: string;          // Default: "Invoice"
  templateLanguage: string;      // Default: "en"
  footerTitle?: string;
  footerSubtitle?: string;
}
```

---

## User Flows

### New User Onboarding

```
1. User visits landing page
2. Clicks "Register"
3. Enters email and password
4. System creates account and issues JWT
5. User redirected to dashboard
6. User sees empty state prompts
7. User creates first product
8. User creates first recipient
9. User creates first order
10. User generates first receipt
```

### Order Creation Flow

```
1. User navigates to Orders page
2. Clicks "Create Order"
3. Selects recipient from dropdown
4. Adds products with quantities
5. (Optional) Adjusts unit prices
6. Reviews order total
7. Saves as Draft
8. Reviews draft order
9. Clicks "Confirm"
10. Order status changes to Confirmed
11. User can now generate receipt
```

### Receipt Generation Flow

```
1. User has confirmed order
2. Clicks "Generate Receipt"
3. System renders HTML template with:
   - Company info
   - Customer info
   - Order items
   - Totals
   - Footer
4. Playwright converts HTML to PDF
5. PDF uploaded to S3
6. Receipt record created in database
7. User can download/print PDF
```

### Settings Customization Flow

```
1. User navigates to Settings
2. Uploads company logo (PNG/JPG)
3. Fills company information
4. Selects receipt template
5. Sets receipt title (e.g., "INVOICE")
6. Selects template language
7. Customizes footer text
8. Changes saved automatically
9. Next receipt uses new settings
```

---

## Error Codes Reference

| Code | HTTP | Description |
|------|------|-------------|
| `USER_ALREADY_EXISTS` | 409 | Email already registered |
| `USER_NOT_FOUND` | 404 | User ID not found |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `ORDER_NOT_FOUND` | 404 | Order ID not found |
| `ORDER_ALREADY_CONFIRMED` | 400 | Order already confirmed |
| `ORDER_ALREADY_CANCELLED` | 400 | Order already cancelled |
| `ORDER_CANNOT_BE_MODIFIED` | 400 | Order not in modifiable state |
| `PRODUCT_NOT_FOUND` | 404 | Product ID not found |
| `PRODUCT_ALREADY_EXISTS` | 409 | Product name conflict |
| `RECIPIENT_NOT_FOUND` | 404 | Recipient ID not found |
| `RECIPIENT_ALREADY_EXISTS` | 409 | Recipient email conflict |
| `RECEIPT_NOT_FOUND` | 404 | Receipt ID not found |
| `RECEIPT_ALREADY_EXISTS` | 409 | Receipt already generated for order |
| `RECEIPT_GENERATION_FAILED` | 500 | PDF generation error |
| `RECEIPT_PRINT_FAILED` | 500 | Printing error |
| `FILE_NOT_FOUND` | 404 | File doesn't exist |
| `FILE_UPLOAD_FAILED` | 500 | Upload error |
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `REQUIRED_FIELD_MISSING` | 400 | Required field not provided |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Access denied |
| `BAD_REQUEST` | 400 | Invalid request |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

---

*Last Updated: February 2026*
