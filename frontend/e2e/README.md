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
afterwards. Exit code is non-zero when any check fails. Dev servers must run in tmux under the
workspace policy; start one on port 5231 before invoking this harness:

```bash
tmux new-session -d -s market-e2e 'cd frontend && VITE_WS_URL=http://127.0.0.1:4599 ../node_modules/.bin/vite --host 127.0.0.1 --port 5231 --strictPort'
E2E_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node frontend/e2e/run.mjs order-audit
node frontend/e2e/run.mjs infra-audit
node frontend/e2e/run.mjs proxy-audit
```

`E2E_CHROME_PATH` is optional; by default the harness uses Playwright's installed
browser. `proxy-audit` requires a local `nginx` and `openssl` (override the binary
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

(The two unit specs import TypeScript modules through the dev server's transform,
so they only run against `vite dev`.)

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
`SETTINGS_EVIDENCE` changes its generated bundle/output directory. Optional `SETTINGS_BASELINE`
points at a directory mirroring baseline source paths, allowing the same browser assertions to
prove the original failures without changing the working tree. The Nest HTTP and real image
format checks run separately with `cd backend && yarn test --runInBand settings logo-storage`.

The 22 browser scenarios include delayed logo upload/delete conflicts, confirmed template and
automatic en/ru/uk titles after a successful POST followed by a failed GET, custom title
provenance, and title draft recovery through failed GET/Retry. Logo delays use Playwright route
promises and synthetic responses. Chromium sandbox stays enabled. `E2E_CHROME_PATH` selects the
local Chrome executable; `SETTINGS_REPORT` and `SETTINGS_SCREENSHOTS` select evidence paths.
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

From the repository root, build CSS with `cd frontend && yarn build`. Start in a uniquely
named tmux session, from `backend/`:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
TEMPLATE_FIXTURE_PORT=4327 TEMPLATE_EVIDENCE=temp/template-features-20261015-225300 \
./node_modules/.bin/ts-node --transpile-only test/serve-template-features.ts
```

Run `node frontend/e2e/template-features.cjs` from the repository root against a fresh fixture.
`TEMPLATE_FIXTURE_URL`, `TEMPLATE_EVIDENCE` and `E2E_CHROME_PATH` can override defaults.
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
on port 55447 and `TEMPLATE_PG_PORT=55447` (optional `TEMPLATE_PG_USER`). They create and
clean only a uniquely named synthetic database/runtime role. They are skipped unless that
opt-in is present. Synthetic tests are not
DB/S3 integration certification. Do not run real migrations for this workflow.
