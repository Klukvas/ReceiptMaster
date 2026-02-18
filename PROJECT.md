# ReceiptMaster - Project Documentation

**Full-featured multi-tenant SaaS for order management, invoice/receipt generation, and business analytics.**

---

## Table of Contents

1. [Technologies](#technologies)
2. [Features](#features)
3. [UI Screens](#ui-screens)
4. [API Endpoints](#api-endpoints)
5. [Database Schema](#database-schema)
6. [Infrastructure](#infrastructure)

---

## Technologies

| Layer | Technology | Version |
|---|---|---|
| **Frontend** | React | 19.1 |
| | TypeScript | ~5.8 |
| | Vite | 7.1 |
| | Tailwind CSS | 4.1 (v4) |
| | React Router | 7.8 |
| | TanStack React Query | 5.86 |
| | Recharts | latest |
| | i18next | 25.6 |
| | Axios | 1.11 |
| | Lucide React (icons) | 0.542 |
| **Backend** | NestJS | 10 |
| | TypeORM | 0.3 |
| | Node.js | 20 |
| | Passport + JWT | latest |
| | class-validator / class-transformer | latest |
| | Zod (env validation) | latest |
| | Swagger / OpenAPI | latest |
| | BullMQ (job queue) | 5.69 |
| | ioredis | 5.9 |
| **Database** | PostgreSQL | 15 (Alpine) |
| **Caching & Queues** | Redis | 7 (Alpine) |
| **PDF Generation** | Playwright (Chromium) | 1.57 |
| | Handlebars | latest |
| **Object Storage** | Hetzner Object Storage | S3-compatible (AWS SDK v2) |
| **Infrastructure** | Docker / Docker Compose | 3.8+ |
| | Terraform (Hetzner Cloud) | ~1.0 |
| | Nginx | Alpine |
| | GitHub Actions | CI/CD |
| **Telegram** | Telegram Bot API | via Axios |

---

## Features

### Authentication & Security
- JWT-based authentication (24h access token expiry)
- Refresh token rotation (7-day expiry, stored in DB, revokable)
- `POST /auth/refresh` and `POST /auth/logout` endpoints
- User registration and login with bcrypt hashing (10 salt rounds)
- Login rate limiting via `@nestjs/throttler` (5 requests/min on register + login)
- Profile management (email update, password change)
- Multi-tenant data isolation — every entity scoped to authenticated user
- PostgreSQL Row-Level Security (RLS) policies on all tenant tables
- Tenant context propagated via `AsyncLocalStorage` + TypeORM subscriber
- Request ID middleware for log correlation (UUID per request)
- Audit logging — every CUD operation recorded with old/new values, IP, user-agent

### Product Management
- Full CRUD for products
- Purchase price and sale price (stored in cents)
- Inventory/quantity tracking with low-stock alerts
- Margin % calculation (color-coded: red <10%, yellow 10-30%, green >=30%)
- Stock status badges (red=0, orange=<5, yellow=<10, green=>=10)
- Currency support (UAH)
- Bulk delete with selection checkboxes
- Prevents deletion of products used in confirmed orders
- Search with 400ms debounce, sortable columns, server-side paginated lists

### Recipient (Customer) Management
- Full CRUD for recipients
- Fields: name, email, phone, address
- Telegram integration fields (telegram_user_id, username, first/last name)
- Aggregated stats: total spent, order count (displayed in table)
- Telegram badge indicator for linked recipients
- Recipient detail drawer (slide-over panel with order history)
- Prevents deletion when linked to orders

### Order Management
- Full CRUD with status workflow: `DRAFT` -> `CONFIRMED` -> `CANCELLED`
- Payment status tracking: `UNPAID` | `PAID` | `REFUNDED`
- Soft delete (`deleted_at` column, hidden from listings but recoverable)
- Order locking (`is_locked`) — confirmed orders with receipts are locked against edits
- Multi-item orders with per-item custom pricing
- Idempotency via `Idempotency-Key` header (24h dedup, PG advisory locks for race protection)
- Idempotency key cleanup cron (every 6 hours)
- Database transactions with pessimistic locking
- Denormalized product name/price at time of purchase
- Product quantity validation against available stock
- Advanced filtering: status, date range, amount range (min/max)
- Inline confirm/cancel actions from the table

### Receipt / Invoice Generation
- **Background PDF generation** via BullMQ queue (non-blocking, with retry)
- Status flow: `PROCESSING` -> `GENERATED` (or failed -> deleted for retry)
- PDF generation using Playwright (headless Chromium) + Handlebars templates
- HTML snapshot stored alongside PDF for audit
- Template ID and version tracked per receipt
- 10 receipt templates: Standard, Compact, Classic, Modern, Elegant, Vintage, Tech, Wave, Minimal, Corporate
- Multi-language receipt rendering (EN, UK, RU)
- Upload to Hetzner Object Storage (S3-compatible)
- SHA256 hash for receipt integrity
- **Receipt voiding** — `POST /receipts/:id/void` marks receipt as VOID and unlocks the order
- **Test receipt preview** — generate a sample PDF without saving
- Download PDF, open in new tab, or send to system printer
- Regenerate receipts on demand
- Unique receipt numbering (YYYY-NNNNNN)
- Frontend polling: auto-refreshes every 3s while receipts are processing

### Settings & Branding
- Company logo upload (JPG, PNG, GIF, SVG — max 5 MB) to S3
- Company information: name, address, email, phone, tax ID, IBAN, SWIFT, website, tagline
- Receipt template selection with preview
- Receipt title, footer title, footer subtitle customization
- Template language selection (EN, UK, RU)
- Test receipt button — preview how settings look on a real receipt
- Settings organized into 4 tabs: Company Info | Receipt Design | Language | Advanced

### Dashboard & Analytics
- **Dashboard Home** — stat cards, sparkline chart, order status donut, low-stock widget
- Revenue sparkline (7d/30d toggle)
- Order status summary — donut chart (draft/confirmed/cancelled counts)
- Low stock widget — products below threshold (default 10)
- Revenue by products / by recipients / total (with date range)
- Turnover by products / by recipients / total (with date range)
- Quick date presets (7d, 30d, 90d, 1 year) + custom date range
- CSV export for analytics data
- Redis caching for dashboard queries (5-min TTL, invalidated on order changes)
- Skeleton loaders during data fetch

### Telegram Bot Integration
- Shopping cart via Telegram UI (inline buttons + text input)
- Commands: `/start`, `/help`, `/products`, `/cart`, `/order`, `/update`, `/clear`
- Product listing with inline "Add to cart" buttons
- Quantity input and stock validation
- Order review with confirm/cancel/edit options
- Automatic recipient creation (find-or-create by telegram_user_id)
- **Redis-backed session management** (4h TTL, survives restarts)
- Webhook with optional secret token verification
- Rate-limit retry handling (429)
- Update deduplication via `tg_updates` table

### Frontend UX
- Dark / Light theme (persisted to localStorage)
- Responsive design: table view (desktop), card view (mobile)
- Collapsible sidebar with icon navigation
- Toast notifications (auto-dismiss 3s)
- i18n: English, Russian, Ukrainian (auto-detected from browser)
- Server-side pagination with per-page preference saved to localStorage
- Column visibility toggle (show/hide table columns)
- Reusable DataTable component with sorting, search, selection
- Modal dialogs for create/edit forms
- Confirmation dialogs for destructive actions
- Loading skeletons throughout

---

## UI Screens

### 1. Landing Page (`/`)

Public marketing page with glassmorphism design and animated gradients.

- Hero section with parallax scrolling and CTA buttons
- 6 feature cards: Products, Recipients, Orders, Receipts, Analytics, Security
- Benefits checklist (Easy, Fast, Secure, Multilingual, Responsive, Real-time)
- Stats preview (99.9% Uptime, 10K+ Receipts, 1K+ Users, 4.9 Rating)
- Login / Register modals (triggered from header buttons)
- Theme toggle (dark/light) and language switcher
- Authenticated users see "Go to Dashboard" instead of login

### 2. Dashboard Home (`/dashboard`)

Overview of the entire business at a glance.

- **Welcome banner** with gradient background
- **4 entity stat cards** — total products, recipients, orders, receipts (clickable to navigate)
- **2 financial summary cards** — total revenue and total turnover
- **Revenue sparkline** — area chart with 7d/30d toggle
- **Order status donut chart** — draft / confirmed / cancelled breakdown
- **Low stock widget** — products with quantity below threshold, color-coded badges
- **Latest items** — 5 most recent products, recipients, and orders with "View All" links
- **Quick actions** — Add Product, Add Recipient, Create Order, View Analytics
- Skeleton loaders while data loads; empty states when no data

### 3. Products Page (`/products`)

Full product inventory management.

- **Data table** with server-side pagination (10/20/50/100 per page)
- **Columns**: Name (sortable), Purchase Price, Sale Price, Margin %, Quantity (stock badge), Currency
- **Margin %** — color-coded: red (<10%), yellow (10-30%), green (>=30%)
- **Stock badges** — red (0), orange (<5), yellow (<10), green (>=10)
- **Search bar** with 400ms debounce
- **Column visibility toggle** — show/hide individual columns
- **Row selection** with checkboxes for bulk operations
- **Bulk delete** — select multiple, confirm, delete in one request
- **Create product** — modal with name, purchase price, sale price, quantity, currency
- **Edit product** — same modal, pre-filled
- **Delete product** — confirmation dialog (blocked if product in confirmed orders)
- Pagination controls and items-per-page selector

### 4. Recipients Page (`/recipients`)

Customer management with aggregated analytics.

- **Data table** with server-side pagination
- **Columns**: Name (clickable), Email, Phone, Order Count, Total Spent, Address (hidden by default)
- **Telegram badge** — icon displayed next to name if recipient has a linked Telegram account
- **Recipient drawer** — click a name to open a slide-over panel with full details and order history
- **Search** and **column visibility toggle**
- **Create/Edit** recipient via modal (name, email, phone, address)
- **Delete** with confirmation (blocked if recipient has orders)

### 5. Orders Page (`/orders`)

Order lifecycle management with advanced filtering.

- **Data table** with server-side pagination
- **Columns**: Recipient (with lock icon if locked), Status + Receipt badge, Payment Status, Total, Date
- **Status filter** dropdown — All / Draft / Confirmed / Cancelled
- **Advanced filters** (collapsible card):
  - Date range (start date, end date)
  - Amount range (min, max in currency)
  - Active filter indicator + clear button
- **Receipt status badge**: Processing (blue spinner), Generated (green), VOID (red strikethrough)
- **Lock icon** — displayed when `is_locked = true` (order has a generated receipt)
- **Context-dependent actions per row**:
  - View order details (always)
  - Edit order (draft only)
  - Confirm order (draft only)
  - Cancel order (draft only)
  - Generate receipt (confirmed, no receipt)
  - Download / Print receipt (when generated)
  - Delete order (with confirmation)
- **Create order** — modal with recipient selector, product picker, quantities
- **Edit order** — modify items/quantities on draft orders
- **Order details** — read-only modal showing all order info and items
- **Real-time polling** — auto-refreshes every 3s when any receipt is in "Processing" state
- **Responsive** — switches to card layout on mobile

### 6. Analytics Page (`/analytics`)

Revenue and turnover analytics with charts and export.

- **Two tabs**: Revenue | Turnover
- **Date filter card**:
  - Quick presets: 7d, 30d, 90d, 1 year
  - Custom date range (start/end inputs)
  - Clear dates button
- **CSV export button** — downloads filtered data as `.csv`
- **Revenue tab**: bar charts for revenue by product, sortable table with metrics
- **Turnover tab**: bar charts for turnover by product, sortable table with metrics
- Data updates reactively when date range changes

### 7. Settings Page (`/settings`)

All branding and configuration options organized into tabs.

- **Tab 1 — Company Info**:
  - Logo upload (drag & drop or click, 5 MB max, image formats)
  - Logo preview with delete option
  - Company details form: name, address, phone, email, tax ID, IBAN, SWIFT, website, tagline

- **Tab 2 — Receipt Design**:
  - Receipt title customizer (main title text)
  - Template selector — visual grid of 10 templates with preview
  - Footer customizer (footer title + subtitle)
  - Test receipt button — generates a sample PDF with current settings to preview

- **Tab 3 — Language**:
  - Language selector for receipt rendering (EN / UK / RU)

- **Tab 4 — Advanced**:
  - Placeholder for future settings

### 8. Profile Page (`/profile`)

User account management.

- **Left sidebar** (1/3 width):
  - Avatar circle with user initial
  - Email display
  - Edit Profile / Change Password buttons
- **Profile card** — view and edit email
- **Change password card** (toggled):
  - Current password, new password, confirm password
  - Show/hide password toggles
  - Validation: minimum 6 chars, must match
- **Account actions** — delete account (placeholder)

---

## API Endpoints

All protected endpoints require `Authorization: Bearer <jwt>`.
Base path: `/api/v1` (configurable via `API_PREFIX`).
Swagger docs available at `/api/docs`.

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Health check (DB, S3, Redis status + uptime) |

### Authentication (`/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | No | Register a new user (throttled: 5/min) |
| `POST` | `/auth/login` | No | Login, returns access + refresh tokens (throttled: 5/min) |
| `POST` | `/auth/refresh` | No | Rotate access token using refresh token |
| `POST` | `/auth/logout` | Yes | Revoke refresh token |
| `GET` | `/auth/profile` | Yes | Get current user profile |
| `PATCH` | `/auth/profile` | Yes | Update profile (email) |
| `POST` | `/auth/change-password` | Yes | Change password |

### Products (`/products`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/products` | Yes | Create product |
| `GET` | `/products` | Yes | List products (paginated, searchable, sortable) |
| `GET` | `/products/low-stock` | Yes | Products below stock threshold (`?threshold=10`) |
| `GET` | `/products/:id` | Yes | Get product by ID |
| `PATCH` | `/products/:id` | Yes | Update product |
| `DELETE` | `/products/bulk` | Yes | Bulk delete (`{ ids: string[] }`) |
| `DELETE` | `/products/:id` | Yes | Delete product (fails if in confirmed orders) |

### Recipients (`/recipients`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/recipients` | Yes | Create recipient |
| `GET` | `/recipients` | Yes | List recipients (paginated, with order count + total spent) |
| `GET` | `/recipients/:id` | Yes | Get recipient by ID |
| `PATCH` | `/recipients/:id` | Yes | Update recipient |
| `DELETE` | `/recipients/:id` | Yes | Delete recipient (fails if has orders) |

### Orders (`/orders`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/orders` | Yes | Create order (supports `Idempotency-Key` header) |
| `GET` | `/orders` | Yes | List orders (status, date range, amount range filters) |
| `GET` | `/orders/:id` | Yes | Get order by ID |
| `PATCH` | `/orders/:id` | Yes | Update order (draft only, rejects if locked) |
| `PATCH` | `/orders/:id/confirm` | Yes | Confirm order |
| `PATCH` | `/orders/:id/cancel` | Yes | Cancel order |
| `DELETE` | `/orders/:id` | Yes | Soft-delete order |

### Dashboard / Analytics (`/orders/dashboard`)

All support optional `startDate` and `endDate` query params (validated as ISO date strings).

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/orders/dashboard/daily-revenue` | Yes | Daily revenue/turnover for sparkline (`?days=7`) |
| `GET` | `/orders/dashboard/status-summary` | Yes | Order counts by status (draft/confirmed/cancelled) |
| `GET` | `/orders/dashboard/revenue-by-products` | Yes | Revenue breakdown by product |
| `GET` | `/orders/dashboard/revenue-by-recipients` | Yes | Revenue breakdown by recipient |
| `GET` | `/orders/dashboard/total-revenue` | Yes | Total revenue summary |
| `GET` | `/orders/dashboard/turnover-by-products` | Yes | Turnover by product |
| `GET` | `/orders/dashboard/turnover-by-recipients` | Yes | Turnover by recipient |
| `GET` | `/orders/dashboard/total-turnover` | Yes | Total turnover summary |

### Receipts (`/receipts`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/receipts/orders/:orderId/receipt` | Yes | Generate receipt (background, uses user template) |
| `POST` | `/receipts/orders/:orderId/receipt/compact` | Yes | Generate compact receipt |
| `POST` | `/receipts/orders/:orderId/receipt/standard` | Yes | Generate standard receipt |
| `GET` | `/receipts` | Yes | List all receipts |
| `GET` | `/receipts/:id` | Yes | Get receipt metadata |
| `GET` | `/receipts/:id/pdf` | Yes | Download receipt PDF |
| `POST` | `/receipts/:id/print` | Yes | Print receipt (optional `printer` param) |
| `POST` | `/receipts/:id/void` | Yes | Void receipt and unlock order (`{ reason }`) |
| `POST` | `/receipts/:id/regenerate` | Yes | Force regenerate receipt PDF |
| `POST` | `/receipts/test-preview` | Yes | Generate test receipt (not saved) |
| `GET` | `/receipts/printers` | Yes | List available printers |

### Settings (`/settings`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/settings/logo/upload` | Yes | Upload company logo (max 5 MB, images only) |
| `GET` | `/settings/logo` | Yes | Download company logo |
| `GET` | `/settings/logo/exists` | Yes | Check if logo exists |
| `POST` | `/settings/logo/delete` | Yes | Delete company logo |
| `GET` | `/settings/templates` | Yes | List available receipt templates |
| `GET` | `/settings/template` | Yes | Get selected template ID |
| `POST` | `/settings/template` | Yes | Set receipt template |
| `GET` | `/settings/receipt-title` | Yes | Get receipt title |
| `POST` | `/settings/receipt-title` | Yes | Set receipt title |
| `GET` | `/settings/template-language` | Yes | Get template language |
| `POST` | `/settings/template-language` | Yes | Set template language |
| `GET` | `/settings/footer-title` | Yes | Get footer text |
| `POST` | `/settings/footer-title` | Yes | Set footer text |
| `GET` | `/settings/footer-subtitle` | Yes | Get footer subtitle |
| `POST` | `/settings/footer-subtitle` | Yes | Set footer subtitle |
| `GET` | `/settings/company-info` | Yes | Get all company information |
| `POST` | `/settings/company-info` | Yes | Update company information |

### Telegram (outside API prefix)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/tg/webhook` | No (optional secret token) | Telegram bot webhook |

---

## Database Schema

### Users (`users`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| email | VARCHAR | Unique |
| password | VARCHAR | Bcrypt hashed |
| isActive | BOOLEAN | Default: true |
| createdAt | TIMESTAMP | |
| updatedAt | TIMESTAMP | |

### Products (`products`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | VARCHAR(255) | |
| purchase_price_cents | INTEGER | Price in cents |
| sale_price_cents | INTEGER | Price in cents |
| quantity | INTEGER | Default: 0 |
| currency | ENUM | UAH |
| user_id | UUID | FK -> Users |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Indexes: `(user_id, name)`. RLS enabled.

### Recipients (`recipients`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | VARCHAR(255) | |
| email | VARCHAR(255) | Nullable |
| phone | VARCHAR(50) | Nullable |
| address | TEXT | Nullable |
| telegram_user_id | VARCHAR(50) | Nullable, unique |
| username | VARCHAR(255) | Nullable |
| first_name | VARCHAR(255) | Nullable |
| last_name | VARCHAR(255) | Nullable |
| user_id | UUID | FK -> Users |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Indexes: `(user_id, phone)`. RLS enabled.

### Orders (`orders`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| recipient_id | UUID | FK -> Recipients (indexed) |
| status | ENUM | DRAFT, CONFIRMED, CANCELLED |
| payment_status | ENUM | UNPAID, PAID, REFUNDED |
| subtotal_cents | INTEGER | |
| total_cents | INTEGER | |
| currency | VARCHAR(3) | |
| created_by | VARCHAR(50) | Default: "manually" |
| is_locked | BOOLEAN | Default: false |
| user_id | UUID | FK -> Users |
| deleted_at | TIMESTAMP | Soft delete (nullable) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Indexes: `(user_id, status)`, `(user_id, created_at DESC)`, partial index on `deleted_at IS NULL`. RLS enabled.

### Order Items (`order_items`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| order_id | UUID | FK -> Orders (indexed) |
| product_id | UUID | FK -> Products (indexed) |
| product_name | VARCHAR(255) | Denormalized |
| unit_price_cents | INTEGER | Denormalized |
| qty | INTEGER | |
| line_total_cents | INTEGER | |
| user_id | UUID | FK -> Users |

RLS enabled.

### Receipts (`receipts`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| order_id | UUID | FK -> Orders (unique) |
| number | VARCHAR(50) | Unique, auto-generated (YYYY-NNNNNN) |
| pdf_url | VARCHAR(500) | Nullable |
| pdf_path | VARCHAR(500) | Object storage path |
| hash | VARCHAR(64) | SHA256 integrity hash |
| status | ENUM | PROCESSING, GENERATED, VOID |
| html_snapshot | TEXT | Rendered HTML at generation time |
| template_id | VARCHAR(50) | Template used |
| template_version | INTEGER | Default: 1 |
| voided_at | TIMESTAMP | Nullable |
| void_reason | VARCHAR(500) | Nullable |
| user_id | UUID | FK -> Users |
| created_at | TIMESTAMP | |

Indexes: `(user_id, created_at DESC)`. RLS enabled.

### Refresh Tokens (`refresh_tokens`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| token | VARCHAR(500) | Indexed |
| user_id | UUID | FK -> Users (cascade delete) |
| expires_at | TIMESTAMP | 7-day expiry |
| revoked | BOOLEAN | Default: false |
| created_at | TIMESTAMP | |

### Idempotency Keys (`idempotency_keys`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| key | VARCHAR(255) | Composite unique with user_id |
| user_id | UUID | |
| order_id | UUID | Nullable |
| response | JSONB | Cached response body |
| status_code | INTEGER | Default: 200 |
| created_at | TIMESTAMP | |
| expires_at | TIMESTAMP | 24h expiration |

### User Settings (`user_settings`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| userId | VARCHAR | Unique |
| templateId | VARCHAR | Default: "standard" |
| receiptTitle | VARCHAR | Default: "Invoice" |
| templateLanguage | VARCHAR | Default: "en" |
| footerText | VARCHAR | Nullable |
| subFooterText | VARCHAR | Nullable |
| headerText | VARCHAR | Nullable |
| companyName | VARCHAR | Nullable |
| companyAddress | VARCHAR | Nullable |
| companyEmail | VARCHAR | Nullable |
| companyPhone | VARCHAR | Nullable |
| companyTaxId | VARCHAR | Nullable |
| companyIban | VARCHAR | Nullable |
| companySwift | VARCHAR | Nullable |
| companyWebsite | VARCHAR | Nullable |
| companyTagline | VARCHAR | Nullable |
| createdAt | TIMESTAMP | |
| updatedAt | TIMESTAMP | |

### Audit Logs (`audit_logs`)

| Column | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID | Nullable, indexed |
| action | VARCHAR(50) | CREATE, UPDATE, DELETE |
| entity_type | VARCHAR(50) | e.g. Order, Product |
| entity_id | VARCHAR(255) | Nullable |
| old_values | JSONB | Nullable |
| new_values | JSONB | Nullable |
| ip_address | VARCHAR(45) | Nullable |
| user_agent | VARCHAR(500) | Nullable |
| request_id | VARCHAR(36) | Correlation ID |
| created_at | TIMESTAMP | Indexed |

---

## Infrastructure

### Architecture Overview

```
   Internet
      |
      v
+--------------------------------------+
|  App Server (Hetzner cx22)           |
|  Public IP  .  Private: 10.0.1.10   |
|                                      |
|  +--------------------------------+  |
|  | Frontend (Nginx)  :80 / :443  |  |
|  | - Serves React SPA            |  |
|  | - Proxies /api -> backend      |  |
|  | - least_conn load balancing    |  |
|  | - Rate limiting (10r/s)       |  |
|  | - Gzip, security headers      |  |
|  +--------------------------------+  |
|                                      |
|  +--------------------------------+  |
|  | Backend (NestJS) x N  :3000   |  |
|  | - REST API + Swagger          |  |
|  | - Playwright for PDF gen      |  |
|  | - JWT auth + refresh tokens   |  |
|  | - BullMQ worker (receipts)    |  |
|  | - Audit log interceptor       |  |
|  | - Tenant RLS subscriber       |  |
|  +--------------------------------+  |
|                                      |
|  +--------------------------------+  |
|  | Redis 7  :6379                |  |
|  | - Dashboard cache (5m TTL)    |  |
|  | - BullMQ job queue            |  |
|  | - Telegram sessions (4h TTL)  |  |
|  +--------------------------------+  |
+----------------+---------------------+
                 | Private network
                 | 10.0.0.0/16
                 v
+--------------------------------------+
|  DB Server (Hetzner cx22)            |
|  Private: 10.0.1.20                  |
|                                      |
|  +--------------------------------+  |
|  | PostgreSQL 15  :5432           |  |
|  | - RLS policies on 5 tables    |  |
|  | - Composite indexes           |  |
|  | - Advisory locks (migrations) |  |
|  +--------------------------------+  |
|  +--------------------------------+  |
|  | pgAdmin 4  :5050              |  |
|  +--------------------------------+  |
+--------------------------------------+

       +------------------------+
       | Hetzner Object Storage |
       | (S3-compatible)        |
       | - Logos bucket         |
       | - Receipts bucket      |
       | - Temp bucket          |
       +------------------------+
```

### Horizontal Scaling

The backend is designed for horizontal scaling:

- **Nginx** upstream uses `least_conn` load balancing
- **Redis** provides shared state (sessions, cache, job queue) across instances
- **BullMQ** distributes PDF generation across workers
- **Advisory lock** on migrations ensures only one instance runs them
- **RLS + tenant context** is per-request via `AsyncLocalStorage` (no shared state)
- Scale with: `docker compose up --scale backend=N`

### Hetzner Cloud (Terraform)

- **Provider**: Hetzner Cloud (`hcloud ~> 1.0`)
- **Location**: `nbg1` (Nuremberg, Germany)
- **Network**: Private `10.0.0.0/16`, Subnet `10.0.1.0/24`
- **App Server**: `cx22` (2 vCPU, 4 GB RAM, 40 GB SSD) -- IP `10.0.1.10`
- **DB Server**: `cx22` (2 vCPU, 4 GB RAM, 40 GB SSD) -- IP `10.0.1.20`
- **Firewall (App)**: SSH, HTTP, HTTPS, port 3000 -- open to `0.0.0.0/0`
- **Firewall (DB)**: SSH open to `0.0.0.0/0`; PostgreSQL open only to `10.0.1.0/24`

### Docker Compose Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | Local development (Postgres + Redis + Backend + Frontend with hot reload) |
| `docker-compose.prod.yml` | Standalone production (all services, scalable backend) |
| `docker-compose.application.yml` | Production app server (Backend + Frontend + Redis, connects to remote DB) |
| `docker-compose.database.yml` | Production database server (PostgreSQL + pgAdmin) |
| `backend/docker-compose.test.yml` | Test database (Postgres on port 5433) |

### Dockerfiles

| File | Base Image | Purpose |
|---|---|---|
| `backend/Dockerfile` | `node:20-alpine` + Chromium | Production backend |
| `backend/Dockerfile.playwright` | `mcr.microsoft.com/playwright:v1.57.0-jammy` | Dev/CI backend |
| `frontend/Dockerfile` | `node:20-alpine` (build) -> `nginx:alpine` (serve) | Multi-stage frontend build with self-signed SSL |

### CI/CD (GitHub Actions)

**Main Pipeline** (`.github/workflows/ci.yml`) -- triggers on push/PR to `main`:

1. **test-backend** -- lint, test, build
2. **test-frontend** -- lint, build
3. **build-and-deploy** -- build Docker images, push to Docker Hub (`klukvas/receiptmaster-frontend`, `klukvas/receiptmaster-backend`)
4. **deploy-production** (main branch only) -- SSH to app server, pull images, write `.env`, start containers, health check

**Database Deployment** (`.github/workflows/deploy-database.yml`) -- manual trigger:
- SSH to DB server, pull images, optional force-recreate

### Nginx

- Reverse proxy `/api/` -> `backend:3000` with `least_conn` upstream
- Rate limiting: `10 req/s`, burst 20
- Gzip compression
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`
- CORS: all origins, preflight caching 20 days
- Receipt PDFs served with 1-year cache + immutable
- SPA fallback to `/index.html`

### Object Storage (Hetzner S3)

- **Endpoint**: `https://nbg1.your-objectstorage.com`
- **Region**: `nbg1`
- **Buckets**: `marketflow-storage` (logos, receipts, temp)
- **ACL**: Private

### Middleware & Cross-Cutting Concerns

| Component | Description |
|---|---|
| `RequestIdMiddleware` | Generates UUID per request for log correlation |
| `TenantMiddleware` | Propagates user ID via `AsyncLocalStorage` for RLS |
| `TenantContextSubscriber` | TypeORM subscriber -- `SET LOCAL app.current_user_id` before writes |
| `AuditLogInterceptor` | Logs all CUD operations to `audit_logs` table |
| `GlobalExceptionFilter` | Structured JSON error responses |
| `JwtAuthGuard` | Passport JWT guard on protected routes |
| `ThrottlerGuard` | Rate limiting on auth endpoints |

### Scripts

| Script | Command | Description |
|---|---|---|
| `scripts/generate-invoice-pdfs.js` | `yarn generate:invoice-pdfs` | Generate sample invoice PDFs using Playwright + Handlebars |
| `scripts/generate-logo-variants.js` | `yarn generate:logo-variants` | Generate 32 logo variants (sizes, effects, positions) using Sharp |

### Environment Variables

| Variable | Description |
|---|---|
| `NODE_ENV` | development / production / test |
| `PORT` | Backend port (default: 3000) |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection |
| `REDIS_HOST`, `REDIS_PORT` | Redis connection (default: localhost:6379) |
| `AUTO_RUN_MIGRATIONS` | Run migrations on startup with advisory lock (default: true) |
| `API_PREFIX` | API route prefix (default: `api/v1`) |
| `API_KEY` | Optional API key for `X-API-Key` header |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `JWT_SECRET` | Token signing key (min 32 chars) |
| `JWT_EXPIRES_IN` | Access token TTL (default: `24h`) |
| `RECEIPT_BASE_URL` | Base URL for receipt links |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `AWS_REGION`, `S3_ENDPOINT` | S3 endpoint config |
| `LOGOS_BUCKET`, `RECEIPTS_BUCKET`, `TEMP_BUCKET` | S3 bucket names |
| `TELEGRAM_BOT_TOKEN` | Telegram bot API token |
| `TELEGRAM_BOT_OWNER_USER_ID` | UUID of merchant user for Telegram orders |
| `TELEGRAM_WEBHOOK_SECRET` | Optional webhook verification token |
| `VITE_API_URL` | Frontend API base URL |
| `VITE_API_KEY` | Frontend API key |
