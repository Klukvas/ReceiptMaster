# ReceiptMaster Frontend — Agent Onboarding

**Last Updated:** 2026-10-30
**Stack:** React 19.1, TypeScript ~5.8, Vite 7.1, Tailwind CSS v4, TanStack React Query 5.86

This document teaches an AI coding agent how the ReceiptMaster frontend works and how to build features here.

## Project Layout

Root: `/Users/andreypavlenko/Desktop/Projects/b2c/market`

```
frontend/
├── e2e/                      # Browser regression suite — see frontend/e2e/README.md
├── src/
│   ├── main.tsx              # App entry point (initializes React 19, loads i18n, error boundary)
│   ├── App.tsx               # Provider setup + routing (React Router 7.8)
│   ├── pages/                # Page components (lazy-loaded for code splitting)
│   ├── components/           # Organized by feature (orders/, products/, ui/, etc.)
│   ├── services/             # Business logic (OrderService, ReceiptService, NotificationService)
│   ├── hooks/                # Custom React hooks (useOrders, useAuth, useServerPagination, etc.)
│   ├── contexts/             # React Context (AuthContext, ThemeContext)
│   ├── providers/            # Context providers (PaddleProvider for billing)
│   ├── lib/                  # Utilities (api.ts, api-errors.ts, chunk-load.ts, i18n.ts)
│   └── locales/              # i18next translations (en, ru, uk)
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.app.json
```

## Bootstrap & Routing

### Entry Point: `main.tsx`
- Renders React app into `#root`
- Loads i18n (lines 4–5) **before** `<App />`
- Strict mode on for dev
- Wraps `<App />` in `AppErrorBoundary`, so nothing that throws while rendering leaves a blank page

### Render failures: `components/common/AppErrorBoundary.tsx`

The only error boundary, around the whole app (`App.tsx` itself has just `Suspense`). A tab left open
across a deploy asks for a lazy-route chunk that no longer exists, and `React.lazy` rethrows that
during render. `lib/chunk-load.ts` recognises the failure (`isChunkLoadError` knows the Chromium,
Firefox, Safari and Vite preload wording). The boundary keeps `PageSpinner` up and reloads once,
which works because nginx serves `index.html` with `no-cache` and so returns the new chunk names.
`claimChunkReload` allows one reload per `CHUNK_RELOAD_GUARD_MS` (60 s, in `sessionStorage`), and
refuses when storage is unavailable, since an unguarded reload could loop. A chunk still failing
after that, or any other render error, shows `ErrorFallback` (`appError.*`) with a Reload button;
the detail goes to `console.error` only. The fallback replaces the whole tree, so it has no links
and a reload is the way out. Errors in event handlers and queries never reach it.

### App Structure: `App.tsx`
**Provider stack (top→down):**
1. `<HelmetProvider>` — react-helmet for SEO (title, meta tags)
2. `<QueryClientProvider>` — TanStack React Query (caching, server state)
3. `<ThemeProvider>` — dark/light mode context
4. `<AuthProvider>` — session + current user context
5. `<PaddleProvider>` — Paddle billing (checkout, subscriptions)
6. `<BrowserRouter>` — React Router 7.8 routing
7. `<Toaster>` — react-hot-toast notifications

**Query client config** (lines 73–82):
- Default `staleTime: 5 min`, `gcTime: 10 min` (keep unused data 10 min before GC)
- `retry: 1` on failed queries
- No refetch on window focus (good for long-running sessions)

### Route Map

| Path | Component | Auth | Layout | Notes |
|------|-----------|------|--------|-------|
| `/` | `HomePage` | No | None | Public landing |
| `/dashboard` | `DashboardHomePage` | Yes | Layout | Main dashboard |
| `/products` | `ProductsPage` | Yes | Layout | Manage products |
| `/recipients` | `RecipientsPage` | Yes | Layout | Manage buyers |
| `/suppliers` | `SuppliersPage` | Yes | Layout | Manage suppliers |
| `/orders` | `OrdersPage` | Yes | Layout | Core CRUD: orders |
| `/analytics` | `DashboardPage` | Yes | Layout | Charts & analytics |
| `/settings` | `SettingsPage` | Yes | Layout | Receipt design, billing |
| `/profile` | `ProfilePage` | Yes | Layout | User profile |
| `/r/:token` | `PublicReceiptPage` | No | None | Public receipt share link |
| `/blog` | `BlogListPage` | No | None | Blog listing |
| `/blog/:slug` | `BlogPostPage` | No | None | Blog post (markdown) |
| `/terms`, `/privacy`, etc. | Static pages | No | None | Legal docs |
| `*` | `NotFoundPage` | No | None | 404 fallback |

**Protected routes** wrap with `<ProtectedRoute>` component (line 101ff):
- Checks `useAuth().isAuthenticated`
- Shows loading spinner while `isLoading: true`
- Falls back to `<LoginForm>` if not authenticated

**Layout component** wraps authenticated pages:
- Sidebar (desktop) + mobile drawer
- Header with user email + logout
- Receipt progress panel for real-time updates (WebSocket)
- Tailwind `lg:` breakpoints for responsive design

## Data Layer

### API Client: `lib/api.ts`

**Axios instance** (lines 52–59):
- Base URL: `VITE_API_URL` env var (defaults to `http://localhost:3000/api/v1`)
- 30-second timeout
- Default headers: `Content-Type: application/json`, `X-API-Key`

**Request interceptor** (lines 62–73):
- Adds `Authorization: Bearer {auth_token}` from `localStorage.getItem('auth_token')`

**Response interceptor** (`api.ts` + `lib/auth-session.ts`):
- Handles 401 (Unauthorized) on non-auth endpoints. Tokens live in `localStorage`, shared by all
  tabs; there is no cross-tab lock (no Web Locks), so tabs coordinate only through storage. The
  server redeems a refresh token once, so of two tabs refreshing with the same token one loses.
  - **Pre-check:** if storage already holds a different access token than the request carried
    (another tab or an earlier refresh rotated it), retry once with the stored token — no refresh
  - Otherwise send the stored `refresh_token` once per tab (requests arriving meanwhile are
    queued), store the new pair, retry the original request and release the queue
  - **Refresh failed:** `resolveRefreshFailure` decides from storage alone, comparing it with the
    session this tab sent. Storage holds a new pair → another tab won: adopt it and retry (the
    queue too). A 401/403 with storage unchanged may be an early loser whose winner has not answered
    yet: it waits for a `storage` event on `refresh_token` (written after the access token) for at
    most 3 s, then re-reads. A half-changed read (the two `setItem` calls are separate) or an emptied
    storage is re-read once after 300 ms. Still unchanged (or emptied by a logout) and 401/403 →
    genuine rejection: `clearAuthAndRedirect` clears storage and goes to `/`. Network/5xx → reject,
    keep storage. A rotation that keeps the access token and only changes the refresh token is
    adopted too
  - `clearAuthAndRedirect` is the only client code that ends a session on an API failure

**API method groups** (lines 159–497):
- `authApi.login()`, `register()`, `refresh()`, `logout()`, `getProfile()`, `updateProfile()`, `changePassword()`
- `productsApi.getAll()`, `getById()`, `create()`, `update()`, `delete()`, `bulkDelete()`, `getLowStock()`
- `recipientsApi.*` — same CRUD pattern; `recipientsApi.update` takes `UpdateRecipientRequest` (changed
  fields only, `null` clears an optional field)
- `productsApi.create(data, { idempotencyKey })` / `recipientsApi.create(data, { idempotencyKey })` send
  the optional `Idempotency-Key` header (see *Onboarding wizard*)
- `suppliersApi.*` — same CRUD pattern
- `ordersApi.getAll()`, `getById()`, `create()`, `update()`, `confirm()`, `cancel()`, `delete()`, `batchApprove()`, `batchDelete()`
- `dashboardApi.*` — revenue & turnover analytics
- `receiptsApi.getAll()`, `create()`, `getById()`, `getPdf()`, `getPrinters()`, `print()`, `regenerate()`, `void()`, `testPreview()`, `share()`, `revokeShare()`, `getTemplatePreviewHtml()`
- `settingsApi.*` — logo upload, receipt design, templates, company info, payment/delivery terms, auto-receipt flag (`getAutoReceipt` / `updateAutoReceipt`)

**Type exports**: All `api-types.ts` types (Product, Recipient, Order, Receipt, etc.) re-exported from `api.ts` for convenience. Wire types are derived from `api-types.generated.ts` (gitignored; `yarn openapi:generate` from `backend/openapi.json`) rather than hand-written: besides the entity types, `Receipt` (the `ReceiptProjection` the receipt routes return; `Order.receipts` reuses it), `InventoryValue` and the document types in `lib/document-config.ts` (`DocumentConfig`, `ConfigVersion`, `DocumentDraft`, `PresetSummary`, `Preset`) are aliases of `components["schemas"]`. `TemplateCapabilities`/`DocumentTemplate` stay hand-written. `templateId` is therefore the backend's template-ID union; values read from the templates list are narrowed at the call site.

**Utilities** (lines 500–528):
- `formatCurrency(cents, currency)` — e.g., `100` cents → "1.00 UAH"
- `formatDate(dateString)` → localized "uk-RU" format
- `amountToCents(amount: string | number)` → robust parsing (handles commas, spaces, NaN)

### Error Handling: `lib/api-errors.ts`

**parseApiError(error)** (lines 117–183):
- Takes any error, returns `{ message: string; code: string }`
- Checks Axios error response format: `{ error: string; errorCode: string }`
- Falls back to legacy `{ message: string }`
- Network errors → "Ошибка сети. Проверьте подключение..."
- **i18n-aware**: translates error codes via `i18n.t('errors.${code.toLowerCase()}')`
- Fallback to `ERROR_MESSAGES` constant if i18n not ready

**ErrorCode enum** (lines 11–58):
- User: `USER_ALREADY_EXISTS`, `USER_NOT_FOUND`, `INVALID_CREDENTIALS`
- Order: `ORDER_NOT_FOUND`, `ORDER_ALREADY_CONFIRMED`, `ORDER_ALREADY_CANCELLED`, `ORDER_CANNOT_BE_MODIFIED`
- Receipt: `RECEIPT_NOT_FOUND`, `RECEIPT_ALREADY_EXISTS`, `RECEIPT_GENERATION_FAILED`, `RECEIPT_PRINT_FAILED`
- Product/Recipient: `*_NOT_FOUND`, `*_ALREADY_EXISTS`
- Settings: `SETTINGS_NOT_FOUND`, `INVALID_SETTINGS`
- File: `FILE_NOT_FOUND`, `FILE_UPLOAD_FAILED`, `FILE_DELETE_FAILED`
- Generic: `INTERNAL_SERVER_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `UNKNOWN_ERROR`

**Helper functions:**
- `getErrorMessage(code, fallback?)` — look up user-friendly message by code
- `isErrorCode(error, code)` — check if error matches a code

### Service Layer: `services/`

**Service pattern**: Encapsulate business logic, handle errors + notifications, throw on failure.

**OrderService** (`services/OrderService.ts`):
```typescript
export class OrderService {
  async getAllOrders(limit = 50): Promise<Order[]>
  async confirmOrder(id: string): Promise<void>
  async cancelOrder(id: string): Promise<void>
  async deleteOrder(id: string): Promise<void>
  async batchApproveOrders(orderIds: string[]): Promise<{ approved: number }>
  async batchDeleteOrders(orderIds: string[]): Promise<{ deleted: number }>
}
export const orderService = new OrderService() // singleton
```
- Calls `ordersApi.*` from `lib/api.ts`
- Parses errors with `parseApiError()`
- Logs to console (dev only, no console.log in prod — hook flags it)
- Triggers toast notifications via `notificationService.success/error()`
- Throws error so caller can handle it

**ReceiptService** (similar pattern):
```typescript
async generateReceipt(orderId: string): Promise<Receipt>
async getPrinters(): Promise<string[]>
async printReceipt(receiptId: string, printer?: string): Promise<void>
async downloadReceipt(receiptId: string): Promise<void>
// ... more methods
```

**NotificationService**:
- In-memory notification queue
- `success(msg)`, `error(msg)`, `warning(msg)`, `info(msg)`
- Subscribers get notified: `subscribe((notifications) => {...})`
- Used by services + hooks

**Singleton pattern**: All services export a singleton instance (e.g., `export const orderService = new OrderService()`). Always use the singleton, never instantiate directly.

### React Query + Custom Hooks

**Standard pattern** (from `hooks/useOrders.ts`):
```typescript
export const useOrders = () => {
  const queryClient = useQueryClient()
  
  // Mutations for state changes
  const confirmMutation = useMutation({
    mutationFn: (id: string) => orderService.confirmOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      // or update cache directly: queryClient.setQueryData(['orders', id], newData)
    }
  })
  
  // UI state (not cached)
  const [showForm, setShowForm] = useState(false)
  
  return { /* everything the component needs */ }
}
```

**Query keys** (cache invalidation):
- `['orders']` — list of orders
- `['receipts']` — list of receipts
- `['subscription', 'status']` — subscription plan
- `['products']`, `['recipients']`, `['suppliers']` — entity lists

Always invalidate after mutations (`onSuccess` callback) so UI refetches fresh data.
Cancelling an order (`useOrders`) invalidates everything it changes on the server: `['orders']`,
`['receipts']` (a confirmed order's document is voided) and every dashboard key — `['dashboard']`,
`['totalRevenue']`, `['totalTurnover']`, `['dailyRevenue']`, `['orderStatusSummary']` (the default
`staleTime` is 5 minutes, so without this the dashboards would keep pre-cancel figures).

### Orders: cancel warning

`OrdersPage` resolves the cancel target's status from the loaded list. Cancelling a confirmed order
(or one not on the page) adds `orders.cancelConfirmedWarning` (en/ru/uk) to the confirmation: the
receipt is voided, the public share link revoked, and stock is not returned — deleting the order
returns it. A draft gets the plain question.

### Dashboard: unknown and partial profit

"Revenue" is profit from the cost frozen on each order line. Lines from before cost snapshots hold a
backfilled estimate, which the API returns as an ordinary known cost, so history shows full figures
with no badge. The states below now appear only for lines with no valid cost: a negative product cost,
or a line whose product belongs to another tenant.
Profit payloads carry
`unknown_cost_lines`, `unknown_cost_turnover_cents` and `profit_complete`, and the profit may be null
(`lib/profit.ts`: `formatProfit`, `profitChartValue`, `combineCompleteness`).
`components/dashboard/ProfitStatus.tsx` renders nothing for complete figures, "Cost unknown"
(`dashboard.profitUnknown`) next to "—" for a null profit, and a "Partial" badge
(`dashboard.profitPartial`) whose tooltip (`dashboard.profitPartialTooltip`) names the excluded lines
and turnover. It is used by the KPI card (`KPIPrimaryCard`/`StatCard` `footer`), the recipient list
(`TopRecipientsList` accepts a null amount, sorted last, and a `status` node) and the sparkline
header, which passes `combineProfit` of the charted days (`lib/profit.ts`: null when no day has a
known-cost line, so all-unknown reads "Cost unknown" rather than "Partial"; empty days do not count). `RevenueChart` accepts null values (no bar) and its tooltip shows "—" with the row's note; when
every row is null it shows `unknownMessage` (`dashboard.profitChartUnknown`) instead of an empty plot.
The sparkline passes null days with `connectNulls={false}`, so an unknown day is a gap, not a zero,
and its tooltip shows "—" for that day's profit. Both tooltips set `filterNull={false}`: the Recharts
default drops null entries, and with them the whole bar tooltip. The analytics CSV leaves an
unknown profit cell empty and adds `profit_complete`, `unknown_cost_lines` and
`unknown_cost_turnover` columns (`dashboard.csv*` headers). Turnover views are unchanged.

### Dashboard: period presets

`DashboardPage` presets and the date inputs send date-only `startDate`/`endDate`, and the API reads
them as whole UTC days, both ends included. Preset dates come from `toISOString`, so they are UTC
calendar dates on purpose: that day always contains "now", so a fresh order is in every preset. A
local date would trail the UTC day west of UTC and drop it. The orders list filters the same way.

### Server-Side Pagination: `useServerPagination`

**Built-in hook** for tables with sorting, filtering, pagination:
```typescript
const { items, total, isLoading, currentPage, totalPages, itemsPerPage } = useServerPagination({
  queryKey: 'orders',
  queryFn: (params) => ordersApi.getAll(params),
  columns: [
    { key: 'recipient_name', header: 'Recipient', sortable: true, render: (o) => <div>{o.recipient_name}</div> },
    // ... more columns
  ],
  defaultSortBy: 'created_at',
  defaultSortOrder: 'DESC',
  defaultItemsPerPage: 10,
  extraParams: { status: 'pending' }, // merged into query
  debounceMs: 400, // delay for search input
  storageKeyPrefix: 'orders', // persist page size + column visibility to localStorage
})
```

**Features:**
- Debounced search (avoids hammering API on every keystroke)
- Multi-column sorting
- Column visibility toggle (persisted to localStorage)
- Optimistic pagination (doesn't refetch on page change if data in cache)

**Example usage** (OrdersPage.tsx, lines 89–160):
```typescript
const columns: ColumnDef<Order>[] = [
  { key: 'recipient_name', header: t('orders.recipient'), sortable: true, render: (o) => (...) },
  // ... more columns
]

const { items, total, isLoading, handleSort, visibleColumns } = useServerPagination({
  queryKey: 'orders',
  queryFn: (params) => ordersApi.getAll({ ...params, status: statusFilter, startDate, endDate }),
  columns,
  extraParams: { status: statusFilter, ... }, // re-runs query when this changes
})

// Render table with items, handle sort clicks
```

### Order forms and selection safety

- `useOrderProducts` / `useOrderRecipients` (`hooks/useOrderOptions.ts`) use server search
  with a 300ms debounce and explicit **25-record** pages. Load more fetches only the next
  page. List keys are `[entity, 'order-options', search]`; selected record keys are
  `[entity, 'order-option', id]`. They never write into the table's list query keys.
- Selected records are retained separately and hydrated with `GET /products/:id` and
  `GET /recipients/:id`, including original edit-order IDs beyond the first page.
  `OrderEntitySelect` connects this data to the server-search mode of `Combobox`;
  create-order product search keeps its viewport-aware portal.
- A custom price of **zero cents** is an explicit override. Empty input clears the override
  and uses the product price. Edit mutation failures render `parseApiError` messages in
  an alert and keep the form and its values open.
- Line totals use each product's currency; single-currency summaries use that currency.
  Mixed currencies show an error and cannot be submitted; no conversion rate exists.
- `OrdersPage` clears selection when search, filters, sort, page or page size changes,
  and while refetching. `useServerPagination.isSearchPending` also covers the debounce
  window. Bulk operations receive only selected IDs present in the current ready page;
  approval requires a nonempty selection of draft orders. Bulk deletion revalidates
  selection at confirmation time.

## State & Context

### AuthContext: `contexts/AuthContext.tsx` + `contexts/AuthContext.types.ts`

**AuthProvider** wraps entire app, stores:
- `user: User | null` — current user object
- `token: string | null` — access token from localStorage
- `isLoading: boolean` — loading user profile on mount
- `isAuthenticated: boolean` — derived (!!user && !!token)

**Methods:**
- `login(email, password)` — calls `authApi.login()`, stores tokens through `auth-session.ts`
  `storeSession` (access token first, then refresh token — the key other tabs wait for), redirects
  to `/dashboard`. AuthContext reads/clears storage only through `auth-session.ts` helpers
- `register(email, password)` — same as login
- `logout()` — calls `authApi.logout()`, clears localStorage, redirects to home
- `fetchUserProfile()` — called on mount if token exists; fetches `/auth/profile`. On failure it
  only marks this render signed out; it never touches storage (the interceptor decides, so a tab
  that lost a refresh race cannot wipe the session another tab just stored)

**Token storage:**
- Access token → `localStorage.auth_token` (short-lived, 15 min typical)
- Refresh token → `localStorage.refresh_token` (long-lived, 7 days typical)
- Token auto-refreshed by Axios interceptor on 401

**useAuth hook** (`hooks/useAuth.ts`):
```typescript
const { user, token, isAuthenticated, isLoading, login, register, logout } = useAuth()
```
- Throws if used outside AuthProvider
- Safe to call from any component

### ThemeContext: `contexts/ThemeContext.tsx` + `contexts/ThemeContextInstance.ts`

**ThemeProvider** stores:
- `theme: 'light' | 'dark'`
- Applies class to `<html>` (`.dark` or removed)
- Persists to `localStorage.theme`

**useTheme hook** (`hooks/useTheme.ts`):
```typescript
const { theme, toggleTheme, setTheme } = useTheme()
```

**Tailwind dark mode:**
- Light: CSS vars at root (--color-bg: white, etc.)
- Dark: CSS vars override when `.dark` class on `<html>`
- Example: `className="bg-surface"` picks var from root (light) or `.dark` (dark)

**Color design tokens** (see `contexts/theme-constants.ts`):
- Named scales: `surface`, `elevated`, `content`, `accent-base`, `warning-base`, `danger-base`, etc.
- Tailwind applies via CSS variables, not hardcoded colors

### Other Contexts

**PaddleProvider** (`providers/PaddleProvider.tsx`):
- Initializes Paddle SDK (`@paddle/paddle-js`) only when the explicit build flag and backend capability are both enabled.
- Token from `VITE_PADDLE_CLIENT_TOKEN` env var
- Enabled production requires explicit `VITE_PADDLE_ENVIRONMENT=production`; development can use sandbox. Invalid values fail initialization.
- Exported `usePaddle()` hook provides `paddle` instance for checkout
- See `useCheckout` hook for usage

## Cross-Cutting Concerns

### i18n: i18next

**Setup** (`lib/i18n.ts`):
- 3 languages: `en`, `ru`, `uk`
- Loads translations from `locales/{lang}/translation.json` (static imports)
- Auto-detects from localStorage → browser language → HTML lang attribute
- Syncs `<html lang>` attribute when language changes

**useTranslation hook** (`hooks/useTranslation.ts`):
```typescript
const { t, changeLanguage, currentLanguage, isReady } = useTranslation()
// t('orders.recipient') → looks up in translation JSON
// changeLanguage('ru') → switches language
// currentLanguage → 'en' | 'ru' | 'uk'
```

**Convention:** Organize translation keys hierarchically (orders.recipient, settings.receiptTitle, etc.). Check JSON files for the full key structure.

### Receipt template previews

`components/settings/TemplatePreviewIframe.tsx` is shared by template settings, the
carousel and onboarding. It loads authenticated HTML through React Query, keyed by
template and language. A4 previews use a 794×1123 CSS-pixel canvas; Thermal uses an
80 mm (about 302 px) canvas and measures its content after fonts finish loading, matching
the production roll layout. Thermal previews cap scale at 1 so a roll is not stretched
to A4 width. The iframe remains script-disabled; `allow-same-origin` permits its parent
to read layout dimensions. Format/accessibility and error labels use all three locales.

### Real-Time Updates: WebSocket

**useReceiptSocket hook** (`hooks/useReceiptSocket.ts`):
```typescript
useReceiptSocket({
  onProgress: (payload: ReceiptProgressPayload) => {},
  onCompleted: (payload: ReceiptCompletedPayload) => {},
  onFailed: (payload: ReceiptFailedPayload) => {},
})
```

**Connection:**
- URL: `resolveSocketUrl(VITE_WS_URL, VITE_API_URL, window.location.origin)` —
  `VITE_WS_URL` wins if set; otherwise an absolute `VITE_API_URL` supplies the origin
  and a relative one (the proxied production setup) means the page origin. Deployments
  only ever configure `VITE_API_URL`, so never reintroduce a hard-coded default here.
- Auth: passes access token in socket handshake
- Transports: websocket primary, falls back to HTTP long-polling
- Reconnect: 10 attempts, exponential backoff (1s → 10s)

**Events:**
- `receipt.progress` — emitted as receipt generates (PDF, print job queued, etc.)
- `receipt.completed` — final state, invalidates `['orders']` + `['receipts']` queries
- `receipt.failed` — error state, also invalidates queries

**Used by** OrdersPage (via ReceiptProgressPanel component) to show real-time status.

**The socket is an accelerator, not the source of truth.** Nothing may depend on an
event actually arriving — it can be blocked, dropped, or missed across a reconnect:

- `ReceiptProgressPanel` runs a watchdog: a card that has heard nothing for ~8s asks
  `GET /receipts/:id` and resolves itself from the answer (per receipt id, so a sibling
  order that is genuinely still generating is untouched). Repeated lookup failures
  dismiss the card rather than spinning forever.
- `useReceiptGenerationPolling(orders)` (`hooks/useOrders.ts`, wired in `OrdersPage`)
  re-fetches `['orders']` every 4s while any listed order has a `processing` receipt,
  so the row's "generating" chip clears from server state without a page reload.

### Production image and proxy configuration

- CI publishes images only on a trusted `push` to `main`. Both Docker Hub images use
  the full commit SHA; production compose requires `IMAGE_TAG` for both services.
  Deployment transfers an allowlisted SHA archive and waits for both builds to succeed; existing production files are preserved.
- The current release sets `VITE_BILLING_ENABLED=false` and overrides backend
  `BILLING_ENABLED=false`, so Paddle secrets may be absent. When explicitly enabled,
  frontend builds require the public client token and production environment; backend
  production validation requires complete Paddle settings and frontend URL. Example env
  files contain only empty values. Deployment preserves the existing secret environment.
- `.dockerignore` excludes local `.env*` files from the frontend build context. Every
  dependency comes from the public npm registry, so the image's `yarn install
  --frozen-lockfile` takes no package token (no build arg, secret mount or `.npmrc`).
  PR verification runs with a `contents: read` workflow token and no secrets;
  publish/deploy credentials are confined to main-push jobs (`infra-audit` checks both).
- Nginx proxies the exact unprefixed `/paddle/webhook` URI with its raw request body and
  `Paddle-Signature` header. `/socket.io/` proxies polling and WebSocket Upgrade traffic
  directly to the backend. `/receipts` is the socket namespace, not the transport path.

### Billing & Checkout

Strict `VITE_BILLING_ENABLED` defaults to false. The provider does not contact Paddle or
initialize its SDK while disabled. An enabled build first checks the authoritative public
`/billing/config` capability; only server-enabled billing initializes the SDK. Production
requires the public token and explicit production environment. Hooks guard programmatic
checkout/portal calls too. Disabled UI hides pricing/upgrade/manage actions, while current
plan and usage remain visible; quota dialogs explain the current plan without purchase
buttons. `release.json` exposes the immutable image SHA and billing flag for deployment
verification.


**useCheckout hook** (`hooks/useCheckout.ts`):
```typescript
const { loading, handleUpgrade, handleManage } = useCheckout()

// Trigger checkout overlay
<button onClick={() => handleUpgrade('pro')}>Upgrade to Pro</button>
```

**Flow:**
1. Call `subscriptionApi.checkout(plan)` → backend creates Paddle transaction
2. Backend returns `transactionId`
3. Call `paddle.Checkout.open({ transactionId, settings: {...} })`
4. Paddle opens overlay, user completes payment
5. Success URL redirects back to `/settings?tab=subscription`

**useSubscription hook** (`hooks/useSubscription.ts`):
- Fetches current plan + usage (e.g., orders count)
- Exposes: `{ status, plan, ordersUsed, ordersLimit, isExpired, canCreateOrder }`
- Used by `SettingsPage` to show plan details + upgrade button
- Used by `OrdersPage` to enforce order limits

### Notifications: react-hot-toast

**Global Toaster** setup in App.tsx (lines 202–226):
- Position: top-right
- Duration: 4s (success 3s, error 4s)
- Styled with CSS vars for dark/light mode

**Usage:**
```typescript
import toast from 'react-hot-toast'

toast.success('Order confirmed')
toast.error('Failed to confirm order')
toast.loading('Processing...')
```

**Services emit toasts** (e.g., OrderService confirms on success, toast.error on failure).

**useNotifications hook** (`hooks/useNotifications.ts`):
- Wrapper around NotificationService singleton
- Returns in-memory notifications list (for custom UI if needed)
- Most code just uses `toast` directly

### Styling: Tailwind CSS v4

**Setup** (`tailwind.config.js`):
- CSS variables mode (not hardcoded colors)
- Custom theme with semantic color names (surface, elevated, content, accent-base, etc.)
- Dark mode: class-based (toggle `.dark` on `<html>`)
- Typography plugin for markdown (blog posts, legal docs)

**Convention:**
- Use semantic classnames: `bg-surface`, `text-content`, `border-border`
- Avoid hardcoded hex colors in JSX
- Responsive: `lg:` breakpoint for desktop, mobile-first
- Animation: `animate-spin`, `transition-colors duration-200`

**Theme color tokens** defined in root CSS (compiled from config):
```css
:root {
  --color-surface: #ffffff;
  --color-elevated: #f5f5f5;
  /* ... */
}

html.dark {
  --color-surface: #1a1a1a;
  --color-elevated: #2a2a2a;
  /* ... */
}
```

Tailwind reads these and generates classes like `bg-[var(--color-surface)]`.

## Component Organization

### File Structure

```
components/
├── auth/              # Login, Protected routes
├── blog/              # Blog list, blog post display
├── common/            # Reusable UI (NotificationToast, badges, etc.)
├── dashboard/         # Analytics charts, widgets
├── landing/           # Homepage, hero, pricing
├── layout/            # Layout, Sidebar, Header
├── legal/             # Terms, Privacy, etc. (static)
├── onboarding/        # Onboarding flow
├── orders/            # Order CRUD, forms, filters, actions
├── products/          # Product CRUD
├── receipts/          # Receipt rendering, share modal, progress panel
├── recipients/        # Recipient CRUD
├── settings/          # Settings panels (receipt design, company info, etc.)
├── subscription/      # Plan cards, upgrade modal, usage bar
├── suppliers/         # Supplier CRUD
├── seo/               # SEO component wrappers
└── ui/                # Primitives (Button, Modal, DataTable, Tabs, etc.)
```

### Product form: stock edits (`components/products/ProductForm.tsx`)

Editing sends only the fields that differ from the product as loaded (`product-update.ts`
`buildProductUpdate`), so a rename is `PATCH { name }` and never carries a stale stock value. A
changed quantity is sent as `{ quantity, expectedQuantity }`, where `expectedQuantity` is the
baseline: the loaded stock, or the server's after a conflict. On 409 `PRODUCT_QUANTITY_CONFLICT`
(parsed with `lib/api-errors.ts`) the form stays open with every typed value, reloads
`GET /products/:id`, shows under the quantity field that stock is now N and the typed value was not
saved (`products.quantityConflict`, en/ru/uk), moves the baseline to N and invalidates
`["products"]`; saving again is an informed overwrite. A save with no changes just closes the form.
`productsApi.update` takes `UpdateProductRequest`: the generated `UpdateProductDto` fields with the
stock pair encoded as a union — either neither `quantity` nor `expectedQuantity`, or both.

### Onboarding wizard (`components/onboarding/OnboardingModal.tsx`)

Four steps (company, template, first product, first customer); the parent keeps every step's input,
so Back/Next never lose it. Company and template call idempotent settings endpoints on each Next.
Product and customer steps keep an entity record in a ref (`onboarding-entities.ts`
`saveEntityStep`): `id` and the server's copy (`saved`) after a create, or `pending` — the exact body
and its `Idempotency-Key` (`crypto.randomUUID()`, one per create attempt) — while a create's outcome
is unknown. Revisiting a saved step sends nothing when the form still matches `saved`, otherwise a
PATCH with only the changed fields (products via `buildProductUpdate`: a changed quantity carries
`expectedQuantity`; a 409 reloads the product, keeps the input and shows `products.quantityConflict`).
A blank name never creates and never changes an existing entity.

- **Single flight:** one `inFlight` ref covers Next, Back, Skip, Finish, Retry and closing (Escape/X);
  Skip and Back are also disabled while saving, so a double click sends one request.
- **Errors** keep the step and every value and show an inline alert: `parseApiError` text for a refused
  request (the next attempt sends the current form with a new key); for no response or a 502/503/504,
  `onboarding.saveUnconfirmed` with Retry, which resends the same body with the **same** key (the
  server replays the create if it happened) and then PATCHes any edits made meanwhile.
- **Completion:** Finish calls `onComplete()` only after `POST /settings/onboarding-complete`
  succeeds; on failure the modal stays open with `onboarding.finishFailed` and Retry (saved steps are
  not re-sent). A failed Skip closes the wizard for this visit with the `onboarding.skipFailed` toast
  (offered again next time). The Finish button stays "Get started"; nothing here mentions a PDF.
- **Limits:** the key lives only in memory — a reload or another tab during an unconfirmed save can
  still create a duplicate.

### UI Primitives: `components/ui/`

Reusable, framework-agnostic components. `Button`, `Card`, `Input`, `Modal`, `Skeleton` and `Tabs` wrap the unstyled primitives in `components/ui/primitives/` (vendored from the former `@klukvas/flux-b2c-ui` package, with `cn()` = `clsx` + `tailwind-merge`). Edit those files directly — there is no external UI package or private registry, so `yarn install` needs no token.
- `Button.tsx` — primary, secondary, danger variants; loading state; icon support
- `Modal.tsx` — centered overlay modal
- `ConfirmModal.tsx` — yes/no dialog
- `Drawer.tsx` — mobile side drawer
- `DataTable.tsx` — table with sorting, selection, pagination (uses `useServerPagination`)
- `Tabs.tsx` — tab navigation
- `Card.tsx` — card container with shadow
- `DropdownMenu.tsx`, `PortalDropdown.tsx` — menus
- `Pagination.tsx` — page controls
- `Combobox.tsx` — searchable select
- `ThemeToggle.tsx` — dark/light switcher

### Feature Components

**Example: OrdersPage** (`pages/OrdersPage.tsx` + `components/orders/`):
- Page component handles routing + page-level state
- Calls `useOrders()` hook for business logic
- Calls `useServerPagination()` for table
- Renders sub-components:
  - `<OrdersPageHeader />` — title + action buttons
  - `<OrdersFilterBar />` — filters (status, date range, amount)
  - `<DataTable />` — results (uses column defs + sorting)
  - `<OrderRowActions />` — action menu per row (confirm, cancel, generate receipt, etc.)
  - `<CreateOrderModal />` — form to create new order
  - `<ConfirmModal />` — yes/no dialogs
  - `<ShareReceiptModal />` — modal to share receipt link

**Composition pattern:**
- Leaf components are dumb (just render props, call callbacks)
- Parent page orchestrates state + logic
- Hooks abstract away React Query + service calls

## Adding a New Page/Feature

### Recipe

1. **Create the page** at `src/pages/MyFeaturePage.tsx`:
   ```typescript
   import { useTranslation } from '../hooks/useTranslation'
   import { useMyFeature } from '../hooks/useMyFeature'
   
   export const MyFeaturePage = () => {
     const { t } = useTranslation()
     const { data, isLoading, handleAction } = useMyFeature()
     
     return (
       <div className="space-y-6">
         <h1>{t('myfeature.title')}</h1>
         {/* Render UI */}
       </div>
     )
   }
   ```

2. **Add the route** in `App.tsx`:
   ```typescript
   const MyFeaturePage = React.lazy(() =>
     import('./pages/MyFeaturePage').then((m) => ({ default: m.MyFeaturePage }))
   )
   
   <Route path="/my-feature" element={<ProtectedRoute><Layout><MyFeaturePage /></Layout></ProtectedRoute>} />
   ```

3. **Create a hook** (`hooks/useMyFeature.ts`) if you have business logic:
   ```typescript
   export const useMyFeature = () => {
     const queryClient = useQueryClient()
     
     const query = useQuery({
       queryKey: ['myfeature'],
       queryFn: () => api.getMyFeature(),
     })
     
     const mutation = useMutation({
       mutationFn: (data) => api.createMyFeature(data),
       onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myfeature'] })
     })
     
     return {
       data: query.data,
       isLoading: query.isLoading,
       handleAction: (data) => mutation.mutate(data),
     }
   }
   ```

4. **Create service methods** in `services/MyFeatureService.ts` if logic is complex:
   ```typescript
   export class MyFeatureService {
     async create(data) { /* call API, handle errors, notify */ }
     async update(id, data) { /* ... */ }
   }
   export const myFeatureService = new MyFeatureService()
   ```

5. **Add UI components** in `components/myfeature/`:
   - `MyFeatureForm.tsx` — form to create/edit
   - `MyFeatureTable.tsx` — list view
   - `MyFeatureCard.tsx` — card display
   - etc.

6. **Add translations** to `locales/{en,ru,uk}/translation.json`:
   ```json
   {
     "myfeature": {
       "title": "My Feature",
       "create": "Create",
       "delete": "Delete"
     }
   }
   ```

7. **Add to navigation** (Sidebar.tsx or menu component):
   ```typescript
   { label: t('myfeature.title'), href: '/my-feature', icon: MyIcon }
   ```

### Checklist
- [ ] Page imports hook
- [ ] Hook calls service or API
- [ ] Service parses errors + notifies
- [ ] Query key invalidated on mutation
- [ ] Page + hook + service in right files
- [ ] Translations added for all user-facing strings
- [ ] Route in `App.tsx` (lazy-loaded)
- [ ] Protected route if authenticated-only
- [ ] TypeScript strict (no `any`)
- [ ] No hardcoded values (use constants, env vars, i18n)

## Key Files Summary

| File | Purpose |
|------|---------|
| `src/main.tsx` | App entry, loads i18n, mounts the error boundary |
| `src/components/common/AppErrorBoundary.tsx` | Chunk-load recovery and render-failure fallback |
| `src/App.tsx` | Providers, routing, React Query config |
| `src/lib/api.ts` | Axios instance, request/response interceptors, all API methods |
| `src/lib/api-errors.ts` | Error parsing, error code enum, friendly messages |
| `src/contexts/AuthContext.tsx` | Login/logout, token storage, user profile |
| `src/contexts/ThemeContext.tsx` | Dark/light mode toggle + persistence |
| `src/providers/PaddleProvider.tsx` | Paddle SDK init for billing |
| `src/hooks/useOrders.ts` | Orders CRUD + mutations + UI state example |
| `src/hooks/useServerPagination.ts` | Table pagination, sorting, filtering |
| `src/hooks/useCheckout.ts` | Paddle checkout flow |
| `src/hooks/useSubscription.ts` | Current plan + usage limits |
| `src/hooks/useReceiptSocket.ts` | WebSocket connection for receipt progress |
| `src/services/OrderService.ts` | Business logic, error handling, notifications |
| `src/lib/i18n.ts` | i18next config + language detection |
| `src/components/layout/Layout.tsx` | Sidebar, header, receipt progress panel |
| `src/components/auth/ProtectedRoute.tsx` | Auth guard for routes |
| `src/pages/OrdersPage.tsx` | Example CRUD page (fetch, filter, create, edit, delete) |

## Testing Strategy

**Unit tests** (Vitest):
- Service methods (`OrderService.confirmOrder()` mocks API)
- Utility functions (`formatCurrency()`, `parseApiError()`)

**Component tests** (React Testing Library):
- Forms (rendering, validation, submit)
- Tables (sorting, pagination, selection)
- Modals (open/close, form submission)

**E2E tests** (Playwright):
- Login → create order → confirm → generate receipt
- Upgrade subscription → checkout
- See `e2e/` folder or the `e2e-runner` agent

Don't test framework wiring (React Router, hooks internals) — test behavior.

## Common Gotchas

1. **Token refresh logic** — already baked into Axios interceptor. Don't add your own refresh logic, and don't clear `auth_token`/`refresh_token` on an API error elsewhere — another tab may have just rotated them.
2. **Query key consistency** — always invalidate the same key after mutations (e.g., `['orders']` after `deleteOrder`).
3. **Image/asset paths** — public assets in `frontend/public/` (referenced as `/logo-icon.svg`).
4. **Env vars** — prefix public client settings with `VITE_` for Vite to expose them. Check `frontend/env.example`; never put backend secrets in Vite settings.
5. **localStorage keys** — `auth_token`, `refresh_token`, `theme`, and per-table settings (e.g., `orders_itemsPerPage`).
6. **i18n key fallback** — if key not in translation, falls back to English. Make sure all strings are in `en/translation.json` first.
7. **Lazy loading** — pages imported with `React.lazy()` to reduce bundle. Don't use dynamic imports for components not at route level.
8. **No console.log in production** — hook flags it; use proper logger or remove before committing.

## Related Documentation

- [`docs/context/backend-patterns.md`](../backend-patterns.md) — API patterns, auth, error codes
- [`docs/context/business-logic.md`](../business-logic.md) — Order lifecycle, receipts, billing
- [`docs/context/api-reference.md`](../api-reference.md) — Endpoint specs, request/response shapes

## Stack Versions

```json
{
  "react": "^19.1.1",
  "react-router-dom": "^7.8.2",
  "@tanstack/react-query": "^5.86.0",
  "axios": "^1.11.0",
  "i18next": "^25.6.0",
  "tailwindcss": "^4.1.12",
  "@paddle/paddle-js": "^1.6.2",
  "socket.io-client": "^4.8.3",
  "lucide-react": "^0.542.0",
  "typescript": "~5.8.3"
}
```

---

**Remember:** The frontend is a thin client. Business logic lives in services + backend. Hooks orchestrate React Query. Contexts hold session state. Components render. Start with the services/hooks layer, not the UI.

## Document configuration and shared draft

`useDocumentDraft` reads `GET /settings/document-config` through Axios/React Query and owns the complete unsaved configuration, base revision, staged logo, and preview request version. `SettingsPage` keeps it mounted across Company, Receipt Design and Language tabs. The Advanced tab renders `AutoReceiptSetting`: a switch backed by `useAutoReceiptSetting` / `useUpdateAutoReceiptSetting` (query key `['settings', 'auto-receipt']`, `GET`/`POST /settings/auto-receipt`). When on, the backend queues a receipt on single and bulk order confirmation, so `useOrders` invalidates `['receipts']` as well as `['orders']` after confirm and batch-approve. `DocumentEditor` uses the existing semantic colors, typography, cards and template carousel. Subscription and interface language remain independent of the saved document configuration.

One **Save changes / Discard** bar covers all document fields and logo replacement/removal. Changes do not upload logos until an explicit save/generation/preset action. Reset design only changes the draft's appearance; company values, asset reference, terms and formatting are retained, and Discard reverses the reset. Failed saves keep drafts. Custom titles require non-whitespace text (native required/pattern handling and the shared draft payload guard); errors retain the current draft. Numeric legacy date style is labeled separately from explicit Short/Medium/Long, and the example includes the four-digit year. Revision conflicts offer saved-value comparison, reload of the saved base, and Discard; reloading alone keeps the draft.

The server owns template capabilities, returned by `/settings/templates`. Unsupported controls explain that values are retained. Accent applies only to Branded; terms only to Proforma. Logo alignment stays inside the real template slot. Manual sizing uses smaller Thermal bounds; automatic sizing retains the original template geometry. Contact visibility removes values before HTML/public metadata preparation.

**Refresh preview** posts the complete unsaved multipart draft to `/receipts/preview` and displays actual PDF bytes. Draft changes mark it stale. AbortController, request sequence and draft version guard late responses; old blob URLs are revoked. Navigation links, indexed browser Back/Forward and browser unload warn about unsaved changes; cancelling Back/Forward restores the current route and draft. Opening the PDF in a new tab keeps the draft. Headless Chrome may show a dark native PDF iframe; verification uses valid PDF bytes/text and the Open PDF preview link, and does not treat that screenshot as proof of native viewer rendering.

Named presets have explicit Use preset, Save as preset, Update preset and Delete actions. Selecting a preset alone changes neither draft nor defaults. Using one copies it into the draft; only Save changes applies account defaults. Maximum 20 presets; names and revisions are validated by the server.

The Orders action menu opens `CustomizeDocumentModal`, using the same editor with **This document only** scope. Generation sends a complete config and optional staged logo without saving defaults. Existing generated documents use explicit `replace`, expected active revision and a share-link replacement warning. Legacy reconstruction requires confirmation. Replacement status is separate from the active generated receipt; order polling recognizes it.

`PublicReceiptPage` uses the frozen visible projection and formatting preferences. Delivery omits money. Legacy documents without metadata offer their existing PDF without inventing historical company/recipient values.

Current verification: `frontend/e2e/template-features.cjs` drives the real SettingsPage and order action/editor, Axios and Query against `backend/test/serve-template-features.ts`. It uses production Nest services/HTML/Chrome with explicitly synthetic DB/storage, and runs in CI as `browser-documents`; the other browser specs (`node frontend/e2e/run.mjs`) run as `browser-regression`. See `frontend/e2e/README.md`. The earlier settings-regressions fixture/suite retains its pre-unified-save contract; it no longer matches the current SettingsPage and is not run in CI.

Closing Orders customization through Escape, Close or successful generation/retry restores focus to the surviving More actions button. Cancelling unsaved-draft confirmation leaves focus trapped inside the open editor.
