# Progress

## Milestone M0 — Skeleton (in progress)

### Done
- Specs finalized in `docs/` (membership model: global User + per-tenant Membership).
- Repo foundation: docker-compose (postgres 16, redis 7, mailhog), `.env.example`, tooling config.

### Next
- Full Prisma schema + initial migration (+ raw migration for partial indexes).
- NestJS scaffold with docs/03 §3 module folders.
- Tenant isolation infrastructure (AsyncLocalStorage + Prisma extension).
- Auth: signup/login/refresh/switch-tenant, invites, guards.
- Next.js shell: login/signup, dashboard layout, tenant switcher.
- T-1 foundation isolation e2e suite.

### Known issues / notes
- None yet.
