# ReceiptMaster Frontend — Agent Onboarding

**Last Updated:** 2026-11-10
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
│   ├── services/             # Business logic (OrderService, ReceiptService)
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
5. `<BrowserRouter>` — React Router 7.8 routing
6. `<PaddleProvider>` — Paddle billing (checkout, subscriptions); inside the router because it is not initialized on the public share route `/r/:token` (`providers/paddle-route.ts`)
7. `<Toaster>` — react-hot-toast notifications (top-right; `bottom-center` on phones below `sm`, `hooks/useMediaQuery.ts`, so a toast never covers an open dialog's header and Close; `NotificationToast` follows the same rule)

**Query client config** (lines 73–82):
- Default `staleTime: 5 min`, `gcTime: 10 min` (keep unused data 10 min before GC)
- `retry: 1` on failed queries
- No refetch on window focus (good for long-running sessions)

### Route Map

| Path | Component | Auth | Layout | Notes |
|------|-----------|------|--------|-------|
| `/` | `HomePage` | No | None | Public landing |
| `/dashboard` | `DashboardHomePage` | Yes | Layout | Main dashboard. Every query group shows an inline `role="alert"` with Retry on failure (never a 0 or an "all well-stocked" empty state; figures fall back to "—"); widget failures also feed the page banner via `useHasFailedQuery`. Skeletons live in `components/dashboard/DashboardSkeletons.tsx` (real heights, painted after 200 ms) |
| `/products` | `ProductsPage` | Yes | Layout | Manage products |
| `/recipients` | `RecipientsPage` | Yes | Layout | Manage buyers |
| `/suppliers` | `SuppliersPage` | Yes | Layout | Manage suppliers |
| `/orders` | `OrdersPage` | Yes | Layout | Core CRUD: orders. The status filter is kept in `?status=` (draft, confirmed or cancelled); clicking a row opens its details; bulk Approve asks for confirmation first (it locks the orders and may create receipts) |
| `/documents` | `DocumentsPage` | Yes | Layout | Every document across orders (table on desktop, cards on phones) with filters kept in the URL — see "Documents page" |
| `/analytics` | `DashboardPage` | Yes | Layout | Charts & analytics. The date range stays ordered (moving one end past the other drags the other along); CSV export is disabled for an empty period and prefixes cells starting with `= + - @` with `'` (`lib/csv-safety.ts`) so spreadsheets do not run them as formulas. Changing the period keeps the previous figures on screen (`placeholderData: keepPreviousData`), dimmed with `aria-busy` and an "Updating" cue; charts format money in the data's currency and honour reduced motion (`usePrefersReducedMotion`); date-only strings are formatted as local days (`periodLabel.ts`) |
| `/settings` | `SettingsPage` | Yes | Layout | One **Documents** tab (design editor, then requisites, numbering and signature/stamp), Subscription and Advanced. Tabs follow the ARIA tabs pattern (arrow keys, Home/End, roving tabindex) with a fade on the right while tabs are scrolled out of view. The sticky save bar of `DocumentEditor` appears only when there is a draft, a save in progress or an error (always in the "Customize document" modal); a successful save shows a toast. `--color-ring` is opaque so the focus indicator stays above 3:1 |
| `/profile` | `ProfilePage` | Yes | Layout | User profile. There is no self-service account deletion yet: "Request deletion" opens a `mailto:` to the support address from the privacy policy |
| `/r/:token` | `PublicReceiptPage` | No | None | Public receipt share link; rendered with `<SEO noindex />` (a capability URL, kept out of search results; `public/robots.txt` must not disallow `/r/`, or crawlers never see the noindex) |
| `/blog` | `BlogListPage` | No | None | Blog listing |
| `/blog/:slug` | `BlogPostPage` | No | None | Blog post (markdown) |
| `/terms`, `/privacy`, `/refund-policy`, `/cookie-policy` | Legal pages | No | None | Follow the interface language (en/ru/uk; any other language shows English) — see "Legal pages" |
| `*` | `NotFoundPage` | No | Layout when signed in | 404 fallback: `NotFoundRoute` in `App.tsx` renders it inside `Layout` (sidebar kept, button goes to `/dashboard`, `isInLayout`) for a signed-in user and standalone for visitors (`/` link) |

**Protected routes** wrap with `<ProtectedRoute>` component (line 101ff):
- Checks `useAuth().isAuthenticated`
- Shows loading spinner while `isLoading: true`
- Falls back to `<LoginForm>` if not authenticated

**Auth form errors:** `LoginModal`, `RegisterModal` and `LoginForm` validate with `lib/auth-validation.ts` (`validateLogin` / `validateRegister` return a problem per field) and show it under the field via `useFieldErrors` + `components/ui/FieldError` (`role="alert"`, `aria-invalid`, `aria-describedby`); the forms are `noValidate` so the browser's own bubbles do not replace them. Focus goes to the first invalid field, and editing a field clears only its own error. A server `USER_ALREADY_EXISTS` lands on the email field; wrong login credentials stay one form-level alert; anything else is a toast. New problem kinds need a key in `PROBLEM_MESSAGE_KEYS` and in all three locales. `ProductForm` and `RecipientForm` follow the same pattern (`noValidate`, per-field `error`, focus on the first invalid field); a taken product name or recipient email comes back as `PRODUCT_ALREADY_EXISTS` / `RECIPIENT_ALREADY_EXISTS` and is shown on that field. Shared input shapes live in `lib/field-patterns.ts`.

**Select all N (orders):** ticking the page's header checkbox shows a banner offering to select every matching order; `ordersApi.getMatchingIds` (`GET /orders/ids`, same filters as the list, capped at one 500-order batch) fills `allMatching`, and the bulk bar, confirm dialog and `batch-approve`/`batch-delete` then use those ids. The choice dies with its view (any filter, search, sort or page change, or a refetch). Approve is offered for it only under the Drafts filter, because the ids carry no status.

**Order numbers:** orders are quoted as `#<order_number>` (`lib/order-number.ts`, `formatOrderNumber`) in the list (own sortable `No.` column), mobile cards, details header, cancel/delete dialogs, the dashboard and the recipient drawer; the search box also finds an order by its number.

**Orders deep links:** `/orders?status=<draft|confirmed|cancelled>` and `/orders?search=<text>` open the list already filtered; `search` seeds `useServerPagination({ initialSearch })` and is removed from the URL straight away (the recipient drawer's "View all orders" uses it with the recipient's name, since the orders API searches by recipient name). **Confirmations** use `ConfirmModal`, never `window.confirm` (preset delete, replace/discard in `CustomizeDocumentModal`). Icon-only controls take their `aria-label`/`title` from `common.*` keys. `OnboardingModal`'s Skip/Back/Next footer is sticky inside the scrolling dialog, so it stays reachable in a short window; icon-only buttons (row actions, logout, sidebar close, the `Modal` Close button) grow to 44px under `pointer-coarse:` (touch screens) while staying compact for a mouse; order cancel/delete dialogs name the order (recipient · total); the logo picker rejects non-image types and files over 5 MiB itself, because `accept=` only filters the file dialog.

**Layout component** wraps authenticated pages:
- Sidebar (desktop) + mobile drawer
- Header with user email + logout
- Receipt progress panel for real-time updates (WebSocket)
- Tailwind `lg:` breakpoints for responsive design
- `OfflineBanner` (`layout/OfflineBanner.tsx`, `hooks/useOnlineStatus.ts`): a sticky `role="status"` notice (`common.offlineNotice`) below the mobile header while `navigator.onLine` is false; loaded data stays readable, changes cannot be saved. The live region stays mounted
- Collapsed desktop sidebar keeps the theme and language switchers as icon buttons (`layout/SidebarCompactControls.tsx`; labelled, with a tooltip; the language button cycles en, ru, uk)
- Authenticated routes use `AuthenticatedPage` in `App.tsx` (`ProtectedRoute` + `Layout` + its own `Suspense`), so a lazy page chunk shows `ContentSpinner` inside the shell. `PageSpinner`/`ContentSpinner` paint after 200 ms and are `role="status"` with sr-only text

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
  - On refresh failure clears auth and flags the session as expired (`lib/session-expiry.ts`). On a private page (`/dashboard`, `/orders`, `/documents`, ...; `PROTECTED_PATH_PREFIXES`) it reloads in place, so the inline login screen shows "Your session expired" on the same URL and `AuthContext.login` returns there via `postLoginPath`; elsewhere it goes to `/`
  - Deep link `/?auth=register` or `/?auth=login` makes `LandingShell` open that modal (used by the login screen's "Sign up here")
  - `?create=1` on `/products`, `/recipients` and `/orders` opens that page's create form (`hooks/useCreateIntent.ts`), then strips the parameter. `/orders?create=1&recipientId=<uuid>` preselects the recipient. Products and orders wait for the subscription status first so the plan limits still apply. The dashboard quick actions and the recipient drawer's "Create order" use it

**API method groups** (lines 159–497):
- `authApi.login()`, `register()`, `refresh()`, `logout()`, `getProfile()`, `updateProfile()`, `changePassword()` (registration and the profile form require at least `MIN_PASSWORD_LENGTH` = 8 characters and at most `MAX_PASSWORD_BYTES` = 72 **UTF-8 bytes** (`lib/password-policy.ts`: `passwordByteLength` uses `TextEncoder`), mirroring the backend's `MAX_PASSWORD_BYTES` on register and change-password: bcrypt reads only 72 bytes, a Cyrillic letter is 2. There is no `maxLength` on the inputs, so nothing is cut silently; `components/auth/PasswordBytesHint.tsx` shows the rule and a live `used/72 bytes` count, and an oversized password is refused with `errors.passwordTooLong` (inline `passwordTooLong` problem in `lib/auth-validation.ts` on register, a toast on the profile). Spec: `e2e/auth-inline-errors.spec.mjs`)
- `productsApi.getAll()`, `getById()`, `create()`, `update()`, `delete()`, `bulkDelete()`, `getLowStock()`
- `recipientsApi.*` — same CRUD pattern; `recipientsApi.update` takes `UpdateRecipientRequest` (changed
  fields only, `null` clears an optional field)
- `productsApi.create(data, { idempotencyKey })` / `recipientsApi.create(data, { idempotencyKey })` / `suppliersApi.create(data, { idempotencyKey })` send
  the optional `Idempotency-Key` header (see *Onboarding wizard*)
- `suppliersApi.*` — same CRUD pattern
- `ordersApi.getAll()`, `getById()`, `create()`, `update()`, `confirm()`, `cancel()`, `delete()`, `batchApprove()`, `batchDelete()`
- `dashboardApi.*` — revenue & turnover analytics
- `receiptsApi.getAll(params: DocumentListParams)` (documents list: `type`, `status`, `startDate`/`endDate`, `search`, `sortBy`, `sortOrder`, paging; rows are `DocumentListItem`), `create()`, `getById()`, `getPdf()`, `getPrinters()`, `print()`, `regenerate()`, `void()`, `testPreview()`, `share()`, `revokeShare()`, `getTemplatePreviewHtml()`
- `settingsApi.*` — logo upload, receipt design, templates, company info, payment/delivery terms, auto-receipt flag (`getAutoReceipt` / `updateAutoReceipt`), document numbering (`getNumbering` / `updateNumbering`) and signature/stamp images (`getSignoff`, `getSignoffImage` as a blob, `uploadSignoff` multipart field `file`, `deleteSignoff`)

**Type exports**: All `api-types.ts` types (Product, Recipient, Order, Receipt, etc.) re-exported from `api.ts` for convenience. Wire types are derived from `api-types.generated.ts` (gitignored; `yarn openapi:generate` from `backend/openapi.json`) rather than hand-written: besides the entity types, `Receipt` (the `ReceiptProjection` the receipt routes return; `Order.receipts` reuses it), `InventoryValue` and the document types in `lib/document-config.ts` (`DocumentConfig`, `ConfigVersion`, `DocumentDraft`, `PresetSummary`, `Preset`) are aliases of `components["schemas"]`. `TemplateCapabilities`/`DocumentTemplate` stay hand-written (`TemplateCapabilities.signoff` says whether a style prints the signature and stamp). The documents-list, numbering and signoff wire types (`DocumentListItem`, `NumberingSetting`, `NumberingUpdate`, `SignoffImage`, `SignoffState`) are aliases of `components["schemas"]` re-exported from `lib/documents-api-types.ts`; only `DocumentListParams` (the list query) is hand-written. `templateId` is therefore the backend's template-ID union; values read from the templates list are narrowed at the call site.

**Utilities** (lines 500–528):
- `formatCurrency(cents, currency)` — e.g., `100` cents → "1.00 UAH"
- `formatDate(dateString)` → localized "uk-RU" format
- `formatDate(iso)` / `formatDateOnly(iso)` format in the viewer's time zone and the interface language (`ru` -> ru-RU, `uk` -> uk-UA, `en` -> en-GB); do not call `toLocaleDateString()` without a locale
- `amountToCents(amount: string | number)` → robust parsing (handles commas, spaces, NaN)

### Error Handling: `lib/api-errors.ts`

**parseApiError(error)**:
- Takes any error, returns `{ message: string; code: string }`
- Checks Axios error response format: `{ error: string; errorCode: string }`
- For generic codes (`VALIDATION_ERROR`, `BAD_REQUEST`, `HTTP_EXCEPTION`) the server's own detail (string or class-validator array, joined with `; `) wins over the generic translation
- Falls back to legacy `{ message: string }`
- Network errors → "Ошибка сети. Проверьте подключение..."
- **i18n-aware**: translates error codes via the camelCase locale key —
  `PRODUCT_ALREADY_EXISTS` → `i18n.t('errors.productAlreadyExists')` (until 2026-10-30 it looked up
  a lower snake_case key that no locale has, so ru/uk always showed English). A code without a
  locale entry falls back to `ERROR_MESSAGES` (English), then to the backend's `error` text.
  Guarded by `frontend/e2e/api-errors.spec.mjs` Forms show `parseApiError(error).message`, not a blanket "Bad request" or a hand-rolled `data.message` lookup: the API puts the text in `data.error`.
- Fallback to `ERROR_MESSAGES` constant if i18n not ready

**ErrorCode enum**:
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
- Thin API wrapper: it neither logs nor notifies, it rethrows so the caller (the mutations in `useOrders`) shows exactly one toast per failure (`parseApiError(error).message`) and the matching success toast

**ReceiptService** (similar pattern):
```typescript
async generateReceipt(orderId: string): Promise<Receipt>
async getPrinters(): Promise<string[]>
async printReceipt(receiptId: string, printer?: string): Promise<void>
async downloadReceipt(receiptId: string): Promise<void>
// ... more methods
```

`ReceiptService` reports through react-hot-toast with translated messages. `generateReceipt` rethrows a failed POST and resolves on 202 (the PDF renders in the background; progress comes from `ReceiptProgressPanel`), so callers own the error toast. `PublicReceiptPage` treats only HTTP 404/410 as "not found"; other failures show a retry state.

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
- `['settings', 'document-numbering']`, `['settings', 'signoff']` — the Documents settings tab (set from each save's response, no refetch)

Always invalidate after mutations (`onSuccess` callback) so UI refetches fresh data.
Cancelling an order (`useOrders`) invalidates everything it changes on the server: `['orders']`,
`['receipts']` (a confirmed order's document is voided) and every dashboard key — `['dashboard']`,
`['totalRevenue']`, `['totalTurnover']`, `['dailyRevenue']`, `['orderStatusSummary']` (the default
`staleTime` is 5 minutes, so without this the dashboards would keep pre-cancel figures).

### Documents on an order (waybill, quote, invoice, act, sales receipt, packing list, return note)

An order carries several documents; `lib/document-types.ts` holds the per-type meta (mirror of the backend specs, kept in sync by `e2e/document-types-parity.spec.mjs`), `documentsOf/documentOf/voidedDocumentsOf/currentDocumentsOf/waybillOf/canCreate`. `documentOf(order, type)` is the newest non-void row of the type (by `created_at`; `order.receipts` is unordered), falling back to the newest void row, so a voided waybill stays "the waybill". `voidedDocumentsOf` is every other void row of the type, newest first (the history). `canCreate` is true when the order status allows it and the type has no document, the current one `failed`, or it is `void` **and the type is reissuable** (`REISSUABLE_DOCUMENT_TYPES` = invoice, act, quote, mirrored from the backend and covered by the parity spec). Waybill, sales receipt and packing list stay closed after a void (`DOCUMENT_ALREADY_EXISTS`). **Return note** (`return_note`, «Накладна на повернення товару», icon `Undo2`) is the exception, flagged `multiplePerOrder: true` in the meta (mirrored from the backend spec and covered by the parity spec): existing notes never block a new one, so `canCreate` is true for a CONFIRMED order while at least one `order.items` line has `remainingReturnQty(item) = qty - returned_qty > 0` (`OrderItem.returned_qty` is the backend ledger), `isMultiplePerOrder(type)` tells the repeatable type, `voidedDocumentsOf` returns `[]` for it and `currentDocumentsOf` therefore lists **every** note (void ones too, as their own cards with the Voided badge, no history footer). The card of a failed note shows the hint `documents.createAgain` instead of a Retry button (`retryBody` answers null, `retryDocument` does nothing), because an empty retry would not say which lines come back (the backend also answers 409 to a regenerate of a failed return note, and a failed note no longer holds its units, so they are returnable again). `VoidDocumentModal` uses `documents.voidMessageRepeatable` (quantities become available again), `CreateDocumentModal` never shows the reissue note for it. `OrderDocuments` renders one `DocumentCard` per current document (`currentDocumentsOf`) with a collapsible `VoidedDocumentHistory` ("Voided (n)": number, `voided_at`, reason, download only) as its footer; `OrderStatusBadge` shows chips for current documents only. `CreateDocumentModal` shows `documents.reissueNote` when it reissues over a void row, and `VoidDocumentModal` uses `documents.voidMessageReissuable` for the reissuable types.

- **Menu** (`OrderActionsMenu`): "Generate waybill" stays one click. A flat group "Create document" (`role="group"`, heading `documents.createGroup`) lists "Quote…" / "Invoice…" / "Act…" / "Sales receipt…" / "Packing list…" / "Return note…" (`CREATABLE_TYPES` = `GENERATABLE_TYPES` minus the waybill, in `DOCUMENT_TYPE_META` key order; `OrderActionsMenu` and `OrderDocuments` both derive from it) for every type `canCreate` allows: a CONFIRMED order gets the group before Cancel, a DRAFT order gets it after Edit/Confirm/Cancel (only the quote, whose `allowedOrderStatuses` include `draft`); the one-click waybill is confirmed-only. Arrow keys walk the flat index. The dropdown reserves `menuHeight = 520` px for positioning (a confirmed order has up to 12 items). Items open `CreateDocumentModal`.
- **Return note dialog** (`details: "return_note"`, `ReturnNoteFields`, `lib/document-details.ts::ReturnNoteForm / buildReturnNoteDetails`): a list of **cards**, one per order line (checkbox + product, "Ordered" / "Already returned" (`returned_qty`), then a full-width quantity input: default what is left, enabled once ticked; a fully returned line is disabled; cards instead of a table so nothing scrolls sideways at 375px/640px), and an optional reason textarea (`maxLength` 300); "no refund, no stock change" is said once, by the dialog note `documents.notes.return_note`. Nothing is ticked at first. The form stores only the ticked ids and the typed quantities, and the remaining units are read from the current `order.items` at validation time, so a refetched order never leaves a stale limit; a ticked line whose remaining quantity has dropped to 0 (its checkbox is disabled, e.g. after `RETURN_QUANTITY_EXCEEDED` and the refetch) is shown unticked and ignored by `buildReturnNoteDetails`, so it cannot keep Create stuck. Client checks: at least one ticked line (`documents.errors.returnLinesEmpty`), each quantity a whole number `1..remaining` (`returnQtyInvalid` "Enter a whole number from 1 to {{max}}", `returnQtyExceeded` "You can return no more than {{max}} pcs.", both naming the remaining maximum in en/ru/uk), reason trimmed and ≤300 (`reasonTooLong`); the request is `{ type: "return_note", details: { lines: [{ orderItemId, qty }], reason? }, overrides }` (only ticked lines, a blank reason left out). A server `422 RETURN_QUANTITY_EXCEEDED` (`ErrorCode.RETURN_QUANTITY_EXCEEDED`, `errors.returnQuantityExceeded`) is shown in the dialog and refetches `['orders']` so the table shows the current ledger. Because several notes are legitimate, `CreateDocumentModal.submit` guards the whole submit with `isSubmittingRef` (a double click issues one note); the unique-row 409 that protects the other types does not exist here. `documents.notes.return_note` says the note is informational, does not change stock, is not fiscal and not a «розрахунок коригування». Spec: `e2e/documents-orders.spec.mjs` (`checkReturnNote*`), with the ledger simulated in `support/document-mocks.mjs`.
- **Stale quote warning** (`EditOrderForm`): a quote is a frozen copy, so editing the order (recipient, items, prices; only DRAFT, unlocked orders are editable) never changes an issued quote. When `issuedQuoteOf(order)` (`lib/document-types.ts`: `documentOf(order, "quote")` that is `generated` or `processing`, i.e. not `void` or `failed`) exists, the form shows a warning block (`data-testid="stale-quote-warning"`, `role="alert"` so it is announced when the form opens, `orders.staleQuoteWarning`: void it and create a new one) before saving, and a toast (`orders.staleQuoteSaved`, 8 s) after a successful save. Nothing is voided automatically. Spec: `e2e/documents-orders.spec.mjs` (`checkStaleQuoteWarning`, `checkQuoteClock`).
- **`CreateDocumentModal`** (`components/orders/`): invoice sends exactly one of `details.dueDate` / `details.paymentTermDays` (a due date before today in the document time zone is refused on the client with `documents.errors.dueDateBeforeToday`, and the picker's `min` is that day; a server refusal of the due date (400 `INVOICE_DUE_DATE_BEFORE_ISSUE_DATE`, body `{ error, errorCode, field: "details.dueDate", dueDate, issueDate }`; `validationField` reads the body's `field`) is shown under the date as `documents.errors.dueDateServer`, never as the server's English sentence) (default `defaultPaymentTermDays ?? 5` from the `['companyInfo']` cache, `hooks/useCompanyInfo.ts`); act sends `contractRef` (≤200) and an optional `period` (both dates, from ≤ to); the quote (`details: "quote"`, `QuoteDetailsFields`) has `validUntil` (date input, min today, max today+365, prefilled with today+14 computed once per dialog via `quoteDefaults(timeZone, now)`; "today" is the calendar day in the account's document time zone, `documentConfigQuery` → `config.formatting.timeZone` (`lib/document-clock.ts::documentToday`, the same day the server takes as the issue date, so it does not drift from the browser's day near midnight; fallback `Europe/Kyiv` while the settings load or when the zone is unusable). The clock is read once when the dialog opens and only the fields the user touched are stored, so an untouched date follows the zone once the settings arrive), `paymentTerms` and `deliveryTerms` (≤300, trimmed, blank ones omitted; the UI says «Умови поставки» / «Условия поставки» / "Delivery terms", the same words as the PDF, not «доставки»). `validUntil` is sent **only if the user changed it** from the suggested value, otherwise the server computes issueDate+14 in the account time zone; a date before today or beyond 365 days is refused on the client (`documents.errors.validUntil*`), a server 400 on `details.validUntil|paymentTerms|deliveryTerms` is shown under that field. A quote is allowed on drafts and does not lock the order; the note `documents.notes.quote` says to void and re-create to send an updated one. Details are built and validated in `lib/document-details.ts`. The detail fields follow `DOCUMENT_TYPE_META[type].details` (`"invoice"` / `"act"` / `"quote"` / `null`; `buildDocumentRequest` is an exhaustive switch on it): `sales_receipt` and `packing_list` have `details: null`, so the dialog shows only the design picker, the requisites notice and a short note (`meta.createNoteKey`: the receipt is not a fiscal document and does not replace a РРО/ПРРО receipt; the packing list shows no prices and locks the order), and `buildDocumentRequest` sends `{ type, overrides }` with no `details`. The sales receipt warns on `seller.taxId` / `seller.vatPayer` (soft, listed by `RequisitesNotice`); the packing list has no requisite warnings. Neither accepts the thermal or delivery styles (the design list is already filtered by `capabilities.documentTypes`). The design list comes from `['document-templates']` (`useDocumentTemplates`), filtered by `capabilities.documentTypes` (the backend reports it per style) and `!locked`; the account's design is preselected when it fits (`useTemplateChoice`). The request carries `overrides.templateId`.
- **Requisites**: before sending, `lib/document-requisites.ts#forecastRequisites` mirrors `DOCUMENT_TYPE_META.requiredSeller/warnings` against company info and the order's recipient (the server only reports soft `warnings` inside the 422, never on success). A 422 `DOCUMENT_REQUISITES_MISSING` (`fields`/`warnings` at the body root, `parseRequisitesError`) is shown by `RequisitesNotice` as a banner, not a toast. A VAT-paying seller must also give `seller.vatId` for every type with `requiresVatIdForPayer` (quote, invoice and, since the backend change, act); the forecast adds it as a required field for those. `seller.*` links to `/settings?tab=company&highlight=seller.iban,…`; `buyer.*` to `/recipients?edit=<id>&highlight=buyer.taxId,…`. `useHighlightedFields` marks and focuses the named inputs (`id="requisite-<key>"`); `RecipientsPage` opens the edit form from `?edit=`.
- **Retention**: `GET /receipts/retention?type=` runs first (`lib/document-retention.ts::retentionFindingFor`); if a document would be evicted `components/documents/RetentionConfirmModal.tsx` names its number ("`{{limit}}` most recent kept"). If the lookup fails, the same dialog asks in general terms under a hedged title (`documents.replaceOldestUnknownTitle` "The oldest document may be replaced", `documents.replaceOldestUnknownMessage`: this may delete the oldest document of the type) instead of creating silently, except for `RETENTION_EXEMPT_DOCUMENT_TYPES` (invoice, act, return note; `lib/document-types.ts`, mirror of the backend's `document-retention.ts`, guarded by `e2e/document-types-parity.spec.mjs`), which are created straight away.
- **Server refusals in the create dialog** never show the server's English text: a refusal naming a `details.*` field marks that field (`dueDate` has its own text; any other field gets `documents.errors.invalidField` plus the banner `documents.errors.checkFields`); otherwise the banner is `translatedApiError(error)` (`lib/api-errors.ts`: the translated text of a known code, the network / rate-limit text, or null for a generic or unknown code) or, for null, `documents.errors.requestRejected` (400/415/422) / `documents.errors.createFailed` (anything else).
- **Details section** (`OrderDocuments` + `DocumentCard`): one card per document with status (`DocumentStatusBadge`, the same badge as the documents page, so "Replacing" / "Replacement failed" show on the order card too; while replacing, the Replace button keeps its label and only goes inert, so "Replacing" is said once), Download / Print / Share (`ShareReceiptModal`), Replace (`CustomizeDocumentModal` with a `document` prop) and Void (`VoidDocumentModal`, `receiptsApi.void`; invoice/act warn that another of the type cannot be issued). A failed card's Retry is inert (`aria-disabled`) while its request runs (`hooks/useInFlightIds.ts`, shared with the documents page) and invalidates `['orders']` and `['receipts']`; the "Retry frozen" action in `CustomizeDocumentModal` invalidates both as well. The requisite links (`RequisitesNotice`) open in a new tab (`target="_blank" rel="noopener"`, with a screen-reader "opens in a new tab") so the dialog and what was typed survive; while the notice shows, coming back to the tab (window `focus` / `visibilitychange`, `hooks/useOnReturnToTab.ts`) refetches `['companyInfo']`, invalidates `['orders']` and drops a stale server refusal, so the notice reflects what is stored now. The act period inputs have visible labels. `OrdersPage` keeps the clicked order only as a fallback and shows the copy from the loaded list, so a new document appears without reopening.
- **Voiding is final for every type**: the backend keeps one row per order and type and refuses a new one once it is generated or void (`RECEIPT_ALREADY_EXISTS` / `DOCUMENT_ALREADY_EXISTS`). `VoidDocumentModal` always uses the final wording, and the waybill's "Generate waybill" entries (menu, details) follow `canCreate(order, "waybill")`, so they vanish after a void but stay for no waybill or a failed one. `DocumentCard` translates system void reasons (`order_cancelled`, `documents.voidReasons.*`) and shows typed ones as typed.
- **Replacing a non-waybill document**: `CustomizeDocumentModal` passes `documentType` to `DocumentEditor`, which disables (select) or hides (carousel) designs whose `capabilities.documentTypes` lacks the type; if the account's design does not fit, the draft is switched to one that does. `/receipts/preview` renders the waybill layout only, so the preview is replaced by an explanation for every non-waybill type. `documentError` maps `DOCUMENT_TEMPLATE_UNSUPPORTED`, `DOCUMENT_TYPE_NOT_SUPPORTED`, `DOCUMENT_ALREADY_EXISTS`, `DOCUMENT_NUMBERS_EXHAUSTED`, `RECEIPT_ALREADY_EXISTS` to `errors.*`, and any 429 to `errors.rateLimited`. A 429 from the live preview (`/receipts/preview`, also returned while another preview of the account is rendering) and from the test preview (`TestReceiptButton`) goes through `lib/api-errors.ts::previewRateLimitText`: a `RATE_LIMITED` body keeps the server's wait (`errors.rateLimitedIn`), any other 429 there shows `errors.previewBusy`. `documentError` also keeps `retryAfterSeconds` for a `RATE_LIMITED` 429.
- Errors `documentRequisitesMissing`, `documentAlreadyExists`, `documentTemplateUnsupported`, `documentTypeNotSupported`, `documentNotVoidable` (409 on voiding a processing/failed waybill, sales receipt or packing list) and `documentNumbersExhausted` (409 on create when the type's counter is used up) are in `errors.*`. `VoidDocumentModal` shows `translatedApiError(error)` or `documents.errors.voidFailed`, never the server's text; a 409 `DOCUMENT_NOT_VOIDABLE` (`isNotVoidableRefusal`) is shown inside the dialog (`data-testid="void-refusal"`) with Void inert (`ConfirmModal.confirmDisabled`) and refetches `['orders']`/`['receipts']` so the row's status is current.

### Documents page (`/documents`)

`pages/DocumentsPage.tsx` lists every document of the account (`GET /receipts`, rows are `DocumentListItem` = the document plus `order: { id, order_number, status, recipient_name } | null`; documents of deleted orders are hidden by the backend). The sidebar entry sits after Orders (`navigation.documents`, `FileText`).

- **Data:** `hooks/useDocumentsList.ts` wraps `useServerPagination` with `queryKey: "receipts"`, so every existing `invalidateQueries(['receipts'])` (void, replace, socket events) refreshes it. Filters go in `extraParams` (`type`, `status`, `startDate`, `endDate`; the dates are date-only values that the API cuts in the **document time zone** (`documentConfig.formatting.timeZone`, default Europe/Kyiv); `hooks/useDocumentTimeZone.ts` gives that zone, the table formats dates in it (`formatDate(iso, timeZone)`) and the filter bar names it, so the days match what the table shows); sort fields are `created_at|number|document_type|status`. While any row is `processing` or has `replacement_status === "processing"` it invalidates `['receipts']` every 4 s (the socket is an accelerator only).
- **URL state:** `hooks/useDocumentsFilters.ts` keeps `?type=&status=&from=&to=&search=` and the sort `?sort=<created_at|number|document_type|status>&order=<asc|desc>` (left out while it is the default `created_at` desc; a sort change drops `?page=`; `useServerPagination` takes a controlled `sort` for this); the date inputs go through `hooks/useDebouncedInput.ts` (600 ms, flushed on blur; `cancel()` on Clear filters and any `popstate` (Back/Forward) drops a pending typed date), so typing a year (0002, 0020, 0202, 2026) sends one request; on phones the fields fold behind a "Filters (n)" toggle (`#documents-filters-toggle`, `aria-expanded`; the reversed-range hint stays outside the fold) and the two dates share a row (`grid-cols-2`); the time zone hint names the zone as people say it (`lib/time-zone-phrase.ts`: «за київським часом» for Europe/Kyiv, "Coordinated Universal Time (UTC)" for UTC, else city + offset); unknown type/status values and malformed dates are ignored. Updates build on a ref of the latest params, because two changes in one tick (a date and a search) would otherwise overwrite each other. The page mirrors the search box into `?search=` and seeds it from there.
- **UI:** `components/documents/` — `DocumentsFilterBar` (labelled selects and date inputs, "Clear filters"), `DocumentsTable` (the shared `DataTable`: table on `lg:`, cards below; skeleton/spinner, empty, filtered-empty and error-with-Retry states come from it), `useDocumentColumns` (number, type via `documentTypes.*`, order link `/orders?search=<order_number>`, recipient, status, date), `DocumentStatusBadge` (status plus a "Replacing" / "Replacement failed" badge) and `DocumentRowActions`. Which actions a row offers lives in `lib/document-actions.ts`: Download for `generated`, or `void` that still has a `pdf_url` (`receiptService.downloadReceipt`); Share (`ShareReceiptModal`) only for `generated`; Void (`VoidDocumentModal`, reason capped at 500 characters; a 400 on the reason, which arrives as a list of English messages, becomes `documents.errors.voidReasonInvalid` under the field and keeps the dialog open; it invalidates `['orders']` and `['receipts']`) only for `generated` with no replacement in progress (`canVoidDocument`); "Create again" for `failed` (`canRetryDocument` -> `receiptService.retryDocument(order_id, type)`, the same path as the order card; a failed return note has none and the order card says to create a new one). A failed row shows a translated reason (`DocumentFailureReason`; `lib/failure-reason.ts` maps the backend's English `error_message` to `documents.failureReasons.*`, anything unknown to a generic text; the order's `DocumentCard` uses it too). "Clear filters" also clears the search box and `?search=`. The table uses `DataTable`'s `compact` mode (tight cell padding, sticky actions column) so the actions fit at 1280px. On phones the retention hint is a `<details>` whose summary is its first sentence (`documentsPage.retentionShort*`, rest in `retentionMore`). `documentsPage.retentionHint` says that the 10 latest generated waybills, quotes, sales receipts and packing lists are kept while invoices, acts, return notes, voided and failed documents stay (the backend no longer evicts invoices, acts and return notes: `GET /receipts/retention` answers `replaces: null` for them, so `CreateDocumentModal` shows no replace confirmation). Specs: `e2e/documents-page.spec.mjs`, `e2e/documents-dialogs.spec.mjs` (return note and invoice dialogs at 375/640/1280px; set `E2E_SHOT_DIR` to save screenshots).

### Documents: accessibility, wording and list behaviour (hardening pass)

- **Dialogs:** the `Dialog` primitive renders through a portal to `<body>` and, when dialogs stack, marks the ones underneath `inert` + `aria-hidden` (so only the front dialog is exposed; e2e `getByRole("dialog")` sees one); it takes `returnFocus` for when the opener is gone or was not focusable. `OrderDetails` is built on it (`role="dialog"`, `aria-modal`, labelled by its title, Tab trapped, named Close X) and returns focus to the row's "More actions" button (`data-order-actions`) after a row click or the menu's View, or to the card's View button. Spec: `e2e/documents-review.spec.mjs`.
- **Orders list:** `OrderStatusBadge` also flags a failed document (`documents.status.failed`) and a failed replacement (`documentsPage.replacementFailed`); a voided document's chip is neutral (`data-indicator="void"`). Phone order cards read "#1 · Name".
- **Shared UI:** `Button` has `softDisabled` (renders `aria-disabled` instead of `disabled` while inert/loading so a pressed button keeps focus; used by numbering Save, the create dialog and `ConfirmModal`). `Dialog` focuses `[data-autofocus]`, else the first control that is not the header Close (`data-dialog-close`). `DataTable` sets `aria-sort` on sortable headers, shows a sort `<select>` + direction button above cards on phones (the button's text is the current order, "Ascending"/"Descending", and `aria-describedby` says a press reverses it; the select and hint ids come from `useId`; the Columns button is hidden in the card layout), marks loading/empty as `role="status"` with `aria-busy`, and draws no table head when the first load failed.
- **Documents page URL state:** `?page=` joins `type/status/from/to/search`. `hooks/useMirroredUrlParam.ts` keeps search and page equal to the URL in both directions (a sidebar click or Back pulls the change into the state; echoes of our own writes are ignored). A change of any filter in the filter bar resets the page in the same handler (no effect, so no request for the old page with the new filter); Back and links carry their own `?page=`. `useServerPagination` takes `initialPage` and only resets to page 1 when the debounced search really changed. `useDocumentsList` polls at most 45 visible ticks and pauses while `document.hidden`; the attempts restart when the set of generating row ids changes (a new `processing` row after exhaustion). Once they run out for the current set, the page shows `documents-polling-stopped` (`documentsPage.stillGenerating` + Refresh, `refreshGenerating`: refetch and a fresh round of attempts; focus then moves to the page heading). Stale entries in `useMirroredUrlParam`'s in-flight writes expire after 2 s. The table's loading overlay and `aria-busy` show only for a page/sort/filter change (`isShowingPreviousQuery`), never for a polling refetch; the overlay is also `pointer-events-none aria-hidden`. A reversed date range (`from > to`) sends no request (`enabled: false`) and shows an empty list with the filter bar's hint (said once). "Create again" (`hooks/useDocumentRetry.ts`) runs the same retention lookup and confirmation as creating from the order for capped types (including the hedged lookup-failed one), confirms with the `receipts.generateStarted` toast, and ignores clicks while its request is in flight (`aria-disabled`), and "Clear filters" returns focus to the type select. The retention hint takes its number from `GET /receipts/retention` (`hooks/useRetentionLimit.ts`), with a number-free text until it loads.
- **Settings > Documents** stays mounted (only `hidden`) after its first visit so a numbering draft survives switching tabs. `VoidDocumentModal` ignores close while the void request runs and shows the reason error only when the 400 blames `reason`. `numberingRefusal` translates VALIDATION_ERROR by field instead of showing the server's English sentence. A 429 on signature/stamp upload uses the shared `errors.rateLimited` / `rateLimitedIn` text (with `retryAfterSeconds`).
- **Rows and cards:** `VoidedDocumentNote` (reason or "No reason was given" plus what can be created next: reissuable / final / repeatable) is used by the list and `DocumentCard`; a failed row without a retry button (return note) points to the order (`failedNextStep`). Cards show labelled actions (`DocumentRowActions showLabels`); the table keeps icons with tooltips. Dates use `lib/document-date-format.ts::formatDocumentDateTime` (named month, minutes, document time zone). Order links use `orderSearchLink` (`encodeURIComponent`). `DocumentFailureReason` is plain text, not an alert. The reversed date range shows `documents-range-hint`.
- **Order chip:** `OrderStatusBadge` shows a void chip only if no newer document of that type exists (`isNewestOfType`), so a live return note is not shadowed by an old void one.
- **Create dialog:** the clock is `useDocumentNow(timeZone)` (refreshes only when the document-zone day changes; re-read at submit so an untouched quote date and the min dates never go stale). After a refusal focus moves to the first bad field (`lib/document-field-focus.ts`); act period errors are per field (`periodFrom` / `periodTo`) and go away as soon as the dates no longer have that problem (`withResolvedPeriodErrors`); return quantities have `aria-describedby` (max hint + error). Requisite banners say what blocks (`requisitesMissingTitle` / `requisitesRefusedTitle`) and what does not; `details.*` entries are labelled as fields of this dialog. Double submit stays guarded by `isSubmittingRef` / `isSendingRef` (the server also returns the first return note for an identical request within 10 s).
- **Void dialog:** title names the document with the type lower-cased mid-sentence (`Void invoice INV-7`, «Анулювати документ: рахунок на оплату …»), the reason textarea is auto-focused and linked to its error; `focusFallbackId` returns focus to the page/section heading when the opener is gone.
- **Numbering:** the preview is always "Number example"; "Minimum: N" is the start hint; hints explain prefix (with separator), zero padding (with example), year (counter does not reset yearly) and why the start can only go up. Only the edited row has a delayed `role="status"` (`useSettledValue`). A refused save focuses the field.
- **Signature/stamp:** empty files are refused on the client (`signoff.errors.empty`), 5xx upload errors show a fixed message, the preview sits on a checkerboard and is keyed to the asset id (no revoked/broken image after a replace), `SettingsLoadError` no longer prints raw server text and the second Documents section announces as `status` so a failed tab is one alert.
- **Issue warnings and rate limits:** `lib/issue-warnings.ts::notifyIssueWarnings` reads the optional `warnings` of an issue response (`SIGNOFF_UNAVAILABLE`, `kinds`) and shows a 12 s toast (`signoff.unavailable.*`); wired into `useCreateDocument`, `ReceiptService` (waybill and retry) and `CustomizeDocumentModal` (replace). `parseApiError` turns `RATE_LIMITED` (+ `retryAfterSeconds`) into `errors.rateLimitedIn` / `errors.rateLimited`.
- Specs: `e2e/documents-hardening.spec.mjs` (aria-sort, void/failed notes, reversed range, phone sort), plus updated `documents-*`, `settings-*`.

### Document numbering and signature/stamp (Settings > Documents)

`SettingsPage` has a `documents` tab (`settings.tabDocuments`, in `VALID_TABS`) that renders two sections.

- **Numbering** (`components/settings/DocumentNumberingSettings.tsx`, `NumberingRow.tsx`, `hooks/useDocumentNumbering.ts`, key `['settings','document-numbering']`): one form per document type (7) with prefix, digits (1..9), "include the year" and an optional "start from" that can only go up (`minStart` = the next number). A warning says a change affects new documents only. The live preview uses `lib/document-number-format.ts::formatDocumentNumber` (client mirror of the backend format: prefix + separator + optional `YYYY-` + zero-padded value; the separator is `-` when the trimmed prefix ends in a letter or digit, so «КП» prints КП-2026-000001 while «РФ-» and «A.» are used as typed; `e2e/numbering-format-parity.spec.mjs` runs the client copy against the backend's `formatDocumentNumber`); while the row is unchanged the server's `nextNumber` is shown, which is authoritative. Client checks mirror the server: trimmed prefix matching `^[\p{L}\p{N}._ -]{0,16}$` (`prefixProblem`), not ending with a digit, start a whole number >= `minStart`. The prefix example comes from the locale (`numbering.prefixExample`: «РН-» in uk/ru, "INV-" in en), and a trailing space shows `numbering.prefixSpaceHint` (it becomes a hyphen, with an example). Each `NumberingSetting` has `resetEveryYear`: the checkbox «Start the numbering anew every year» is disabled while «Include the year» is off, with visible text that says why (`numbering.resetNeedsYear`: without the year the restarted numbers would repeat), and switching the year off clears it; the hint and `nextValue`/`minStart` then refer to the current year (`numbering.startHintYearly`). A 400 naming `resetEveryYear` lands under that checkbox. Save sends `{ prefix, padding, includeYear, resetEveryYear?, startNumber? }` (`resetEveryYear` only when it changed, absent = keep on the server) and writes the response into the cache. Refusals map to a field in `lib/numbering-errors.ts`: 409 `NUMBERING_START_TOO_LOW` (`ErrorCode.NUMBERING_START_TOO_LOW`, `errors.numberingStartTooLow`, with `minStart` from the body root or `details.minStart`) goes under the start field and raises the row's minimum hint and client check to that value; a 400 `VALIDATION_ERROR` goes under the field whose name the message contains (prefix, padding, startNumber); anything else is a toast. The query refetches after a refusal so `minStart` is current. Spec: `e2e/settings-numbering.spec.mjs`.
- **Signature and stamp** (`SignoffSettings.tsx`, `SignoffUploader.tsx`, `hooks/useSignoff.ts` key `['settings','signoff']`, `hooks/useSignoffStyleSupport.ts`, `lib/signoff-file.ts`): two uploaders. The preview is a blob URL fetched from `GET /settings/signoff/:kind/image` (the endpoint needs the bearer token) and revoked when the image changes or the card unmounts. The client refuses anything that is not `image/png`/`image/jpeg` or is over 2 MiB before uploading (`accept=` only filters the dialog); a server 413 and 429 have their own messages (`signoff.errors.*`), 400/415/422 show `signoff.errors.rejected` and anything else untranslated `signoff.errors.failed` (never the server's English text). Upload and Delete of **both** cards are inert while any signature/stamp request runs (shared `mutationKey`, `useIsSignoffMutating`). Delete goes through `ConfirmModal` with per-kind wording (`signoff.deleteSignatureTitle` / `deleteStampTitle` and messages: «Видалити підпис?» … «його», «Видалити печатку?» … «її»). The note says issued documents do not change and names the styles that print the images, built from the templates list (`capabilities.signoff`, `useSignoffStyleSupport().supportingStyles`, joined with `Intl.ListFormat` and quoted by `signoff.styleQuoted`; `signoff.noteGeneric` until the list loads); a warning appears when the account's current style has `capabilities.signoff === false`. `CreateDocumentModal` adds `signoff.willBeAdded` when an image is stored and the chosen style supports it. `ShareReceiptModal` shows a warning note (`signoff.shareNote`, `data-testid="share-signoff-note"`) when `useSignoff` reports a stored signature or stamp: the PDF behind the public link carries them for documents issued with them. It does not block copying or revoking. Spec: `e2e/settings-signoff.spec.mjs`, `e2e/tax-id-checksum.spec.mjs` (share note).
- **Legal:** the privacy policy (3.2, 7) describes storage, EXIF removal, erasure within about 24 h of deletion and the copy that stays in issued documents; the terms (2.1) put the right to use the image on the user, say a facsimile is not a QES, and that a facsimile signature has legal effect only where the law provides for it or the parties agreed in writing (Art. 207 of the Civil Code of Ukraine; `TermsPage` last updated 2026-11-10). Keep the three languages' structure identical (`e2e/legal-pages.spec.mjs`).

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
  storageKeyPrefix: 'orders', // persist page size + column visibility to localStorage; add `columnsVersion: n` when a column default changes so older saved choices are ignored once (key becomes `<prefix>_v<n>_columns`)
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
- `refreshProfile()` — re-reads `/auth/profile` into `user` without the loading screen (used after an email change; no page reload)
- `hasProfileLoadError` / `retryLoadProfile()` — set when the startup profile request fails for a reason other than 401/403 (server down, 5xx). The tokens are kept, `ProtectedRoute` shows "Network error" with Retry instead of logging the user out

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

**First paint:** `index.html` carries a small inline script that adds the `dark` class and sets `<html lang>` from `localStorage` (`theme`, `i18nextLng`) before the bundle loads, so a dark theme does not flash white; keep it in sync with `getInitialTheme()` and `lib/i18n.ts`. Below 400 px the landing header hides the wordmark (icon only) so it cannot collide with the language switch.

**Native widgets:** `color-scheme` is `light` on `:root` and `dark` on `.dark`, so browser scrollbars and form controls follow the theme. Logout clears the saved table preferences (`*_columns`, `*_itemsPerPage`, `lib/table-preferences.ts`) but keeps theme and language.

**Text colour tokens** (`index.css`): `--color-text-secondary` and `--color-text-tertiary` are chosen to keep at least 4.5:1 against the page and card backgrounds in both themes (light 4.5–7:1, dark 4.8–8.5:1). Do not lighten them; use `text-content-tertiary` for the faintest readable text only. Status text uses its own tokens (`--color-text-accent|danger|success|warning`, applied through the `.text-*-base` classes in `index.css`): the fill tokens measured 2.6-4.3:1 as small text on their own tint, the text tokens keep at least 4.5:1 in both themes. Keep fills and text apart: change a fill via `--color-accent|danger|success|warning`, text via the `--color-text-*` ones. The dark accent fill is `#6064F0` so white text on it reaches 4.5:1.

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
- Initializes Paddle SDK (`@paddle/paddle-js`) only when the explicit build flag and backend capability are both enabled, and never on `/r/:token` (`isPaddleAllowedOn`, case-insensitive like the router, so `/R/<token>` too; the recipient of a share link is not a customer, and the SDK would see the capability URL). Opening an app page later initializes it then. The initialization promise is kept in a ref, so returning from `/r/` (or a StrictMode re-run) reuses it instead of loading the SDK again; the context value is memoized. Spec: `e2e/billing-disabled.spec.mjs`.
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
- Syncs `<html lang>` right after init (bundled resources make init synchronous, so the "initialized" event cannot be listened to) and on every language change

**useTranslation hook** (`hooks/useTranslation.ts`):
```typescript
const { t, changeLanguage, currentLanguage, isReady } = useTranslation()
// t('orders.recipient') → looks up in translation JSON
// changeLanguage('ru') → switches language
// currentLanguage → 'en' | 'ru' | 'uk'
```

**Convention:** Organize translation keys hierarchically (orders.recipient, settings.receiptTitle, etc.). Check JSON files for the full key structure.

**Landing copy:** every claim on the landing page must be backed by code. The template count (`landing.stats.templatesValue`, `landing.grid.receipts.*`, `landing.templates.title`, the Pro/Business `feat3`) must equal `TEMPLATE_METADATA` in `backend/src/modules/receipts/templates/metadata.ts`, and `e2e/locale-parity.spec.mjs` fails when any of them drifts. Plan limits (`landing.pricing.*`) mirror `PLAN_LIMITS` in `backend/src/modules/subscription/config/plans.config.ts`; the prices live in Paddle and are not checked. There are no usage statistics, SLA, trial, priority support or webhooks on the page because the product has none. The hero's secondary button only scrolls to `#features`, so it says "See features". Keep copy plain: no internal tech names (Redis, S3, BullMQ) in user-facing text.

**Wording:** user-facing strings outside the landing say "document" (or "waybill" where the waybill is meant) instead of receipt/квитанція/чек; type names are `documentTypes.{waybill,quote,invoice,act,sales_receipt,packing_list,return_note}` (the sales receipt is "Товарний чек" / "Sales receipt"; never name a document "cash/касовий"), requisite labels `documentFields.{seller,buyer,details}.*`, document UI `documents.*`. Code identifiers keep the `receipt*` names. `avgOrderValue` ("Середній чек") is a retail term and stays.

**Public-page behaviour:** `LandingShell` scrolls to the URL hash after mount (plain `<a href="/#features">` links from `/blog` and the legal pages) and the sections carry `scroll-margin-top: 84px` for the sticky nav; smooth scrolling exists only under `prefers-reduced-motion: no-preference` (CSS) and script scrolls use `getScrollBehavior()` (`lib/scroll-behavior.ts`). The blog has posts in `en`/`uk` only: the list follows `uk` or English, and a Russian interface shows `blog.languageNote`. `LegalLayout`'s header carries the language switcher and theme toggle.

### Legal pages

`TermsPage`, `PrivacyPage`, `RefundPolicyPage` and `CookiePolicyPage` are thin wrappers: they pick the text for the interface language with `pickLegalContent` (`pages/legal/types.ts`; `ru`/`uk` or English for anything else) and render it inside `LegalLayout`. The texts are per-language content modules, `pages/legal/<slug>.{en,ru,uk}.tsx`, each exporting a `LegalContent` (`title`, `seoDescription`, `body` JSX); `<SEO>` gets the translated title/description and `lang`. Page chrome (the "Last updated" line, its date format, the footer links) uses the `legal.*` locale keys. The `ru`/`uk` texts are **unreviewed translations** of the English originals; the English text is the source of truth, so a change there must be mirrored in the other two files with the same section structure (`e2e/legal-pages.spec.mjs` compares headings, lists, tables and links across languages). They need a legal review before being relied on.

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

**Retry of a failed document.** `ReceiptProgressPanel` resolves the failed card's document type from
`useDocumentTypes(receipts)` (a receiptId → `document_type` map filled from `GET /receipts/:id` as
cards appear) or, failing that, a fresh lookup; if the type is still unknown it shows
`receipts.retryTypeUnknown` and does nothing — it never assumes a waybill. `receiptService.retryDocument(orderId, type)`
sends the waybill through its own endpoint, invoice/act/quote to `POST /receipts/orders/:id/documents` with empty
`details`, and sales receipt/packing list with just `{ type }` (a return note is never retried: it needs its lines; the server repeats the frozen candidate; without one it answers 409 `RECONSTRUCTION_REQUIRED`,
shown translated via `errors.reconstructionRequired`). A failed `DocumentCard` in the order details has the same explicit
Retry button (`OrderDocuments` calls `retryDocument`, then refreshes `['orders']`).
`CreateDocumentModal` cannot be closed while a request is in flight and refreshes `['orders']` on `DOCUMENT_ALREADY_EXISTS`.

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

**Global Toaster** is `components/common/AppToaster.tsx`, rendered by App.tsx:
- Position: top-right on desktop; bottom-center on phones (`hooks/useIsDesktop.ts`), clear of the 56px header with Logout and of an open dialog's title and Close
- Duration: 4s (success 3s, error 7s); errors are announced as `role="alert"` (set at render time through a `ToastBar` wrapper, because react-hot-toast ignores per-type `ariaProps`)
- Styled with CSS vars for dark/light mode

**Usage:**
```typescript
import toast from 'react-hot-toast'

toast.success('Order confirmed')
toast.error('Failed to confirm order')
toast.loading('Processing...')
```

**Who toasts:** hooks and pages call `toast` (translated text, `parseApiError(error).message` for failures); services such as `OrderService` only throw, so one failure is one toast. The old `NotificationService` / `useNotifications` / `NotificationToast` trio is gone. Batch approve/delete success uses the plural keys `orders.batchApproved` / `orders.batchDeleted`.

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
├── documents/         # Documents page: filter bar, table/cards, row actions, status badge
├── landing/           # Homepage, hero, pricing
├── layout/            # Layout, Sidebar, Header
├── legal/             # LegalLayout (page chrome); the texts live in pages/legal/
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

### Product form: similar products (`hooks/useSimilarProducts.ts`)

The create form warns about products with a similar name while the user types. The hook sends a
debounced `GET /products?search=<name>&limit=10` once the trimmed name has two characters, under
`["products", "similar", term]`, so saving a product invalidates it. It searches on the server
because `limit` is capped at 100 (`common/dto/pagination.dto.ts`): a client-side filter would see
only the newest page of the catalog. The hint is advisory, so a failed search just shows nothing.

### Recipients page: refused deletes (`pages/RecipientsPage.tsx`)

A refused delete closes the confirmation and shows `parseApiError(...).message` as a toast, so 409
`RECIPIENT_HAS_ORDERS` reads as `errors.recipientHasOrders` (en/ru/uk).

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
  Skip and Back are also disabled while saving, so a double click sends one request. The auth modals,
  in-place `LoginForm` and `ProfilePage` use the same synchronous `inFlight` ref.
- **Closing is not skipping:** X, Escape, the backdrop and browser Back only hide the wizard for this
  visit (`isDismissed`, no request, offered again next time); the explicit "Skip for now" is the only
  close that POSTs `onboarding-complete`. The step title is the Modal `title` (the dialog's name) and
  focus opens on the step's first field (`hooks/useFocusFirstField.ts`, skipped on touch screens).
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
- `Modal.tsx` — centered overlay modal (built on the vendored `Dialog`, which already moves focus in, traps Tab and restores focus; when dialogs stack, only the topmost handles Escape and Tab; it renders through a portal under `<body>`, so a dialog opened from a table cell does not inherit that cell's `text-align` or other styles)
- `ConfirmModal.tsx` — yes/no dialog (X, Escape, backdrop and Back are ignored while `isLoading`, as in `common/DeleteConfirmation`); `itemName` shows what is being deleted, `dismissLabel` renames the dismiss button
- `Drawer.tsx` — side drawer (focus trap, Escape and Back via `hooks/useFocusTrap.ts`, page scroll locked by `hooks/useBodyScrollLock.ts`, a shared counter so stacked overlays can close in any order, used by every overlay including `CreateOrderModal`, `TemplateCarouselModal` and the landing mobile menu, never `document.body.style.overflow` directly; labelled close button; `title` shows a heading, `ariaLabel` only names the dialog). The mobile sidebar (`layout/Sidebar.tsx`) is the same kind of modal below `lg` and `inert` while closed
- `DataTable.tsx` — table with sorting, selection, pagination (uses `useServerPagination`). Loading shows `itemsPerPage` skeleton rows (card skeletons on `< lg`) after 200 ms (`useDelayedFlag`; the boxes are reserved from the start so nothing jumps), and a refetch overlay after 200 ms. On `< lg`, `selectable` adds a 44 px checkbox per card and a "Select all on this page" row. `ColumnDef.align: "right"` right-aligns numbers with `tabular-nums`; `isCompact` tightens cell padding; `rowLabel` names the checkboxes; `isOffline` (from `useServerPagination`, else the browser's online state) shows a `role="status"` notice with Retry. A zero-result search offers "Clear search"; an error with no rows shows only the alert card (a raw "status code" message becomes a friendly fallback). A failed load renders an alert with an optional Retry (`onRetry`, pages pass `pagination.queryResult.refetch`) and hides the "no data" empty state. While a query is in flight with no rows yet, the spinner shows instead of the "no data" empty state (so clearing a search does not flash "No suppliers yet"). `emptyAction` renders a call-to-action under the empty message (not while a search is active); `onRowClick` ignores clicks on buttons, links and inputs inside the row
- **Back closes dialogs:** `hooks/useBackClosesDialog.ts` gives every open dialog one marker history entry (a copy of `history.state`, so react-router's `idx` and the settings unsaved-draft guard see no navigation), so the browser Back button / phone back gesture closes only the topmost dialog instead of leaving the page. A normal close (X, Esc, overlay, submit) removes its own marker with `history.go(-n)`; pushes wait while such a pop is in flight. It is applied in `primitives/dialog.tsx` (so `Modal`/`ConfirmModal`), `Drawer`, `useFocusTrap` (so `ProductForm`, `SupplierForm`, `RecipientForm`, `CreateOrderModal`), `OrderDetails`, `EditOrderForm` and `TemplateCarouselModal`. A new hand-rolled overlay must call it too. Known limit: if the router navigates (e.g. a link inside a dialog) while a dialog is open, its marker is buried and one later Back is a no-op. Spec: `e2e/back-closes-modal.spec.mjs`.
- Overlays that are not built on `Dialog` (`CreateOrderModal`, `SupplierForm`, `RecipientForm`, `ProductForm`, `Drawer`) use `useFocusTrap(active, onEscape?)`: focus moves inside on open, Tab stays inside, Escape closes unless a child already handled it, focus returns to the opener. `Combobox` only swallows Escape while its list is open
- `Tabs.tsx` — tab navigation
- `Card.tsx` — card container with shadow
- `PortalDropdown.tsx` — menus. It follows the menu pattern: trigger `aria-haspopup="menu"` + `aria-expanded`, `role="menu"` / `role="menuitem"`, Arrow Up/Down, Home/End, Escape closes and returns focus to the trigger; real focus moves into the menu on open (roving over `DropdownItem`s)
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
| `src/hooks/useSimilarProducts.ts` | Debounced server search behind the product form's similar-name hint |
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

`useDocumentDraft` reads `GET /settings/document-config` through Axios/React Query and owns the complete unsaved configuration, base revision, staged logo, and preview request version. `SettingsPage` has one **Documents** tab (plus Subscription and Advanced); the old `?tab=company|receipt|language` links map to it (`LEGACY_TAB_ALIASES`). Below the editor the same tab holds `CompanyRequisitesCard`, `DocumentNumberingSettings` and `SignoffSettings`, which save through their own endpoints. The page stays mounted across tab switches so the draft survives. The Advanced tab renders `AutoReceiptSetting`: a switch backed by `useAutoReceiptSetting` / `useUpdateAutoReceiptSetting` (query key `['settings', 'auto-receipt']`, `GET`/`POST /settings/auto-receipt`). When on, the backend queues a receipt on single and bulk order confirmation, so `useOrders` invalidates `['receipts']` as well as `['orders']` after confirm and batch-approve. Before confirming with the flag on, `useOrders` asks `GET /receipts/retention` and shows the eviction notice (`orders.receiptLimitNotice`) with the backend's `limit` when `count + newReceipts > limit`; the cap number is not duplicated on the client. `DocumentEditor` uses the existing semantic colors, typography, cards and template carousel. Subscription and interface language remain independent of the saved document configuration.

**One page, plain sections.** `DocumentEditor` stacks cards, each with one line on what it changes on the PDF: `DocumentCompanySection` (Your business: fields with a per-field *Show on document* switch, tax and bank details folded; Customer details: three switches), `DocumentTemplateSection` (template select plus a button for the visual previews, automatic/custom title) and `DocumentBrandSection` (accent colour, logo with thumbnail, logo size and position folded, *Reset the look*; both in `DocumentLookSections.tsx`), `DocumentTextSection` (closing lines; payment and delivery terms, folded into a closed group when the template prints none), `DocumentFormatSection` (document language buttons, one **Region** that sets number and date style, a live example, the individual fields under *Fine-tune*; the time zone is a text field with a datalist), `DocumentPresets` ("Saved sets of settings", a closed `Disclosure`). Shared pieces: `ui/Disclosure` (native `<details>`) and `settings/document-ui.tsx` (`DocumentSection`, `LabelledField`, `CheckField`, `FieldHint`). Copy avoids draft/retained/slot/IANA wording; every string lives under `document.*` in en/ru/uk. `CustomizeDocumentModal` renders the same editor with `documentOnly`, which switches `DocumentLayoutContext` to `"dialog"`: the groups become accordions in the order that matters for one order (template and title, language and formats, texts, colour and logo, business and customer details, saved sets), all closed at first with only the PDF preview open (`DocumentPreviewPanel defaultOpen`, on a phone too), under a line naming the order and a sentence that only this document changes; the replace and rebuild-an-older-document cases are plain-language warnings. The action bar stacks on a phone.

One **Save changes / Discard changes** bar covers all document fields and logo replacement/removal. Changes do not upload logos until an explicit save/generation/preset action. *Reset the look* only changes the draft (title, colour, closing lines, logo layout, what is shown); company values, asset reference, template and logo file stay.

The server owns template capabilities, returned by `/settings/templates`. When the chosen template cannot show a field, the card says so ("The “X” template does not show this. What you enter is kept."). Accent applies only to templates that support it; terms only to Proforma. Logo alignment stays inside the real template slot.

**Preview.** `DocumentPreviewPanel` posts the complete unsaved multipart draft to `/receipts/preview` and displays actual PDF bytes. `useAutoPreview` re-renders it shortly after the last change (2 s quiet, at least 4 s between runs, never two at once, skipped while a custom title is empty or after a failed render until the next edit), because a render is a real PDF on the server and the API allows 30 a minute; a 429 sets `previewPaused` with a message and **Update now**. Preview problems are `previewError` in the panel, not the page-wide `error`. On a phone the panel comes first and collapsed, and renders only once opened. Draft changes mark it stale. AbortController, request sequence and draft version guard late responses; old blob URLs are revoked. Navigation links, indexed browser Back/Forward and browser unload warn about unsaved changes; cancelling Back/Forward restores the current route and draft. Opening the PDF in a new tab keeps the draft. Headless Chrome may show a dark native PDF iframe; verification uses valid PDF bytes/text and the *Open the preview in a new tab* link, and does not treat that screenshot as proof of native viewer rendering.

Named presets have explicit Use preset, Save as preset, Update preset and Delete actions. Selecting a preset alone changes neither draft nor defaults. Using one copies it into the draft; only Save changes applies account defaults. Maximum 20 presets; names and revisions are validated by the server.

The Orders action menu opens `CustomizeDocumentModal`, using the same editor with **This document only** scope. Generation sends a complete config and optional staged logo without saving defaults. Existing generated documents use explicit `replace`, expected active revision and a share-link replacement warning. Legacy reconstruction requires confirmation. Replacement status is separate from the active generated receipt; order polling recognizes it.

`PublicReceiptPage` uses the frozen visible projection and formatting preferences. Its labels come from the `publicReceipt.*` keys and read in the seller's `documentLanguage` (`i18n.getFixedT`), not the visitor's interface language; `<html lang>` follows it while the page is open. The not-found state uses the visitor's language. Delivery omits money. Without stored formatting it formats with `lib/public-receipt-format.ts::defaultFormattingFor(language)` (the language's locale, currency symbol, medium date, Europe/Kyiv), so no raw ISO date or bare number appears; a number starting with a letter (a prefix) is shown without "#"; the title is the server's `title` when sent, else the account's custom title for a waybill, else the type's name (`receipt.document_type`). Legacy documents without metadata offer their existing PDF without inventing historical company/recipient values.

Current verification: `frontend/e2e/template-features.cjs` drives the real SettingsPage and order action/editor, Axios and Query against `backend/test/serve-template-features.ts`. It uses production Nest services/HTML/Chrome with explicitly synthetic DB/storage, and runs in CI as `browser-documents`; the other browser specs (`node frontend/e2e/run.mjs`) run as `browser-regression`. See `frontend/e2e/README.md`. The earlier settings-regressions fixture/suite retains its pre-unified-save contract; it no longer matches the current SettingsPage and is not run in CI.

Closing Orders customization through Escape, Close or successful generation/retry restores focus to the surviving More actions button. Cancelling unsaved-draft confirmation leaves focus trapped inside the open editor.

## Seller and buyer requisites

`CompanyRequisitesCard` (Company tab of `DocumentEditor`, hidden in the per-document modal) saves tax-number kind, legal form, bank, VAT payer (tri-state), VAT number (ІПН, 10/12 digits), signatory name and position and the default payment term (1–365 days) with its own **Save requisites** button: `POST /settings/company-info` with only those keys (`updateFromForm` in `lib/company-requisites-form.ts`), so it never collides with the design draft's revision. The request body is typed by hand (`CompanyInfoUpdate` in `lib/api.ts`; the OpenAPI document does not describe it). Server validation errors are pinned to the field through `validationField`. The company IBAN / tax-id inputs live in the draft form (the tax id is labelled «ЄДРПОУ / РНОКПП», `settings.companyTaxId`; the VAT number ІПН is the separate requisites field); `CompanyFieldNote` warns (never blocks) when the IBAN is not a Ukrainian one or the tax id is not 8/10 digits. Saving the draft invalidates `['companyInfo']`.

**Act completion text:** the act form (`ActDetailsFields`, `ActForm.completionText`) has a textarea «Completion statement» (≤300, `MAX_ACT_COMPLETION_TEXT_LENGTH` mirrors the backend constant) with a trimmed-length counter. Its placeholder and its hint (visible text, `documents.completionTextStandardHint` / `CustomHint` with `{{text}}`, so the phrase does not vanish on the first keystroke) give the standard sentence in the *document* language (`useReceiptDesignSettings().templateLanguage`, key `documents.actCompletionStandard`, mirror of the backend `labels.actStatement`); empty or blank means the field is not sent (`details.completionText` omitted), and a «Use the standard text» button clears it. A server 400 on `details.completionText` is shown under the field. Spec: `e2e/documents-orders.spec.mjs`.

**Check digit hint:** `lib/tax-id-checksum.ts` (`taxIdChecksumStatus(value, pickedKind?)`: `true` / `false` / `null` when there is nothing to judge) verifies the ЄДРПОУ check digit (weights 1..7, 7,1..6 for codes in 30 000 000..60 000 000 exclusive, repeated with every weight +2 when the remainder is 10, `0` if it is 10 again) and the РНОКПП one (weights -1,5,7,9,4,6,10,5,7, mod 11 mod 10). It is separate from `lib/ua-requisites.ts`, which is a verbatim copy of the backend util and must stay so. `components/settings/TaxIdChecksumHint.tsx` renders `settings.requisites.taxIdChecksumNote` as a non-blocking `role="status"` line; it is wired into `CompanyFieldNote` (`companyTaxId`, only when the format is already fine) and under the tax-id input of `RecipientRequisitesFields` (not shown while the blocking format error is). The older free-text `companyTaxId` input of `CompanyInfoCustomizer` has no hint. Spec: `e2e/tax-id-checksum.spec.mjs`.

**Style names:** the backend sends each template's `name`; `lib/template-name.ts::templateDisplayName(t, template)` replaces it by an i18n string for `delivery` only (`settings.templateNames.delivery`: «Доставка» / «Доставка» / "Shipping note", matching its PDF title). It is applied in the template selector and carousel, onboarding template step, the document editor and `CreateDocumentModal` design pickers and the signoff style warning. The identifier and API values are unchanged. `TemplateSelector`'s `AUTOMATIC_TITLES` (the printed title it puts in the cache after a style change, when the account has no custom title) mirrors the backend's `translations/defaults.ts`: standard «Видаткова накладна» / «Расходная накладная» / "Delivery note", delivery «Накладна на відвантаження» / «Отгрузочная накладная» / "Shipping note", proforma unchanged.

`RecipientForm` has a collapsible "Requisites for documents" block (`RecipientRequisitesFields`): legal name, tax id + kind, IBAN, bank, legal address. Validation uses `lib/ua-requisites.ts` (copy of the backend util); create sends filled fields, update only changed ones (`lib/recipient-requisites.ts`), `null` clears. The tax-id kind always follows the number's length on the server (and the DB check requires both or neither), so the kind select is only a consistency check; the form starts on "by length" and there is nothing to reset. `ReceiptService` toasts and the printer prompt use `receipts.*` keys.

