# Business Logic & Domain Model

**Last Updated:** 2026-11-10

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
   - Cancelled and deleted orders do not count toward the month, so cancelling frees a place (as it also returns the stock)
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

**Auto-generated receipt (opt-in):** when `user_settings.autoGenerateReceipt` is on, `confirm()` and `approveBatch()` call `ReceiptsService.generateReceipt(orderId, user)` with default settings for every newly confirmed order, after the status change has committed. Calls are sequential (generation takes the per-tenant advisory lock). Any failure — plan limits, snapshot validation, a settings lookup error — is logged and swallowed: confirmation always succeeds and the manual "Generate receipt" path remains. Because the account keeps only the 10 newest generated receipts of each type, bulk-approving many orders with the flag on evicts older receipts (see the ten-generated-receipt limit in step 2 below).

File: `backend/src/modules/orders/orders.service.ts::confirm()` / `autoGenerateReceipts()`

**Cancellation Flow:**

Cancellation is a status change to CANCELLED, allowed from DRAFT and from CONFIRMED (the UI offers
both). It is not a deletion and returns no stock. One transaction:

1. Tenant lock `pg_advisory_xact_lock(hashtextextended(userId, 1))` — the receipt generation/promotion
   lock — then the order row `FOR UPDATE` (404 if missing; `ORDER_ALREADY_CANCELLED` if cancelled).
2. Always (a DRAFT order may carry a quotation): `ReceiptsService.voidForCancellation()` locks the order's non-void receipts in id
   order and voids each (`void_reason = "order_cancelled"`, `voided_at`), revoking `public_token` and
   clearing `replacement_*` and every `pending_*` field. A pending logo that differs from the active one
   gets its 24 h cleanup grace; the active PDF, frozen content and active logo stay as history. The
   order's `is_locked` is left alone (a cancelled order is never edited again).
3. Conditional update to CANCELLED. After commit: dashboard cache invalidation, return `findOne`.

Receipts voided by hand before the cancel keep their own reason and timestamp. Stock comes back only
from deleting the order (single or batch), exactly once, cancelled or not.

Races (all PostgreSQL-tested in `test/order-lifecycle.e2e-spec.ts` unless noted):

| Concurrent with cancel | Outcome |
|---|---|
| confirm / `approveBatch` | order lock + DRAFT check under it: whichever commits second sees the other; a confirm can never resurrect a cancelled order |
| generation request (manual or auto) | precreation re-checks the type's allowed order status (CONFIRMED; DRAFT or CONFIRMED for a quotation) under tenant → order locks; if it committed first, the cancel voids its PROCESSING receipt; after the cancel it is rejected (auto-generation logs and swallows) |
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

**Retention cap:** an account keeps its 10 most recent generated documents **of each document type** (`DOCUMENTS_RETAINED_PER_TYPE` in `receipts/document-retention.ts`, the single source of the number). The cap is enforced when a document is **promoted** to `GENERATED` (`ReceiptArtifactService`, under the tenant lock), never when its row is created: promoting the 11th document of a type retires the oldest one of that same type and its public link stops working, while a generation that fails costs nobody their place. **Invoices, acts and return notes are exempt** (`document-retention.ts::isRetentionExempt`): deleting an invoice or act would free its one-per-order slot (the same order could be invoiced twice under another number) and a return note is the record behind the quantities counted on the order lines, so their rows are never evicted and the cap is not enforced for them; `GET /receipts/retention` reports `replaces: null` for them. The cap still applies to the waybill, sales receipt, packing list and quotation; documents of other types are never counted or evicted by it. Every evictable type (waybill, sales receipt, packing list, quote) has its own ten. Before a manual "Generate Receipt" at the cap the UI asks for confirmation, naming the receipt that will be replaced (`GET /receipts/retention`, which accepts `?type=`, default `waybill`); Confirm / bulk Approve with auto-generate on show a notice afterwards instead. The backend itself never asks: it evicts silently.

**Document numbers** (`"2026-000007"` by default) are per account **and per document type**: `receipts/receipt-number.ts::nextDocumentNumber(manager, userId, type)` upserts the `(user_id, document_type)` row of `document_counters` in one statement (`INSERT … ON CONFLICT DO UPDATE … RETURNING value, prefix, padding, include_year`, so concurrent generations queue on that row, including the first insert, and never collide; a number is never reused, even after the retention cap evicts its document). It returns `{ number, value }`: the format is read in the same statement as the value, so a prefix change racing a draw yields a whole old or whole new number. Uniqueness is `(user_id, document_type, number)`; nothing looks a document up by number (public links use `public_token`, the API uses ids), and the download file name carries the type: `receipt-<number>.pdf` for a waybill, `<type>-<number>.pdf` for every other type (`invoice-…`, `act-…`, `quote-…`, `sales_receipt-…`, `packing_list-…`, `return_note-…`; `receipts.service.ts`), so equal numbers of two types never share a file name. An invoice and a waybill may both be `2026-000001`.

*Format and start.* Each counter row also holds `prefix` (`varchar(16)`, default `''`), `padding` (1 to 9, default 6) and `include_year` (default true); `formatDocumentNumber(format, value, year)` prints `prefix + separator + (includeYear ? "<year>-" : "") + String(value).padStart(padding, "0")`, where `separator` is `"-"` when the (trimmed) prefix ends in a letter or digit and empty when it already ends in `. _ -` or a space: the prefix is trimmed on save, so `"КП "` is stored as `КП` and prints `КП-2026-000001`, not `КП2026-000001` (the same function backs the `nextNumber` preview, so preview and issued number agree). The separator is applied to new draws only: numbers already issued are never rewritten, and a counter row whose stored prefix is a letter prefix without a separator starts printing the `-` from its next number (a different text from every number issued before, so nothing collides). The defaults reproduce the historical `YYYY-NNNNNN` byte for byte, so accounts that never touch the setting see no change. `DocumentNumberingService` (`receipts/document-numbering.service.ts`, routes under `/settings/document-numbering`) saves a format and may raise the counter (`startNumber`) in one transaction that locks the counter row, then (waybill) the user row, the same order `BUMP_WAYBILL_COUNTER` takes them in. The effective counter is `GREATEST(document_counters.value, users.receipt_counter)` for a waybill, plain `value` otherwise; a start below `effective + 1` is `409 NUMBERING_START_TOO_LOW` (`minStart = effective + 1`) and saves nothing. A start only ever raises the counter; for a waybill it raises `users.receipt_counter` as well. The number is frozen into `receipts.number` and the HTML at the draw; changing the format later never renumbers a document. A retry of a FAILED document keeps its number (if the slot row found under the lock carries another number than the one the candidate was built around, the request is a `409 Generation changed; refresh and retry` and the drawn number is handed back, so a PDF never shows a number its document lacks); a voided invoice/act/quotation issued again draws a new number in the format that applies then. The counter column is a 32-bit integer: a self-heal never raises it to the maximum (a hand-made number at `2147483647` is ignored), and a draw past the maximum is refused with 409 `DOCUMENT_NUMBERS_EXHAUSTED`, no number drawn.

*Yearly reset (optional, off by default).* `document_counters.reset_every_year` (default false, `resetEveryYear` in the numbering settings) makes the counter per (account, type, **year**), the year being the one printed in the number (document time zone, below). The yearly values live in `document_year_counters (user_id, document_type, year, value)` (FORCE RLS, created lazily); `document_counters.start_number` (default 1) is the value a new year starts at. `nextDocumentNumber` takes the year as `$3` and does the whole draw in one statement: the format row is upserted (its flat `value` is left untouched while the reset is on), then the year row is inserted or bumped with `ON CONFLICT (user_id, document_type, year) DO UPDATE value = value + 1`. A new year's row is created at `GREATEST(start_number - 1, highest value already issued in that year) + 1`, the second part read from `receipts` (numbers ending in `YYYY-<digits>`, at most 10 digits and 2 147 483 647) **only when the row is missing**; so the first draw of 1 January (document zone) is `…-000001` (or the start number), two parallel draws across the border get different numbers per year with no gaps, and numbers issued before the switch was turned on, by an older image or by hand are never repeated. The result is `DrawnNumber { number, value, year? }`; `year` is set for a yearly draw so `releaseDocumentNumber(…, year)` and `raiseCounterToIssued(…, year)` (the collision self-heal) act on that year's row only. The reset **requires `includeYear`** (a unique index on `receipts` has no year column, so `000001` of two years would collide): `400 VALIDATION_ERROR` on `resetEveryYear`, and the `CHK_document_counters_reset_needs_year` constraint. Settings semantics: `PUT` leaves the saved switch alone when `resetEveryYear` is omitted; `minStart`/`nextValue` describe the current year while it is on; a `startNumber` below the current year's next value is `409 NUMBERING_START_TOO_LOW`; the saved start number is what every later year starts at. Turning the reset off raises the flat counter to the current year's value (so the flat counter never issues a number the year counter already did). The waybill under the reset neither reads nor writes `users.receipt_counter`. With the switch off nothing reads `document_year_counters` and numbering is exactly as before.

*The year* is the calendar year **in the document's time zone** (`formatting.timeZone`, `Europe/Kyiv` for an account without a saved configuration), not UTC: `documentYear(now, timeZone)` in `receipt-number.ts` (via `issueDateIn`), so the number and the date printed next to it always agree (31 December 22:30 UTC is already 2027 in Kyiv). The zone is known only after the configuration is resolved, so every type (the waybill too) draws its number inside `ReceiptSnapshotService.prepare`, after the logo is staged; the preview `nextNumber` of the numbering settings uses the account's zone as well (`receipts/account-time-zone.ts`, which ignores a stored zone that is not an IANA name).

*Invariant: a prefix never ends with a digit.* Allowed prefix characters are letters, digits, `. _ -` and space (trimmed); `/ \ "` and control characters are refused (they would break the download file name and HTML attributes). Because the prefix ends in a non-digit, every number ends in exactly one maximal digit run, and that run is the counter value; so two different formats can never print the same text for different values (`A` + `2026-000001` and `A2026-` + `000001` are the same value 1, which a counter never issues twice), and the unique index on receipts needs no knowledge of formats. The rule is enforced three times: the DTO (`VALIDATION_ERROR`, field `prefix`), the migration's `CHECK` constraints (`CHK_document_counters_prefix`, `CHK_document_counters_padding`) and the unit test over several formats.

*Releasing a number.* A number is handed back only when it certainly never reached a committed document: a failure before the document transaction, or inside it (rolled back). It is **not** handed back when the insert collides on the number index (`IDX_receipts_user_type_number`, SQLSTATE 23505: the number exists, releasing would hand the same value out again) or when `COMMIT` itself fails (it may have landed; a gap is harmless, a reused number is not). **Self-heal:** (`raiseCounterToIssued` and `releaseDocumentNumber` read their `UPDATE … RETURNING` through a `WITH … SELECT` wrapper: the postgres driver answers a bare `UPDATE … RETURNING` with `[rows, count]`, not the rows, which once made the repair read `NaN` and `release` report `true` for every non-waybill type; `test/document-counter-repair.e2e-spec.ts` proves both on a real server.) On a number collision `raiseCounterToIssued` locks the counter row (then, for a waybill, the user row), raises the counter to the highest counter value found in the account's numbers of that type (the whole trailing digit run, up to 10 digits and at most 2 147 483 647, the `integer` column; never lowers; waybill also raises `users.receipt_counter`) and the generation is retried once with a fresh number; a second collision is `409`. The hand-back is a compare-and-set decrement by **value** (`releaseDocumentNumber(manager, userId, type, value)`: `WHERE value = $drawn`), which only works while no later number was drawn; otherwise a gap stays. It no longer parses the printed number, so it works for every format. Waybill numbers also keep `users.receipt_counter` in step for one release so an image rolled back without reverting the migration cannot reissue a number. Migration `DocumentCounters1792900000000` seeded each account's waybill counter with the higher of its old `receipt_counter` and the highest number it holds; `PerAccountReceiptNumbers1792700000000` earlier made numbers per account (the old global `generate_receipt_number()` function and sequence remain unused).

*Rollback.* `DocumentNumberingFormat1793400000000` is additive. An older image ignores the format columns and keeps issuing `YYYY-NNNNNN` from the same counters (still unique, since the old numbers are in the same value space); the deploy script's rollback note says so. Its `down` drops the constraints and columns, losing the saved formats. `DocumentCounterYear1793700000000` is additive too (two defaulted columns on `document_counters`, one new table); an older image ignores them. Its `down` first raises each flat counter (and the legacy waybill counter) to the highest yearly value, using temporary `TO CURRENT_USER` policies because both tables force row security against the owner role, then drops the table and columns (saved reset switches and year counters are lost).

**Dates in documents:** the live render path (`DocumentRenderService.prepare`) formats order date and "generated at" with `formatDocumentDate` and the saved document formatting (language, locale, style, hour cycle, one time zone for both). `TemplateService.prepareTemplateData` takes the same `Formatting` (default `DEFAULT_DOCUMENT_FORMATTING`, UTC; the live path for an account without saved `documentConfig` uses `legacyConfig`, i.e. `Europe/Kyiv`) so the dev `pdf-test` endpoints and legacy `PdfGeneratorService` cannot drift to the server's locale/time zone. The old React-PDF `standard`/`compact` templates were unreachable and are deleted. The Telegram bot's order confirmation is Russian-only by design (`ru-RU`).

**Statuses** (`ReceiptStatus`): `PROCESSING` → `GENERATED`, or `FAILED`; a generated
receipt can later be `VOID`. A receipt has a `document_type` (`DocumentType`: `waybill`,
`invoice`, `quote`, `act`, `sales_receipt`, `packing_list`, `return_note`; default `waybill`, the
видаткова накладна). An order carries **one live receipt row per type** (partial unique index
`IDX_receipts_order_document_type` on `(order_id, document_type)`, excluding `return_note`, which an
order may carry several of, and excluding `VOID` invoice, act and quote rows, which are history and free the slot for a reissue; a voided waybill, sales receipt or packing list keeps its slot, so the database itself refuses to issue those again), so a retry reuses the same
live row rather than inserting a new one. A voided **invoice, act or quotation** frees its slot: generating the
type again inserts a fresh row with a new number from the type's counter, the buyer and seller read
from current data, never from the voided document, which stays untouched (PDF kept, share link
revoked). A voided waybill, sales receipt or packing list stays closed and still answers
`DOCUMENT_ALREADY_EXISTS` (`REISSUABLE_DOCUMENT_TYPES` in `receipts/document-types.ts`). Because that void
is final for the order, only an issued (`GENERATED`) waybill, sales receipt or packing list can be voided
by hand: voiding one still `PROCESSING` or `FAILED` is a 409 `DOCUMENT_NOT_VOIDABLE` (retry the
generation instead). Invoices, acts, quotations and return notes can be voided in any live status, as before. Every lookup by
`(order, type)` in the generation path filters out `VOID` rows, so a retry resumes only its own live row.
`waybill`, `invoice` (рахунок на оплату), `act` (акт виконаних робіт), `sales_receipt` (товарний чек), `packing_list` (пакувальний лист) and `quote` (комерційна пропозиція) are generated, through one pipeline
(`ReceiptsService.generateDocument`; `generateReceipt` is the waybill wrapper): lookups, numbering, retention
and the unique row are all per type. `return_note` (накладна на повернення товару) is generated through the same pipeline but is the one type an order may carry several of (`multiplePerOrder` in its spec; see *Goods return note*). Per-type rules live in
`receipts/document-types.ts` (`DOCUMENT_TYPE_SPECS`: allowed order statuses, locking, required requisites,
warnings, heading, `layout`: party roles, payment block, completion statement, `money`, `notice` (`nonFiscalNotice` for the sales receipt, `quoteNotice` for the quotation, `returnNotice` for the return note, otherwise `null`), optional `grandTotalLabel` (`offerTotal` quotation, `saleTotal` sales receipt, `returnTotal` return note), optional `unknownVatNotice` (invoice and act), `itemsHeading` (`workDescription` for the act, `itemDescription` otherwise), `itemUnit` (`unitService` for the act, `unitPiece` otherwise), `buyerAddress`, `signatures` (seller/buyer heading keys and whether the caption mentions a seal), allowed HTML styles; invariant, tested: `requiresMoney === layout.money`); every typed document except the quotation needs a CONFIRMED order; all of them are available on every plan and are never
auto-generated (only the waybill is, on confirm). The invoice, act, sales receipt and packing list lock the order; the quotation and the return note do not (see *Order lock*). The quotation also takes a DRAFT order (the order-status gate in `generateDocument`, the promotion in `ReceiptArtifactService.execute` and the repair all read `allowedOrderStatuses` of the receipt's own type, not a hard-coded CONFIRMED). Numbering is per type (see *Document numbers*); the retention cap is per type.

**Invoice and act layout:** only `standard`, `classic`, `minimal` and `corporate` carry them (`layout.allowedStyles`; other styles are `DOCUMENT_TEMPLATE_UNSUPPORTED`). `services/document-view.ts::buildDocumentRenderData` turns the frozen document and the order into the `document` view the blocks print. Invoice: supplier and payer (code with its ЄДРПОУ/РНОКПП label, address, ІПН of a VAT payer), payment details (IBAN printed in groups of four, "UA21 3223 …", while the stored value keeps no spaces (`groupIban`); bank; payment purpose "Оплата згідно з рахунком № … від 10.11.2026"; SWIFT and МФО are not printed), totals, amount in words, due date, issuer signature. Act: contractor and customer, completion statement, contract, period, two signature columns, М.П. The completion sentence is the language default unless `details.completionText` is set (below). VAT: `seller.vatPayer === true` splits the (VAT-inclusive) total with `calculateVatBreakdown(mode: "included", rate)`, prints "Сума без ПДВ" (the total less the VAT, the same rounding, so the two always add up) before "У тому числі ПДВ (20%)" on every money document, and renames the price columns "… з ПДВ"; `false` prints "Без ПДВ"; unknown prints "Інформація про ПДВ не зазначена" / "Информация об НДС не указана" / "VAT information not specified" on the invoice and act (`layout.unknownVatNotice`) and nothing about VAT on the other types. The rate is `UA_VAT_RATE_PERCENT` (20, assumed not configurable yet), frozen in `FrozenDocument.vatRatePercent`. The builder refuses an order whose `total_cents` differs from the sum of its lines, but only for a document that prints money (`layout.money`): a packing list never fails on a bad order total, and no VAT is computed for it. The document date shown is the frozen issue date, not the order date.

**Items table of typed documents.** All four styles print a unit-of-measure column ("Од. вим." / "Ед. изм." / "Unit") on every typed document (`{{#if document}}` header and cell, class `doc-unit`, so a waybill's HTML is unchanged); every line reads "шт." / "шт." / "pcs", the act's "посл." / "усл." / "service" (`DocumentView.itemUnit` from `layout.itemUnit`). The description column is "Найменування робіт (послуг)" / "Наименование работ (услуг)" / "Description of work (services)" on the act and the neutral "Опис" / "Описание" / "Description" on every other type, in every style (`translationOverrides.description` and `productName`; Corporate used to print "Назва товару"); the Corporate price column is "Ціна" / "Цена" / "Price" (`rate`), renamed "… з ПДВ" for a VAT payer like the other styles. **Buyer signature column** (act "Від Замовника", packing list "Отримав", return note "Повернув"): the buyer's organisation above the signature line, the usual caption, then a second blank line captioned "посада, ПІБ" / "должность, ФИО" / "position, full name" for the person who signs (`signatures.buyer.nameCaption`).

**Tax codes and the act's VAT id.** The parties block prints a seller's or buyer's code only when its kind is known (`taxIdKind` is `edrpou` or `rnokpp`, so the label «ЄДРПОУ» / «РНОКПП» is true); a code of unknown kind is hidden rather than printed under no label (`document-view.ts`). The act now requires `seller.vatId` from a VAT payer, like the invoice, sales receipt and quotation (`requiresVatIdForPayer: true` in `document-types.ts`); a missing one is `422 DOCUMENT_REQUISITES_MISSING` with `seller.vatId` in `fields`.

**Sales receipt (товарний чек) and packing list (пакувальний лист):** both CONFIRMED-only, all plans, locking, never auto-generated, styles `standard`/`classic`/`minimal`/`corporate` only (`thermal`/`delivery` are `DOCUMENT_TEMPLATE_UNSUPPORTED`), no `details`. The sales receipt is explicitly **not a fiscal document**: it prints the notice "Не є фіскальним документом і не замінює розрахунковий документ РРО/ПРРО" / "Не является фискальным документом и не заменяет расчётный документ РРО/ПРРО" / "Not a fiscal receipt; does not replace a settlement document issued by a cash register (RRO/PRRO)." above the parties (the forbidden-wording spec exempts exactly this English sentence through its `ALLOWED_SENTENCES` list; any other "cash" or "fiscal receipt" still fails), does not replace a РРО/ПРРО receipt and is never called a cash or fiscal receipt anywhere (a spec scans labels, templates and locales for those words). It has seller/buyer parties, the invoice's items, totals, VAT lines (payer: "У тому числі ПДВ (20%)", non-payer "Без ПДВ") and amount in words, no payment block, and a single seller signature captioned "Підпис" without a seal. Hard requisite: `seller.name` (plus `seller.vatId` for a VAT payer); warnings `seller.taxId`, `seller.vatPayer`. The packing list is a **no-money** document (`layout.money === false`): shipper/consignee parties (the consignee's address is the delivery address, then the legal one), items with quantities only, a summary "Найменувань / Загальна кількість", no VAT line of the seller, signatures "Відправив"/"Отримав" (with the "посада, ПІБ" line under the consignee's). Hard requisite: `seller.name` only. `DocumentView.hidesItemPrices` makes the four styles drop the price and amount columns (`{{#unless document.hidesItemPrices}}`), and `DocumentRenderService.prepare` passes empty price strings to the template, so no price reaches the frozen HTML (and therefore the PDF). The public projection of a packing list is built with `money: false`: no `subtotal_cents`/`total_cents`, items reduced to `product_name` and `qty` (the same stripping the `delivery` style gets). Fixed headings: Товарний чек / Товарный чек / Sales Receipt; Пакувальний лист / Упаковочный лист / Packing List. A packing list locks its order although it carries no money.

**Quotation (комерційна пропозиція, `quote`):** an offer, not a bill. Order status DRAFT or CONFIRMED (CANCELLED is `ORDER_CANNOT_BE_MODIFIED`), **non-locking** (the order stays editable; issuing a quotation on a draft and then editing the order leaves the frozen quotation as it was, replace it to refresh), all plans, never auto-generated, styles `standard`/`classic`/`minimal`/`corporate` only. Own number counter (`YYYY-NNNNNN`), file `quote-<number>.pdf`, heading Комерційна пропозиція / Коммерческое предложение / Quotation. `details` (strict; unknown keys such as `dueDate` or `paymentTermDays` are a 400): `validUntil` (calendar date), `paymentTerms`, `deliveryTerms` (trimmed text, 1..300 chars, `QUOTE_TERMS_MAX_LENGTH`). `frozen-document.ts::resolveQuoteDetails`: without `validUntil` the server uses issue date + 14 days (`QUOTE_DEFAULT_VALIDITY_DAYS`, `validUntilSource: "default"`, else `"request_date"`); the issue date is the calendar day in `formatting.timeZone` (an account without saved formatting gets `DEFAULT_DOCUMENT_TIME_ZONE = "Europe/Kyiv"` from `legacyConfig`, never the server's own zone, so 23:30 UTC on 2 Nov is already 3 Nov); the date must be neither before the issue date nor later than issue date + 365 days (`QUOTE_MAX_VALIDITY_DAYS`), otherwise `400 VALIDATION_ERROR` ("Validation error for details.validUntil: must not be earlier than the issue date" / "…: must be within 365 days of the issue date"), always in preflight, so no number is burned. The resolved details live in `active_snapshot.document.details` (no DB column); a replacement carries them over unchanged (`carryOver.details`), a FAILED retry re-resolves them from the new request. Requisites: hard `seller.name` (plus `seller.vatId` for a VAT payer), warnings `seller.taxId`, `seller.legalForm`, `seller.vatPayer`; no IBAN, no buyer requirement. Layout: supplier/buyer parties, the notice "Комерційна пропозиція не є рахунком. Для оплати буде виставлено рахунок." / "Коммерческое предложение не является счётом. Для оплаты будет выставлен счёт." / "This quotation is not an invoice. An invoice will be issued for payment." (`quoteNotice`) above them, items, totals with the VAT lines like an invoice but the last line is "Загальна вартість" (`offerTotal`, set through `layout.grandTotalLabel`; the invoice keeps "Всього до сплати", the sales receipt prints the neutral "Всього" / `saleTotal`, the return note "Вартість повернутого товару"), amount in words, **no payment block**, then "Пропозиція дійсна до" and the optional "Умови оплати" / "Умови поставки" (`DocumentView.offer`, printed by the `documentClosing` partial under `{{#if document.offer}}`), one supplier signature "Від Постачальника" with "Підпис / М.П.". It is reissuable (`REISSUABLE_DOCUMENT_TYPES`), so voiding frees the slot and the order may carry the voided row plus a live one. Cancelling the order (DRAFT or CONFIRMED) voids a live quotation with the other documents (`order_cancelled`, link revoked). Deleting the order (`remove` / `deleteBatch`) does not void anything but revokes the public link of every document the order carries (`ReceiptsService.revokePublicLinksForOrders`, `public_token = null`, same transaction, before the soft delete). Voiding a quotation never unlocks an order that a waybill or invoice still locks. **Stale quotation:** because the quotation is non-locking, a DRAFT order can be edited after it was issued and the frozen PDF then no longer matches the order; the product does not void or refresh it. The frontend warns instead (before saving in the edit form, and with a notice after), telling the user to void the quotation and issue a new one (`orders.staleQuoteWarning` / `orders.staleQuoteSaved`). The create dialog counts the suggested validity date from "today" in the account's `formatting.timeZone` (fallback `Europe/Kyiv`), matching the server's issue date. User-facing wording for `deliveryTerms` is «Умови поставки» / «Условия поставки» / "Delivery terms", as in the PDF. The Terms of Service and Privacy Policy describe the quotation as an informational offer, not an invoice, primary document or basis for payment/accounting, and list it among the stored types (10 per type).

**Goods return note (накладна на повернення товару, `return_note`):** records goods that come back under a CONFIRMED order. **Informational only**: it does not change product stock, is not a fiscal document and is not a «розрахунок коригування» to a tax invoice (the Terms say so), does not lock the order, and is never auto-generated. `POST /receipts/orders/:orderId/documents` takes `details: { lines: [{ orderItemId, qty }], reason? }` (api-reference). **Several live notes per order** are allowed (partial returns), so none of the one-live-row-per-type logic applies: every request inserts a new row, existing notes never produce `DOCUMENT_ALREADY_EXISTS`, and the partial unique index excludes the type. **Ledger:** `order_items.returned_qty` (migration `AddOrderItemReturnedQty1793300000000`, `CHECK 0 <= returned_qty <= qty`) is the units already taken back by non-void notes; issuing a note increments it for its lines inside the issuing transaction (guarded atomically, so parallel notes cannot over-return: `422 RETURN_QUANTITY_EXCEEDED` with the short lines), and **voiding a note decrements it again**, so the quantities can be returned by a new note. **A note that ends `failed` also gives its quantities back**: the status change and the guarded release run in one transaction, exactly once (`receipts/receipt-failure.ts`, called by both the worker failure path and the outbox reconciliation); failure is final (no retry, `regenerate` on a failed return note returns 409 «issue a new one»), and voiding a failed note does not release a second time. A failure with no readable frozen lines logs a warning and releases nothing. Void and failure release through one function, `releaseReturnNoteQuantities` (`return-note-ledger.ts`); a line whose guarded release finds less returned than the note holds (the ledger disagrees with an issued note) is logged at **error** level with the note, order, user and item ids and quantities, and the void or failure still goes ahead. **Cancelling the order keeps the quantities.** **Return notes are never evicted**: the 10-per-type cap does not apply to them (see *Retention cap*), so no note row is ever deleted by it and the returned quantities always keep their record. The note freezes the returned lines (priced per piece; a line returned in full keeps its stored total), the reason text and the source it is made against (newest issued waybill, else newest issued invoice, else the order). The basis says what the **source document's own PDF says**: its printed heading (a waybill's own title, e.g. «Видаткова накладна», or «Інвойс» on one issued before that default changed, or «Накладна на відвантаження» from the `delivery` style, read from its frozen `publicProjection.companyInfo.receiptTitle`, so changing the default never rewrites the basis of an existing note; an invoice's frozen `document.title`) and its printed date (a waybill prints the order date, taken from its frozen order in its own time zone; an invoice's frozen `document.issueDate`, never recomputed from the row's creation time). A source without a usable snapshot falls back to the generic label («Видаткова накладна» / «Расходная накладная» / "Delivery note", «Рахунок на оплату») and the row's creation date; an order basis is unchanged (`ReturnSource.title` in `return-note.ts`, `resolveReturnSource` in `return-note-ledger.ts`). The reason is stored with the frozen document and printed in the PDF (disclosed in the Privacy Policy). The frontend offers the note while any line has `qty - returned_qty > 0`, lists every note as its own card, and shows no retry for a failed one (see frontend.md).

**Double submit of a return note.** Because a return note repeats freely, a double click would otherwise issue two notes. `ReceiptsService` therefore asks `findRecentIdenticalReturnNote` (`return-note-ledger.ts`) first, before the preflight quantity check, and again under the order row lock: a processing or generated note of the same order created within `DUPLICATE_RETURN_WINDOW_SECONDS` (10, database clock) with the same sorted `(orderItemId, qty)` lines and the same reason is returned instead of creating another one (its drawn number is handed back, `returned_qty` counts once). Different lines/quantities/reason, a voided or failed first note, or a request after the window are new returns. The order lock is what makes this work across processes. In-process, `ReceiptsService.generateDocument` runs **every** type, return notes and the waybill included, under one keyed mutex per `(user, order, type)` (`generationMutex`, a `KeyedMutex`), so a concurrent duplicate waits and then meets the first request's row (or its identical return note) before it draws a number; before this a burst of identical requests left gaps in the waybill and return-note sequences (only the highest drawn number can be handed back).

**Document formatting details.** The payment purpose of an invoice ("Оплата згідно з рахунком № … від 10.11.2026, у т.ч. ПДВ 20% — 200,00 грн"; ru "Оплата по счёту № … от 10.11.2026"; en "Payment for invoice No. … dated 10.11.2026") prints the issue date as a short numeric `dd.mm.yyyy`, whatever the account's date style, and the VAT amount with `formatPlainAmount`: ordinary spaces (no U+00A0/U+202F) and the unit as letters ("грн" for UAH in uk/ru, otherwise the ISO code), never the "₴" symbol, because banks' payment forms reject or mangle them. The seller's name is printed with its legal form via `nameWithLegalForm` ("ТОВ" + "Ромашка"), but a name that already starts with the form as a whole word ("ТОВ Ромашка") is not prefixed again. The wording of the delivery/supply terms is «Умови поставки» / «Условия поставки» / "Delivery terms" on both the quotation and the proforma (`translations/{uk,ru,en}.json` equals `DOCUMENT_LABELS`, pinned by a spec).

**Invoice due date.** An explicit `details.dueDate` must lie within `[issueDate, issueDate + 365 days]` (`INVOICE_MAX_TERM_DAYS`, the ceiling `paymentTermDays` already had); both bounds are `400` before a number is drawn. **Packing list preflight** skips the amount checks (`amountInWords`, money formatting): it prints no money, so a bad order total cannot fail it.

**Documents list sort by number.** `GET /receipts?sortBy=number` orders by the counter value read back from the number text (the trailing digit run, at most 18 digits; prefixes never end in a digit, so the run is exactly the counter value), then by the text and id, nulls last, so "РФ-9" sorts before "РФ-10". The value is not stored on the row (no migration); numbers across types or prefixes interleave by value.

**Order lock (`orders.is_locked`):** promotion of a *locking* document (`waybill`, `invoice`, `act`, `sales_receipt`, `packing_list`; `receipts/order-lock.ts::LOCKING_DOCUMENT_TYPES`) sets it; `quote` and `return_note` do not. A manual void recomputes it with `syncOrderLock()`: the order unlocks only when no GENERATED locking document remains. The replace/repair/promotion gates that require a locked order apply to locking types only. Eviction by the retention cap does recompute it: `ReceiptArtifactService.evictOverCap` collects the orders of the evicted locking documents, locks those order rows in id order **before** it locks the evicted receipts, deletes the rows, then calls `syncOrderLock` for each, so an order whose only locking document was evicted becomes editable again. No cycle with a manual void is possible: the promotion already holds tenant → promoted order → promoted receipt, a void of another order holds only that order and waits only for that order's receipts, which the eviction has not locked yet when it queues for the order row.

File: `backend/src/modules/receipts/entities/receipt.entity.ts`

**Trigger:** User requests PDF for a CONFIRMED order, or the order is confirmed while the account's `autoGenerateReceipt` setting is on.

**High-Level Process:**

1. **Prepare and freeze outside locks.** Resolve authoritative account defaults or a preset plus validated document overrides. Capture transaction/recipient values, title provenance, contact visibility, document language and formatting. Load immutable normalized logo bytes and compile final HTML with embedded fonts/logo and complete PDF options.
2. **Commit durable intent.** Revalidate authoritative revisions and locked order/recipient inputs in a short transaction. Create/reuse the unique order receipt, save one pending candidate, and insert an identifier-only outbox entry. Quota enforcement is serialized; the existing ten-generated-documents-per-type eviction policy remains. Publish to Redis after commit.
3. **Render the frozen candidate.** BullMQ retries use stored HTML/options only; changes to settings, logos, recipients or templates do not change a queued candidate. Each attempt uploads to a fresh immutable key. Promotion atomically checks tenant/generation/pending/active-version/order/lifecycle and switches the entire active document.
4. **Retry and replacement.** Initial generation uses PROCESSING/FAILED. A generated document keeps its active PDF and public availability during replacement, with separate processing/failed replacement status. A failed candidate stays retryable and the old artifact is never deleted first. A default failed-generation retry reuses its frozen candidate; an explicitly supplied new configuration prepares a new design while retaining captured transaction inputs. Legacy jobs without frozen candidates require explicit owner reconstruction. Empty-body regeneration now reproduces frozen content; applying current/new design requires explicit `replace`. This deliberately changes the former current-settings regeneration behavior. Missing active files repair only from trustworthy frozen HTML/options; temporary download failures do not cause reconstruction. Legacy missing snapshots require explicit owner-confirmed reconstruction, and historical fidelity is not invented. Share revocation and concurrent void cannot be undone by promotion. The order part of the commit-time recheck compares only what the document prints (lines, totals, recipient contacts, status), so promoting another document of the same order meanwhile (which locks the order and moves `updated_at`) does not fail the generation with "Order changed".

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

Receipt title and the HTML `lang` use the selected `en`/`ru`/`uk` language. A waybill
without a saved title is headed «Видаткова накладна» / «Расходная накладная» / "Delivery
note" (`DEFAULT_RECEIPT_TITLE` in `templates/translations/defaults.ts`; it was «Інвойс» /
«Инвойс» / "Invoice" before 2026-11-10, which issued waybills keep in their frozen HTML).
Delivery and Proforma use their localised document names when the raw stored title is null,
empty or whitespace: the price-less Delivery style is «Накладна на відвантаження» /
«Отгрузочная накладная» / "Shipping note" (it carries no prices, so it is not called a
видаткова накладна), Proforma «Проформа-інвойс». Explicitly saved nonempty titles are
preserved even when equal to the language's default (an account that saved «Інвойс» keeps it).
The footer stamp reads «Документ сформовано:» / «Документ сформирован:» / "Document
generated:" (it said «Чек згенеровано» before).
`SettingsService.getAllPdfSettings()` preserves this provenance in the internal
`hasCustomReceiptTitle` flag, passed through generation, regeneration and test receipts.
Legacy callers that omit provenance still recognise the language's default title. Delivery remains
price-free and Proforma retains its watermark; neither implies payment was received.
Every style supports footer title and subtitle independently. Waybill item columns display
only real order fields (description, quantity, unit price and line total), without invented
units or item taxes; typed documents add a fixed unit of measure (see *Items table of typed
documents*). Corporate does not label an ordinary invoice a debit memo.

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

### Counterparty requisites and typed documents

Both sides of a document may carry optional legal requisites. Seller: `user_settings` columns
`companyTaxIdKind`, `companyLegalForm`, `companyBankName`, `companyVatPayer`, `companyVatId`
(10 or 12 digits), `companySignatoryName`/`Position`, `defaultPaymentTermDays` (1..365). Buyer:
`recipients.legal_name`, `tax_id` + `tax_id_kind` (8 digits ЄДРПОУ / 10 digits РНОКПП, always set
together, kind derived from the length), `iban` (UA, mod-97), `bank_name`, `legal_address`. Nothing is
mandatory to save. They are deliberately outside `DocumentConfig` and `FrozenOrder`/`captureOrder`
(so `orderFingerprint` and waybill snapshots are unchanged). Tax-id checksums are not verified.

An **invoice** or **act** reads them at generation time: `receipts/document-requisites.ts` builds the seller
(resolved config company + the columns) and the buyer (the order's recipient), `receipts/frozen-document.ts`
checks them and resolves the issue date (generation day in `formatting.timeZone`), the invoice due date
(request date, request days, `defaultPaymentTermDays`, else 5 days; `details.dueDateSource` records which) and
the fixed heading. The result is `snapshot.document` (`type, title, details, issueDate, seller, buyer,
warnings, buyerFingerprint`); a waybill snapshot has no such key. It is not in `publicProjection`, so the buyer's
IBAN/tax id, the VAT id and the signatory are never public; the seller's IBAN/tax code appear publicly only via
`companyInfo` under the usual visibility switches. Missing hard requisites are `422 DOCUMENT_REQUISITES_MISSING`
(see api-reference); the check runs before a number is allocated (a refusal never burns one: order status,
template support, requisites, dates are pre-checked, and the number is drawn only after the logo is staged, so a bad logo file, quota or upload failure never burns one, and an unprintable order total or currency is refused in preflight (`DOCUMENT_AMOUNT_INVALID`); two parallel requests for one order and type are serialized in-process per tenant+order+type, so the second gets the first's row; across several backend processes the unique row index still keeps one row but a loser may burn a number) and again inside the transaction, where the buyer is
also compared by `buyerFingerprint` and the seller columns by value. A FAILED retry with new `details` and a replacement both take the buyer from the frozen document.
A retry of a FAILED document keeps the issue date of the first attempt (`runGeneration` puts the frozen `issueDate` into `carryOver` next to the buyer, also when the retry carries explicit config or details; the number stays too, so the year in the number and the printed date never part); a replacement keeps the issue date and the resolved
details and rebuilds the seller, configuration and heading. A voided invoice, act or quotation can be issued again for the same
order under a new number (return notes are not reissued: they repeat freely and a void only gives their quantities back; the void row is history and no longer counts for the per-type unique index, whose predicate is `document_type <> 'return_note' AND (status <> 'void' OR document_type NOT IN ('invoice','act','quote'))`, widened to include `quote` by migration `ReissueVoidedQuotes1793200000000`);
a voided sales receipt or packing list is not reissued, as for a waybill. A cross-process race on the
slot ends in a `23505` that is answered with the winner's pending row, or `DOCUMENT_ALREADY_EXISTS`.

The "Дата" line a typed document prints is `snapshot.document.issueDate` (formatted as a calendar date), not the
order's date. Rendering uses the `document-blocks` partials (parties, payment, totals, closing with signatures)
in the four styles listed under *Invoice and act layout*; every other style is `400 DOCUMENT_TEMPLATE_UNSUPPORTED`.
On such documents corporate omits its own empty "Note:" line but prints the user's footer title and subtitle when they are set (the waybill's footer block is unchanged).

**Per-document options of the typed layout.**
- *"Original" mark.* Corporate is the only style that prints it (`translations.original`, top right of the heading strip). `layout.originalMark` (document-types.ts) is true for invoice, act and packing list and false for sales receipt, quotation and return note, whose `DocumentView.hidesOriginalMark` makes corporate leave the mark out; the waybill (no `document`) keeps it. No other style prints such a mark.
- *Act completion sentence.* `details.completionText` (act only, optional, trimmed, 1..`ACT_COMPLETION_TEXT_MAX_LENGTH` = 300, `document-schemas.ts`) replaces the printed "Роботи виконано в повному обсязі…" line. Without it the language default (`labels.actStatement`) is printed and nothing is frozen. A given text is frozen into `active_snapshot.document.details.completionText`; a replacement carries `details` over unchanged (`carryOver.details`), so the text survives; a frozen FAILED candidate retry (`{}`) reuses the frozen html.
- *Visibility switches.* Typed documents honour the same per-contact switches as the waybill (`config.visibility`): `companyAddress` and `companyTaxId` hide the seller's address and tax code (`DocumentView.seller.address` / `.code`), and `recipientAddress` hides the delivery address on the packing list (its consignee address). The invoice and the act always print the seller's address and tax code (`layout.mandatorySellerRequisites`) because the document is meaningless without them. The switches apply to the document PDF, which is what the public link serves; the public JSON keeps its own rules.

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
It does not decode refresh tokens as JWTs.

Storage (`refresh_tokens`, helpers in `users/refresh-tokens.ts`): only `token_hash` (hex SHA-256 of
the 512-bit token, unique) is written; `token` holds plaintext only on rows from before migration
`1792400000000-HashRefreshTokens` (or written by a rolled-back image), and lookups fall back to it
only where `token_hash IS NULL`. Those rows expire within 30 days. Each login/register starts a
`family_id`; successors inherit it. `redeemed_at` (timestamptz) is set only when a rotation redeems
a token — never by logout, a password change or a family revocation.

Rotation, in one transaction:
1. Find the presented token (no lock); unknown → 401.
2. Lock its owner `FOR NO KEY UPDATE`; missing or `isActive = false` → 401, the token stays
   unredeemed. This serializes every rotation and password change of one user (FK checks of inserts
   that reference the user take `FOR KEY SHARE` and are not blocked), so a family or password
   revocation never misses a successor that a concurrent rotation is still committing.
3. Conditional `UPDATE … SET revoked = true, redeemed_at = now WHERE id AND revoked = false AND
   expires_at > now RETURNING id`; on a match insert the successor (same family) and return it.
   Concurrent refreshes with one token serialize on the user lock: the first commits, the rest
   re-check and match nothing. A failed successor insert rolls the redemption back, so the token
   still works.
4. No match: re-read the token. Not redeemed (expired, logged out, revoked by a password change or a
   family revocation, or revoked before `redeemed_at` existed) → plain 401, untouched. Redeemed within
   `REPLAY_GRACE_MS` (30 s) → plain 401 — the losing tab of a multi-tab race adopts the winner's
   session (`frontend/src/lib/auth-session.ts`). Redeemed earlier → a replay: every live token of the
   family is revoked and a warning is logged (count, user and family ids, never the token). The
   transaction returns an outcome and the 401 is thrown only after it commits, so the family
   revocation persists.

Password change: `UPDATE users` and revoking every live token run in one transaction, users row
first. A rotation in flight holds that row `FOR NO KEY UPDATE`, so the password change waits for it
and its revocation (a later statement) sees and revokes the successor; a rotation that starts later
finds its token revoked. Logout revokes by hash (plaintext for pre-hashing rows) and leaves
`redeemed_at` alone.

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

Controller-level override (`ThrottlerGuard` is applied per route, not globally):

```typescript
@Throttle({ default: { ttl: 60000, limit: 5 } })  // login/register: 5 attempts per 60s
@Throttle({ default: { ttl: 60000, limit: 20 } }) // /auth/refresh: 20 per 60s
```

Limits are per `req.ip`. `main.ts` calls `trustReverseProxy(app)` (`config/trusted-proxy.ts`,
`trust proxy` = 1 hop): production traffic reaches the API only through the frontend nginx, so
`req.ip` is the address nginx appended to `X-Forwarded-For`. Without it every client shared one
bucket (nginx's address).

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

- One email per recipient within an account, case-insensitive: create, update and the
  `Idempotency-Key` path check it first (409 `RECIPIENT_ALREADY_EXISTS`), and the partial unique index
  `IDX_recipients_user_email_unique` on `(user_id, lower(email)) WHERE email IS NOT NULL AND email <> ''`
  (migration `RecipientEmailUnique1793800000000`) is the rule a race cannot slip past; its 23505 maps to
  the same 409. The migration first nulled the email of all but the newest of each duplicate group
- With an `Idempotency-Key`: same replay rules as products, in one transaction with the key lock; the
  email check runs after the key lookup, so a replay of a create that stored an email returns the
  stored response instead of a 409 for its own recipient

**Update (`update()`):** `null` clears `email`, `phone` or `address`. `name` is NOT NULL, so
`name: null` is refused with 400 `VALIDATION_ERROR` before the recipient is read — the same rule
(`common/utils/null-fields.util.ts`) products apply to every field except `supplier_id`

**Deletion (`remove()`):** a recipient row is really deleted, so it is refused with 409
`RECIPIENT_HAS_ORDERS` while any order references it, live or soft-deleted. `orders.recipient_id` is
`ON DELETE CASCADE`: deleting past a soft-deleted order would purge kept history, and
`receipts.order_id` has no cascade, so an order with a receipt would fail on its foreign key. Users
cannot restore or purge a soft-deleted order, so such a recipient stays in their list permanently

---

### 7. Settings & Customization

`user_settings` stores versioned complete `document_config`, a revision and a tenant-owned immutable logo pointer. Old individual field/logo endpoints adapt to this same persistence boundary. Explicit custom-title provenance is retained, including literal `Invoice` and surrounding nonblank whitespace. New V1 custom titles must contain non-whitespace text; automatic title mode resolves Delivery/Proforma by document language. The legacy title endpoint still maps blank/whitespace to automatic. Reads and preview do not create default settings rows.

Named tenant presets are independent copies (maximum 20, trimmed 1–80 character names, optimistic revisions). Explicit preset selection/use does not save account defaults. Per-document configuration is accepted from the Orders customization editor, with no account change. Unsupported template values remain in configurations but are excluded from rendering.

Money/date preferences control presentation only: bounded number/date locales, currency display, date/time style, hour cycle and valid IANA timezone. Integer cents and order currency are unchanged. Legacy defaults retain ru-RU money formatting, document-language numeric dates with four-digit years and seconds, visible contacts, automatic logo sizing and the fixed default timezone `Europe/Kyiv` (`DEFAULT_DOCUMENT_TIME_ZONE`, not the server's own zone) for future documents of accounts without saved formatting; documents already issued keep their frozen dates. Numeric dates match the old TemplateService `toLocaleString(locale)` presentation in that timezone; en defaults h12, ru/uk h23. Short/medium/long date styles remain explicit choices. Configuration and timezone freeze with the candidate; existing stored choices and frozen HTML are unchanged.

Logo Save normalizes a compact PNG, uploads an immutable tenant asset before the settings transaction, then switches config/pointer in one DB commit. Upload or DB failure leaves the prior account configuration and logo valid. Removal detaches references; reference-aware leased cleanup runs through scheduled bounded tenant sweeps after a 24-hour grace. PDF uploads have durable intent, guarded attachment and transactional retirement; replacement failure preserves the active PDF. Cleanup retries storage failures and never deletes a referenced active/pending logo or active PDF. Preview normalization stays entirely in memory. Logo bytes are embedded once in frozen HTML and never repeated as base64 in configuration JSON.

Public metadata uses the active frozen visible projection. Internal snapshots/configs and pending asset references do not enter ordinary receipt/order/share JSON. Legacy PDFs with no frozen metadata remain downloadable with metadata explicitly unavailable.

---

### Signature and stamp

An account can store one **signature** and one **stamp** image (`/settings/signoff`, see [api-reference.md](./api-reference.md)). They are printed on documents of styles whose capabilities say `signoff: true` (`standard`, `classic`, `minimal`, `corporate`); every other style ignores them.

**Where they are printed.**
- *Typed documents* (`documentClosing` in `templates/document-blocks.ts`): the signature image replaces the empty signing line of the **seller** block (a taller line, `.doc-sign-line-image`; without an image the old `<div class="doc-sign-line"></div>` is emitted unchanged). The stamp is an absolutely positioned `.doc-stamp` inside the seller block, only when the type's layout carries a stamp (`layout.signatures.stamp`: invoice, act, quotation); a sales receipt, packing list or return note prints the signature only. The buyer's line is never touched.
- *Waybill*: a `.signoff` block with the signature and the stamp side by side and their captions, right before the footer (`SIGNOFF_PARTIALS`: `waybillSignoffStyles`, `waybillSignoff`, in the four styles only). The block is `break-inside: avoid` and `break-after: avoid`, so it stays with the footer.

**Storage and normalization.** The image goes through `common/services/signoff-image.ts::normalizeSignoffImage` (not the logo normalizer: no GIF, no SVG): size 1 byte to 2 MiB; the first bytes must be PNG or JPEG **and** match the declared MIME type; animated PNG (an `acTL` chunk) is refused; sharp decodes with a pixel limit, `failOn: "warning"`, one page; sides 32 to 4096 px; EXIF orientation is applied and all metadata is dropped; the result is a PNG fitted in 800 x 300 (signature) or 600 x 600 (stamp), without enlarging, at most 256 KiB (one halving, then refusal). Every refusal is the same `400 VALIDATION_ERROR` naming the kind. The PNG is stored in the private logos bucket under `signoffs/{userId}/{assetId}.png` as a `document_assets` row with `kind = 'signature' | 'stamp'`, and `user_settings.signature_asset_id` / `stamp_asset_id` point at it.

**Freeze.** Like the logo, the images are embedded in the frozen HTML as data URIs, built on the server only. `RenderSnapshot.signoff` records `{ signatureAssetId, stampAssetId, signatureSha256?, stampSha256? }` and never the bytes; the key exists only when the style prints images and at least one is set, so the snapshot of a document without images is unchanged. Repair, retry and "reproduce" re-render only the stored HTML, so replacing or removing the account's images never changes an issued document; "replace" rebuilds the document with the images current at that moment. An image that cannot be read when a document is prepared (its object is missing or fails its checksum, or the asset is no longer `ready`) is skipped with a warning log (user, asset, kind) and the document is generated without it (a storage failure, as opposed to a missing or corrupt asset, is retried twice first, after 150 ms and 450 ms, `SIGNOFF_READ_RETRY_DELAYS_MS`, so a blip does not strip the images), so a damaged asset never blocks issuing; the snapshot then records `null` for that kind, and the response of the issuing call carries `warnings: [{ code: "SIGNOFF_UNAVAILABLE", kinds, message }]` (`DocumentSignoffService.load` returns `unavailable`, `ReceiptSnapshotService.prepare` passes it as `signoffUnavailable`, `ReceiptsService` attaches it to the returned row, `issuedDocument()` puts it on the wire; transient, never stored, absent when empty; a call that only returns an existing document, such as the duplicate-return answer or an already running generation, attaches none). `validatePrepared` compares the pointers as read at preparation time (usable or not), not the embedded ids, so a skipped image cannot cause a 409 loop. `ReceiptSnapshotService.validatePrepared` re-reads the pointers under the settings lock: an image removed or replaced while a document was being prepared gives `409 "Defaults changed. Refresh and generate again."`, the drawn number is handed back, and nothing is issued with the stale image.

**Deleting.** `DELETE` (and a replacement) only detaches the image and gives the old asset a 10-minute lease (`SIGNOFF_RELEASE_GRACE_MS`; a logo keeps 24 hours) and schedules the tenant's storage sweep for then; `DocumentAssetsService.collectExpired` deletes the object after the grace period if nothing references it. The collector's reference check includes `signature_asset_id` and `stamp_asset_id` (without that an active signature would be deleted a day after upload); a test with an expired lease pins this. A document never references the asset (it embeds a copy), so issued documents are unaffected.

**Privacy.** The images are never part of the public projection (`GET /public/receipts/:token` returns data without images), never of any list or settings response, and are served only to their owner (`GET /settings/signoff/:kind/image`, `private, no-store`, bearer token). The PDF reached by a public share link does contain the images the document was issued with: anyone holding the link can see them, as with the logo and the printed company data. Row-level security covers `document_assets`; a trigger (`document_settings_signoff_owner`) rejects a pointer to another account's asset or to an asset of the wrong kind, and the logo owner trigger now also requires `kind = 'logo'`.

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

Naming: the code and API call the profit metrics "revenue" (`SUM((unit_price - purchase_price) * qty)`), while "turnover" is the sales amount. The UI labels (en/ru/uk) say Profit / Прибыль / Прибуток for the revenue metrics and Turnover for sales; the translation keys keep the `revenue` names.

- Total Revenue (profit; all-time, selected period). A selected period is a range of UTC days with both ends
  included (`DateRangeDto`), the same days `daily-revenue` groups by
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
   - Every order gets `order_number`, a per-account counter (1, 2, 3, ...) that people quote instead of the UUID. It is taken inside the creating transaction (`orders/order-number.ts`, under a per-account advisory lock) and counts soft-deleted orders, so a number is never reused. The unique index `(user_id, order_number)` backs it, and a `BEFORE INSERT` trigger numbers any row inserted without one (seed scripts, manual SQL) under the same lock. Existing orders were numbered in creation order by migration `AddOrderNumber1792600000000`
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
   - Same `Idempotency-Key` within 24 hours returns same response (orders, products, recipients, suppliers); for all but orders a different body under the same key is refused with 422 `IDEMPOTENCY_KEY_REUSED`
   - Prevents duplicate orders, products and recipients if the client retries, also concurrently
   - Keys are per user and per kind: an order, a product and a recipient key of the same value are
     independent

7. **Soft Deletes:**
   - Orders are deleted via the `deleted_at` timestamp; cancellation is a separate status change
     that keeps the order and its stock reservation
   - Queries exclude soft-deleted records unless explicitly included
   - A soft-deleted order still blocks deleting its recipient (`RECIPIENT_HAS_ORDERS`)
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

Blank/null/whitespace stored receipt titles use the selected document language and template: the default is «Видаткова накладна» / «Расходная накладная» / "Delivery note", and Delivery/Proforma retain their specialized localized names («Накладна на відвантаження» / «Отгрузочная накладная» / "Shipping note"; «Проформа-інвойс»). A nonblank stored title, including the literal `Invoice` or «Інвойс» (the old default), remains custom. The UI receives explicit `hasCustomReceiptTitle` provenance; it shares the document-language query with the gallery rather than using the interface language for document previews.

Branded alone uses the configured accent (`#3B82F6` when unset); Proforma alone displays payment/delivery terms. All nine company fields survive partial company updates. Logo replacement validates and normalizes PNG/JPEG/GIF/static SVG to PNG before overwriting the existing fixed key; a failed upload does not pre-delete the previous logo. Footer title/subtitle save together atomically.

The ten-generated-documents-per-type limit is rechecked under the tenant lock at each successful initial promotion, including multiple already queued candidates. Only eligible oldest generated documents of the promoted document's type are evicted; processing/failed receipts and other tenants are preserved. Eviction first chooses oldest rows, locks the orders of evicted locking documents in id order, then locks/refetches the receipt IDs in stable order before retiring any PDF/logo lease and deleting tenant-scoped pointers and recounting `orders.is_locked` of those orders. Repair and promotion acquire their current receipt row before PDF lease locks. Order-file deletion explicitly requires the tenant and takes tenant → order → receipt-batch → lease locks, with no tenant lock added after an order lock. Replacements do not consume another slot. Outbox terminal reconciliation cannot overwrite a promoted or changed candidate. Late uploads retain durable cleanup intent until settlement, while only live unexpired uploading leases consume the 25 concurrent-upload slots, with per-object backoff and independent PDF/logo sweeps; there is no eager deletion after ambiguous commits. Automatic logos retain each original template cap and spacing, including Corporate 80 px with 10 px bottom margin.
