# Sortable and non-sortable DataTable column headers share one casing

Written against: 310dfdf05893 (branch main)

## Evidence chain

- Surface: `frontend/src/components/ui/DataTable.tsx` (desktop `<thead>`), rendered on routes `/orders`, `/products`, `/recipients`, `/suppliers`.
- Problem: In a single table header row, sortable column headers render in their source case while non-sortable headers render UPPERCASE. Rendered proof on `/recipients`: `Контакт` and `Телефон` (sortable) appear title-case, while `ЗАМОВЛЕННЯ` and `ЗАГАЛЬНА СУМА` (non-sortable) appear uppercase. On `/orders` every column is sortable, so no header is uppercased at all — inconsistent with the sibling tables.
- Design evidence: The header cell defines a single intended presentation — `className="px-6 py-3.5 text-left text-xs font-medium text-content-tertiary uppercase tracking-wider"` (`DataTable.tsx:269`). The mobile card label repeats the same rule with `uppercase tracking-wider` (`DataTable.tsx:404`). So "column headers are uppercase" is the component's own presentation decision.
- Root cause: Sortable headers wrap the label in a `<button>` (`DataTable.tsx:271-278`). The project loads Tailwind v4 Preflight (`@import "tailwindcss";`, `frontend/src/index.css:1`), whose base reset applies `button, select { text-transform: none; }`. That reset cancels the `text-transform: uppercase` the `<button>` would otherwise inherit from the `<th>`, so only non-sortable headers (rendered in a `<span>`, `DataTable.tsx:280`) stay uppercase. No stylesheet re-applies uppercase to buttons (only unrelated `text-transform: uppercase` at `index.css:622`, scoped elsewhere).
- Owner: `frontend/src/components/ui/DataTable.tsx`.
- Scope and affected surfaces: every `DataTable` consumer — `frontend/src/pages/OrdersPage.tsx`, `ProductsPage.tsx`, `RecipientsPage.tsx`, `SuppliersPage.tsx`. Desktop `<thead>` only; the mobile card path (`DataTable.tsx:399-412`) already uses a `<span>` and is unaffected.
- Uncertainty: None. `letter-spacing` (`tracking-wider`) is not reset by Preflight and already renders correctly on sortable headers, so only `text-transform` must be restored.

## Design decision

Re-apply the header's uppercase treatment on the sortable-header `<button>` so that sortable and non-sortable column headers in the same row (and across sibling tables) share one casing. This resolves the root cause directly at the single shared owner rather than per page, and reuses the exact utility (`uppercase`) already declared on the `<th>` and the mobile label — no new token, no identity change.

## Reuse

- `uppercase` Tailwind utility — already used at `DataTable.tsx:269` (the `<th>`) and `DataTable.tsx:404` (mobile label).
- Exemplar: `frontend/src/components/ui/DataTable.tsx:269`.

No new primitive required.

## Changes

1. `frontend/src/components/ui/DataTable.tsx` (sortable-header button, currently at lines 271-278)
   - Change: Add the `uppercase` utility to the sortable header `<button>`'s `className`. The current value is `"flex items-center gap-1 hover:text-content-secondary transition-colors duration-150"`; it becomes `"flex items-center gap-1 uppercase hover:text-content-secondary transition-colors duration-150"`. (Equivalently, add `uppercase` to the inner `<span>{col.header}</span>` at line 276 — pick the button so the whole control is covered.)
   - Preserve: the sort `<button>`'s click handler, the `renderSortIcon` output, hover color (`hover:text-content-secondary`), gap, and the inherited `tracking-wider` letter-spacing. Do not touch the non-sortable `<span>` branch or the mobile card path.
   - Verify: On `/orders` (all columns sortable) and `/recipients` (mixed), every desktop column header renders UPPERCASE, matching the non-sortable headers; the sort chevron/arrow still appears and sorting still works.

## Scope

- Inherit: `OrdersPage`, `ProductsPage`, `RecipientsPage`, `SuppliersPage` (all render through `DataTable`).
- Verify: any other current or future `DataTable` consumer — confirm no header intentionally relies on non-uppercase display (none found at this commit).
- Exclude: the mobile card label (already uppercase), column-visibility behavior, sort behavior, and all non-header cells.

## Validation

- Product: Open `/recipients` and `/orders` as an authenticated user; the column header row reads consistently in one casing across sortable and non-sortable columns.
- Interface: Check desktop viewport (≥1024px, where the `<table>` shows — `hidden lg:block`, `DataTable.tsx:246`) on `/orders`, `/products`, `/recipients`, `/suppliers`; verify long localized headers (uk/ru/en) still fit and the sort affordance is unchanged.
- System: Confirm the fix lives only in `DataTable.tsx` and no page re-implements a header style — all four pages import `DataTable` from `../components/ui/DataTable`.
- Repository: `grep -n "flex items-center gap-1" frontend/src/components/ui/DataTable.tsx` → the sortable-header button className now contains `uppercase`.

## Stop conditions

- Stop if a `DataTable` consumer is found that intentionally requires non-uppercase headers (would make a component-level uppercase wrong — handle per-column instead).
- Stop if the header casing is later intended to change globally (e.g. a move away from all-caps headers) — then remove `uppercase` from the `<th>` too, rather than adding it to the button.

## Design documentation

- After acceptance and validation: none required (no `DESIGN.md` exists). Optionally note in `DataTable.tsx` that sortable headers must carry `uppercase` because Preflight resets `button { text-transform: none }`.
