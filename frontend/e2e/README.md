# Frontend regression suite

Browser-level regression tests for the two behaviours that were broken hard enough
to be worth locking down. They drive the **real** app through its real routes —
only the HTTP API and the receipt WebSocket are mocked, so the components, hooks
and services under test are the production ones.

```bash
node frontend/e2e/run.mjs            # everything
node frontend/e2e/run.mjs receipt    # only specs whose name matches
yarn --cwd frontend e2e              # same thing via the package script
```

`run.mjs` starts its own Vite dev server (with `VITE_WS_URL` pointed at the mock
socket) unless one is already listening on `E2E_BASE_URL`, and stops it again
afterwards. Exit code is non-zero when any check fails.

To run against a production bundle instead:

```bash
cd frontend
VITE_WS_URL=http://127.0.0.1:4599 npx vite build --outDir /tmp/rm-preview-dist --emptyOutDir
npx vite preview --outDir /tmp/rm-preview-dist --port 5232 --strictPort --host 127.0.0.1
E2E_BASE_URL=http://127.0.0.1:5232 node e2e/run.mjs mobile-product-dropdown
E2E_BASE_URL=http://127.0.0.1:5232 node e2e/run.mjs receipt-progress
```

(The two unit specs import TypeScript modules through the dev server's transform,
so they only run against `vite dev`.)

## Specs

| Spec | Guards |
|---|---|
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
