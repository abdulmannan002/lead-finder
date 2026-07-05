# Progress

## Milestone M0 — Skeleton: COMPLETE ✅

### Done
- Specs finalized in `docs/` (membership model: global User + per-tenant Membership).
- Repo foundation: docker-compose (postgres 16, redis 7, mailhog), `.env.example`, strict TS/eslint/jest tooling.
- Full Prisma schema: 16 models, 13 enums, all constraints from docs/02, initial migration applied; enrollment partial indexes (sender hot query + one-active-per-lead) via raw migration.
- NestJS scaffold: all 10 docs/03 §3 module folders, docs/04 error envelope filter, validation pipe.
- **Tenant isolation infrastructure (FR-1.4)**: AsyncLocalStorage request context + Prisma extension that scopes every model with a `tenantId` field (derived from DMMF), stamps creates, fails closed without context, blocks raw SQL; `SystemPrismaService` is the single greppable bypass. 21 unit tests.
- Auth (FR-1.1–1.3, FR-1.6): signup (User+Tenant+OWNER membership), login, DB-backed rotating refresh tokens with reuse detection, switch-tenant, POST /tenants, GET /me/tenants, invite + accept-invite (existing users skip the password step), argon2id, role guards.
- Tenants: GET/PATCH /tenant (incl. sendingEnabled kill switch), member list/role-change/remove with last-Owner protection.
- Next.js shell: login/signup/accept-invite, dashboard layout with sidebar + tenant switcher, placeholder pages (Leads, Campaigns, Replies, Metrics, Settings).
- Tests: 38 unit + 17 e2e. E2e covers auth happy paths, refresh rotation/reuse, invites, and the **T-1 foundation isolation suite** incl. B.5 (active-tenant scoping beats membership list). M0 exit criteria verified.

### Next (M1 — awaiting task-breakdown approval)
- Integrations vault (Apify/Hunter/Anthropic keys, AES-256-GCM).
- Scrape queries + runs, Apify client, lead ingestion + dedupe, CSV import, lead table UI.

### Known issues / notes
- `Campaign.emailAccountId` is nullable so DRAFT campaigns can exist before a sending account is connected; activation must validate it (flagged during M0, confirm in M3).
- E2e uses testcontainers by default; on machines without Docker set `TEST_DATABASE_URL` to any Postgres 16 (this dev machine has no Docker — an embedded PG 16 was used; the suite migrates + wipes the DB it is given).
- Access tokens don't re-check tenant status per request (15 min max staleness); revisit if suspension must be instant.
