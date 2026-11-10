# ReceiptMaster — Agent Context

**Last Updated:** 2026-11-10

Start here. This folder is the engineering context set for **AI coding agents** working on
ReceiptMaster. Read the one or two documents relevant to your task (routing table below) — you
should not need to read all four to be productive.

> These are *how the code works* docs. For product/marketing framing see the root
> [`README.md`](../../README.md), [`PROJECT.md`](../../PROJECT.md), and
> [`docs/PRODUCT_DOCUMENTATION.md`](../PRODUCT_DOCUMENTATION.md).

---

## 30-second overview

ReceiptMaster is a **multi-tenant SaaS** for order management, invoice/receipt PDF generation,
and business analytics. Users create orders for recipients, generate branded receipt PDFs
(async), and have plan limits (Free / Pro / Business). Paddle payments are explicitly disabled
by default; existing entitlements and quotas still apply.

| Layer | Stack |
|---|---|
| **Frontend** | React 19 + TypeScript, Vite, Tailwind CSS v4, React Router 7, TanStack React Query 5, i18next (en/ru/uk), Axios, Paddle.js |
| **Backend** | NestJS 10, TypeORM 0.3 + PostgreSQL, Passport + JWT, BullMQ + Redis (jobs), Zod (env), Swagger |
| **Infra** | Docker Compose, single Hetzner server, Nginx, S3 (receipt storage), Telegram (notifications) |
| **Repo** | Yarn workspaces monorepo (`backend/`, `frontend/`) — Node 20 |

Multi-tenancy is enforced by `user_id` scoping **plus** post-auth tenant context on each query connection and PostgreSQL Row-Level Security — see
[backend-patterns.md](./backend-patterns.md).

---

## Which doc should I read?

| If you're working on… | Read |
|---|---|
| A backend module, guard, interceptor, job, auth, tenancy, "how do we do X in Nest" | [**backend-patterns.md**](./backend-patterns.md) |
| A domain flow — orders, receipt/PDF generation, billing, subscriptions, notifications | [**business-logic.md**](./business-logic.md) |
| Calling / changing an HTTP endpoint (all 113 routes, 112 in the OpenAPI contract, request/response shapes, webhooks) | [**api-reference.md**](./api-reference.md) |
| Any frontend work — pages, routing, data fetching, hooks, contexts, checkout, i18n, order documents (quote/invoice/act/sales receipt/packing list/return note), requisites forms, the `/documents` list, document numbering and signature/stamp settings | [**frontend.md**](./frontend.md) |

Common combinations: a **full-stack feature** → `backend-patterns` + `frontend` + `api-reference`;
**understanding a business rule** → `business-logic` (+ `api-reference` for the surface).

---

## Repo map

```
market/
├── backend/                 # NestJS API
│   ├── db/roles/            # production role scripts + rollout runbook (README.md)
│   └── src/
│       ├── main.ts, app.module.ts
│       ├── modules/         # orders, products, receipts, recipients, settings,
│       │                    #   subscription, suppliers, users, paddle, telegram
│       ├── common/          # guards, interceptors, filters, pipes, subscribers,
│       │                    #   tenancy (ALS/interceptor/query runners), idempotency (keyed creates),
│       │                    #   middleware, services, utils, entities, dto
│       ├── config/          # env schema (Zod), TypeORM config, migrations
│       └── openapi/         # contract exporter/--check, shared Zod-derived schemas, doc decorators
├── frontend/                # React app
│   ├── src/
│   │   ├── main.tsx, App.tsx (routing + providers)
│   │   ├── pages/           # 19 route pages (public + dashboard; DocumentsPage = /documents list)
│   │   ├── components/      # per-feature UI; documents/ = /documents page, settings/ = document editor, numbering, signoff
│   │   ├── services/        # OrderService, ReceiptService
│   │   ├── lib/             # api.ts (Axios client + interceptors), auth-session.ts
│   │   │                    #   (cross-tab refresh outcome), api-errors.ts, profit.ts
│   │   │                    #   (unknown/partial profit display helpers), chunk-load.ts
│   │   │                    #   (stale-chunk reload guard for AppErrorBoundary)
│   │   ├── hooks/           # useOrders, useCheckout, useReceiptSocket, useServerPagination, …
│   │   ├── contexts/        # AuthContext, ThemeContext
│   │   └── providers/       # PaddleProvider
│   └── e2e/                 # browser regression suite (`node frontend/e2e/run.mjs`)
│                            #   — see frontend/e2e/README.md
├── docker-compose*.yml      # dev / self-built prod / production variants
├── nginx/                   # reverse proxy
└── docs/context/            # ← you are here
```

## Running it

```bash
yarn install:all         # install root + workspaces
yarn dev                 # backend (start:dev) + frontend (vite) concurrently
yarn docker:up           # full stack via docker-compose
yarn db:migrate          # run TypeORM migrations
```

Dev servers run in **tmux** (a hook enforces this). See the root [`README.md`](../../README.md)
for the full script list and [`PROJECT.md`](../../PROJECT.md) for infrastructure detail.

---

## Keeping these docs honest

These describe real code as of the *Last Updated* date, with file paths so you can verify.
If you change a documented pattern, endpoint, or flow, update the matching doc in the same
change — the routing table above is only useful if an agent can trust it.

## Document customization map

Account configuration, tenant presets and immutable logo assets live in `backend/src/modules/settings/document-config*`, `services/document-*.service.ts` and their entities. Frozen preparation/promotion live in receipt `services/document-render`, `receipt-snapshot`, `receipt-artifact` and `receipt-projection`. `frontend/src/hooks/useDocumentDraft.ts` and settings `DocumentEditor` share the Settings and Orders customization workflow. No permanent render-history subsystem is added; each receipt has one active document and at most one pending candidate.

Typed documents (everything but the waybill) live in `backend/src/modules/receipts/`:

| File | What it owns |
|---|---|
| `document-types.ts` | `DOCUMENT_TYPE_SPECS`: per type the allowed order statuses, `locking`, `requiresMoney`, required requisites and warnings, `multiplePerOrder`, fixed heading, and `layout` (party roles, payment block, `money`, notice, grand-total label, unknown-VAT notice, items heading and unit, signatures, allowed styles); `REISSUABLE_DOCUMENT_TYPES` |
| `frozen-document.ts` | `buildFrozenDocument`: the requisites, details (due date, quotation validity, return lines) and issue date frozen at generation |
| `services/document-view.ts` | `buildDocumentRenderData`: frozen document + order → the pre-formatted `document` view the templates print (totals and VAT, payment purpose, IBAN grouping, unit, signatures) and the translation overrides |
| `templates/document-blocks.ts` | `DOCUMENT_PARTIALS`: the five Handlebars slots (`documentStyles`, `documentParties`, `documentPayment`, `documentTotals`, `documentClosing`) the four document styles include |
| `templates/translations/document-labels.ts` | `DOCUMENT_LABELS` (all wording of the blocks, uk/ru/en, key parity checked), `STYLE_LABEL_OVERRIDES` (receipt-only style labels per type), `TAX_ID_LABELS` |
| `return-note.ts`, `return-note-ledger.ts` | return-note lines and source (`ReturnSource`), the `order_items.returned_qty` ledger, duplicate-submit detection |
| `order-lock.ts` | `LOCKING_DOCUMENT_TYPES` and `syncOrderLock` (kept equal to the specs' `locking` by a test) |
| `document-retention.ts` | `DOCUMENTS_RETAINED_PER_TYPE` and the types exempt from the per-type cap |

### Adding a document type

1. Add the value to `DocumentType` (`entities/receipt.entity.ts`) with a migration for the Postgres enum, and decide whether the partial unique index (one live row per order and type) applies.
2. Add its spec to `DOCUMENT_TYPE_SPECS` (`document-types.ts`); add it to `LOCKING_DOCUMENT_TYPES` (`order-lock.ts`) if `locking`, to `REISSUABLE_DOCUMENT_TYPES` if a void frees the slot, and to the retention exemptions (`document-retention.ts`) if its rows must never be evicted.
3. Add its `details` schema (`document-schemas.ts`) and freezing (`frozen-document.ts`), and any new view field in `services/document-view.ts`; templates read only view flags, never the type.
4. Add every new label to all three languages of `DOCUMENT_LABELS` and an entry to `STYLE_LABEL_OVERRIDES` (`document-labels.ts`).
5. Mirror the type in the frontend (`frontend/src/lib/document-types.ts`, locales); `frontend/e2e/document-types-parity.spec.mjs` compares the two.
6. Record golden digests for the new type (`services/document-layout.spec.ts`) and check the waybill goldens (`waybill-html-golden.spec.ts`) did not move.
7. Update `business-logic.md`, `api-reference.md` and `frontend.md`, and the Terms/Privacy pages if the type has legal meaning.
