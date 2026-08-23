# ReceiptMaster — Project Instructions

Multi-tenant SaaS for order management, invoice/receipt PDF generation, and billing.
NestJS 10 backend + React 19 frontend, Yarn workspaces monorepo. See the root
[`README.md`](./README.md) and [`PROJECT.md`](./PROJECT.md) for stack and infra detail.

## Start here: agent context docs

Before working in this codebase, read the relevant doc(s) in [`docs/context/`](./docs/context/):

- [`docs/context/README.md`](./docs/context/README.md) — index + routing table ("working on X → read Y")
- `backend-patterns.md` — NestJS conventions, `common/` layer, auth, multi-tenancy (RLS), jobs
- `business-logic.md` — domain model and core flows (orders, receipts, billing, notifications)
- `api-reference.md` — all HTTP endpoints, request/response shapes, webhooks
- `frontend.md` — routing, data layer, hooks, contexts, checkout, i18n

## Keep the context docs in sync (required)

**When a change affects what a `docs/context/` doc describes, update that doc in the same
change** — the docs are the onboarding contract and are only trustworthy if they match the code.
Concretely:

| If you change… | Update |
|---|---|
| A controller route, its DTO, request/response shape, or a webhook | `api-reference.md` |
| A domain flow or business rule (order lifecycle, receipt gen, billing, entitlements) | `business-logic.md` |
| A backend convention — module structure, guards/interceptors/filters, tenancy, jobs, env | `backend-patterns.md` |
| Frontend routing, the API client, a hook/context pattern, checkout, or i18n setup | `frontend.md` |
| A new module/page, or anything that shifts the repo map or the "which doc" routing | `docs/context/README.md` |

Bump the `Last Updated:` date at the top of any doc you edit. If a change makes a doc's
statement false and you can't fix it now, note the drift rather than leaving it silently wrong.
