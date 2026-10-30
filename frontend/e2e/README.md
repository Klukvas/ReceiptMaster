# Frontend regression suite

Browser-level regressions for order editing/selection and receipt progress, plus
production configuration and local proxy checks. They drive the **real** app through its real routes —
only the HTTP API and the receipt WebSocket are mocked, so the components, hooks
and services under test are the production ones.

```bash
node frontend/e2e/run.mjs            # everything
node frontend/e2e/run.mjs receipt    # only specs whose name matches
yarn --cwd frontend e2e              # same thing via the package script
```

`run.mjs` starts its own Vite dev server (with `VITE_WS_URL` pointed at the mock
socket) unless one is already listening on `E2E_BASE_URL`, and stops it again
afterwards. Exit code is non-zero when any check fails, when the name filter matches no spec,
or when a selected spec records no checks, so an empty run never reads as a pass. CI runs the
whole suite as the `browser-regression` job. Dev servers must run in tmux under the
workspace policy; start one on port 5231 before invoking this harness:

```bash
tmux new-session -d -s market-e2e 'cd frontend && VITE_WS_URL=http://127.0.0.1:4599 ../node_modules/.bin/vite --host 127.0.0.1 --port 5231 --strictPort'
E2E_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node frontend/e2e/run.mjs order-audit
node frontend/e2e/run.mjs infra-audit
node frontend/e2e/run.mjs proxy-audit
```

`E2E_CHROME_PATH` is optional; by default the harness uses Playwright's bundled
Chromium (`npx playwright install chromium` once). `proxy-audit` requires a local `nginx` and `openssl` (override the binary
with `E2E_NGINX_BINARY`), validates the actual proxy configuration, then sends
synthetic signed webhook bytes and receipt events through polling and WebSocket.
All generated proxy certificates/logs live under `frontend/e2e/.cache` and its
per-run directory is removed afterwards. No production API or account is used.

To run against a production bundle instead:

```bash
cd frontend
VITE_WS_URL=http://127.0.0.1:4599 npx vite build --outDir e2e/.cache/preview-dist --emptyOutDir
npx vite preview --outDir e2e/.cache/preview-dist --port 5232 --strictPort --host 127.0.0.1
E2E_BASE_URL=http://127.0.0.1:5232 node e2e/run.mjs mobile-product-dropdown
E2E_BASE_URL=http://127.0.0.1:5232 node e2e/run.mjs receipt-progress
```

(The two unit specs, and the guard checks at the end of `chunk-recovery`, import
TypeScript modules through the dev server's transform, so they only run against
`vite dev`.)

## Specs

| Spec | Guards |
|---|---|
| `order-audit` | Hidden selections after search/date/amount filters, sorting and loading; bounded catalogue search/pagination past record 100; selected edit-ID hydration; zero/empty custom prices; currency labels and mixed-currency rejection; visible edit errors without losing values |
| `infra-audit` | Trusted publication guards, matching immutable image tags, Paddle build/runtime references, and proxy locations |
| `proxy-audit` | Native Nginx syntax, webhook byte/header preservation, and receipt events over both transport modes |
| `dropdown-position` | `computeDropdownPosition` clamps, caps and flips the product selector popup so it always fits the visible viewport |
| `mobile-product-dropdown` | At 320px and 375px — and with the on-screen keyboard shrinking the viewport — opening the product selector causes no horizontal overflow and leaves every option reachable and selectable |
| `receipt-socket-url` | The receipt socket follows `VITE_API_URL` / the page origin instead of a hard-coded `localhost` |
| `receipt-progress` | The generating chip and progress card leave the loading state when the receipt finishes — including when no socket event is delivered — without clearing an order that is still generating, and without a finished attempt's timers or lookup tally taking down the card a retry puts back under the same receipt id |
| `auth-multitab` | Two pages of one browser context (shared `localStorage`) against a stateful refresh mock: a late losing refresh adopts the winner's tokens instead of clearing them (no redirect, request retried with the new token); an early loser (its 401 answered 800 ms before the winner's 201, longer than the old fixed 300 ms re-read) adopts the winner's pair, also when the winner keeps the access token and rotates only the refresh token; a genuine rejection with unchanged storage clears it and redirects; a network error or a 5xx on `/auth/refresh` keeps storage and does not redirect; a tab whose old token fails after another tab refreshed retries with the stored token without calling `/auth/refresh`. The session is seeded once by a guarded init script — `installApiMocks` is not used because it re-seeds on every navigation |
| `product-form-conflict` | A rename sends only `{ name }`; a stale quantity edit sends `expectedQuantity`, and on 409 the form stays open with the typed values, shows the server's stock and resends against it |
| `chunk-recovery` | A lazy-route chunk gone after a deploy (a 404, the SPA's `index.html` or a dropped connection) reloads the tab once and renders the route; a chunk that stays missing stops after that one reload on a friendly fallback whose button recovers; a render crash shows the fallback without reloading; blocked `sessionStorage` falls back instead of risking a loop; every browser's failure wording is recognised and the guard allows one reload per window |
| `profit-lifecycle` | Unknown profit reads "—" with "Cost unknown" (never 0) on the KPI and recipient list; hovering an unknown bar or day shows "—" (the bar also says why); a chart whose every row is unknown shows a message instead of an empty plot; a period preset ends on the current UTC date; partial profit keeps its amount with a "Partial" badge naming excluded lines and turnover; the CSV download (`page.waitForEvent('download')`) leaves unknown profit empty and adds the completeness columns; the sparkline flags partial days, draws an unknown day as a gap and reads "Cost unknown" (not "Partial") when no charted line has a cost; cancelling a confirmed order warns (receipt voided, link revoked, stock not returned) while a draft does not, and the order list, receipts and every dashboard figure are refetched after the cancel |
| `onboarding` | Against a stateful mock that replays a known `Idempotency-Key`: Back→Next without changes sends nothing and a rename sends one PATCH `{ name }` (never a second POST); two clicks in one task send one create; Escape, Skip and Close do nothing while a save is in flight; a 500 keeps the step and every value with a friendly message (no database text) and the next attempt sends the corrected form; a dropped response is reported as unconfirmed and Retry resends the same body with the same key, then PATCHes edits; a stock change on revisit (409) keeps the typed quantity, names the server's stock and saving again sends the new `expectedQuantity`; a failed completion keeps the wizard open and Retry finishes without re-creating; a failed Skip closes with a "will be offered again" toast; the Finish copy promises no PDF/receipt in en/ru/uk |
| `locale-parity` | Node only: en, ru and uk have identical flattened key sets and the same `{{placeholders}}` and value types per key; the landing template count equals `TEMPLATE_METADATA` (evaluated from `backend/src/modules/receipts/templates/metadata.ts`) |

`receipt-progress` waits out the panel's real 8s/20s deadlines, so it takes a
couple of minutes; the other specs are quick.

## Why no test runner

The repo has no frontend test framework, and adding one would mean a dependency
and lockfile change. Both packages the suite needs are already installed:
`playwright` is a root dev dependency, and `socket.io` is a `backend/`
dependency that Yarn workspaces hoists to the root `node_modules`. So the specs
are plain modules that report through `support/runner.mjs`. If a runner is ever
added, the assertions port over as-is.

## Layout

- `support/harness.mjs` — browser, API mocks, mock receipts gateway
- `support/fixtures.mjs` — deterministic API payloads
- `support/runner.mjs` — pass/fail collector and polling helpers

## Receipt settings regressions

This isolated fixture renders the real SettingsPage, Axios and React Query against synthetic
HTTP data. It never calls real databases, object storage, billing or printers. In one terminal:

```bash
tmux new-session -d -s settings-regression 'cd /Users/andreypavlenko/Desktop/Projects/b2c/market && SETTINGS_PORT=4318 node backend/test/serve-settings-regressions.cjs'
SETTINGS_ORIGIN=http://127.0.0.1:4318 node frontend/e2e/settings-regressions.cjs
```

The fixture uses the existing `frontend/dist/assets/*.css`; run the frontend build first.
`SETTINGS_EVIDENCE` changes its generated bundle/output directory (default
`<os.tmpdir()>/receiptmaster-settings-regressions`). Optional `SETTINGS_BASELINE`
points at a directory mirroring baseline source paths, allowing the same browser assertions to
prove the original failures without changing the working tree. The Nest HTTP and real image
format checks run separately with `cd backend && yarn test --runInBand settings logo-storage`.

The 22 browser scenarios include delayed logo upload/delete conflicts, confirmed template and
automatic en/ru/uk titles after a successful POST followed by a failed GET, custom title
provenance, and title draft recovery through failed GET/Retry. Logo delays use Playwright route
promises and synthetic responses. The browser is Playwright's bundled Chromium unless
`E2E_CHROME_PATH` names another executable; `SETTINGS_REPORT` and `SETTINGS_SCREENSHOTS` select
evidence paths. This suite encodes the superseded individual-save contract and is not run in CI:
against the current unified-save SettingsPage it fails (0/22 on 2026-10-29).
The fixture bundles source at startup: rebuild/restart only the current fixture after edits and
after any active browser run finishes; preserve a baseline fixture needed for review.

### Unified document features (2026-10-15)

`template-features.cjs` tests current unified Save/Discard, staged logos, real PDF previews,
capabilities, presets, revision conflicts, mobile layout and the Orders customization editor.
The fixture runs actual Nest controllers/services, React, Axios, Query and Chrome rendering;
its database, outbox publication and object storage are explicit synthetic doubles. It never
connects to real application services. The older `settings-regressions.cjs` and its fixture
retain the earlier individual-save contract and historical evidence; use the new suite for
current SettingsPage behavior.

CI runs it as the `browser-documents` job. From the repository root, build CSS with
`cd frontend && yarn build`. Start the fixture in a uniquely named tmux session, from `backend/`:

```sh
TEMPLATE_EVIDENCE=/tmp/template-features yarn ts-node --transpile-only test/serve-template-features.ts
```

Run `TEMPLATE_EVIDENCE=/tmp/template-features node frontend/e2e/template-features.cjs` from the
repository root against a fresh fixture; it exits non-zero on the first failed check.
Both sides default `TEMPLATE_EVIDENCE` to `<os.tmpdir()>/receiptmaster-template-features`, never
the repository. `TEMPLATE_FIXTURE_PORT`, `TEMPLATE_FIXTURE_URL` and `E2E_CHROME_PATH` (suite) or
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (fixture renderer) override the port and browsers; by default
both use Playwright's bundled Chromium with its sandbox disabled, like the production renderer —
the browser only loads the local synthetic fixture.
The fixture serves `http://127.0.0.1:4327`, `/fixture/state`, synthetic failure controls at
`POST /fixture/control`, and explicit synthetic worker execution at `POST /fixture/run-jobs`.
Its manifest records the served JavaScript hash and source entrypoints. Keep the fixture
running for independent review; do not use these controls against a real API.

Backend feature checks: from `backend/`, run
`yarn jest --config test/jest-e2e.json --runInBand --testPathPattern template-features.e2e-spec.ts`.
PDF evidence: `test/verify-template-features-pdfs.ts` renders the current 53-scenario matrix;
`test/verify-template-features-pdfs.py` inspects its manifest/PDFs using pdfplumber/pypdf.
Restricted-role PostgreSQL migration/concurrency tests are implemented in
`backend/test/template-features-sql.e2e-spec.ts`. They require an explicitly isolated server
on `127.0.0.1:55447`, `TEMPLATE_PG_PORT=55447` and `ISOLATED_PG_USER` (alias `TEMPLATE_PG_USER`,
optional `ISOLATED_PG_PASSWORD`) plus a `receiptmaster_isolated_pg_sentinel` database marking
that cluster as disposable; see *Tests* in `docs/context/backend-patterns.md`. The cluster must be
PostgreSQL 13 or newer: teardown drops each suite database with `DROP DATABASE … WITH (FORCE)`. They create and
clean only a uniquely named synthetic database/runtime role, refuse a cluster without the
sentinel or with `market_db`, and are skipped without the opt-in unless `REQUIRE_PG_SUITES=1`
(CI), which turns the skip into a failure. Synthetic tests are not
DB/S3 integration certification. Do not run real migrations for this workflow.
