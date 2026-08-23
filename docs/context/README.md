# ReceiptMaster — Agent Context

**Last Updated:** 2026-08-21

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
(async), and are billed by plan (Free / Pro / Business) via Paddle.

| Layer | Stack |
|---|---|
| **Frontend** | React 19 + TypeScript, Vite, Tailwind CSS v4, React Router 7, TanStack React Query 5, i18next (en/ru/uk), Axios, Paddle.js |
| **Backend** | NestJS 10, TypeORM 0.3 + PostgreSQL, Passport + JWT, BullMQ + Redis (jobs), Zod (env), Swagger |
| **Infra** | Docker Compose, single Hetzner server, Nginx, S3 (receipt storage), Telegram (notifications) |
| **Repo** | Yarn workspaces monorepo (`backend/`, `frontend/`) — Node 20 |

Multi-tenancy is enforced by `user_id` scoping **plus** PostgreSQL Row-Level Security — see
[backend-patterns.md](./backend-patterns.md).

---

## Which doc should I read?

| If you're working on… | Read |
|---|---|
| A backend module, guard, interceptor, job, auth, tenancy, "how do we do X in Nest" | [**backend-patterns.md**](./backend-patterns.md) |
| A domain flow — orders, receipt/PDF generation, billing, subscriptions, notifications | [**business-logic.md**](./business-logic.md) |
| Calling / changing an HTTP endpoint (all 91 routes, request/response shapes, webhooks) | [**api-reference.md**](./api-reference.md) |
| Any frontend work — pages, routing, data fetching, hooks, contexts, checkout, i18n | [**frontend.md**](./frontend.md) |

Common combinations: a **full-stack feature** → `backend-patterns` + `frontend` + `api-reference`;
**understanding a business rule** → `business-logic` (+ `api-reference` for the surface).

---

## Repo map

```
market/
├── backend/                 # NestJS API
│   └── src/
│       ├── main.ts, app.module.ts
│       ├── modules/         # orders, products, receipts, recipients, settings,
│       │                    #   subscription, suppliers, users, paddle, telegram
│       ├── common/          # guards, interceptors, filters, pipes, subscribers,
│       │                    #   middleware (tenancy), services, utils, entities, dto
│       └── config/          # env schema (Zod), TypeORM config, migrations
├── frontend/                # React app
│   └── src/
│       ├── main.tsx, App.tsx (routing + providers)
│       ├── pages/           # 18 route pages (public + dashboard)
│       ├── services/        # OrderService, ReceiptService, NotificationService
│       ├── lib/             # api.ts (Axios client + interceptors), api-errors.ts
│       ├── hooks/           # useOrders, useCheckout, useReceiptSocket, useServerPagination, …
│       ├── contexts/        # AuthContext, ThemeContext
│       └── providers/       # PaddleProvider
├── docker-compose*.yml      # dev / application / database / production variants
├── nginx/ · hetzner/        # reverse proxy + Terraform infra
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
