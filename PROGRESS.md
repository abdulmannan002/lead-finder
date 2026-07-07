# Progress

## Milestone M6 — Marketplace pivot (docs/07): IN PROGRESS

Pivot decision (owner-approved): evolve into a B2B connection
marketplace for underserved markets. No fake data published; scraped
data stays a private invite list. Budget <$100/yr (Oracle free tier).

### Done (branches merged to main)
1. **feat/business-profiles (MP-1/2/3)** — BusinessProfile model,
   `GET/PUT /business-profile` + AI description via the PLATFORM
   Anthropic key, public directory + profile pages by slug (published
   only, cross-tenant read BY DESIGN), email-verification badge
   (`/auth/verify-email/*`). 7 e2e tests.
2. **feat/requests (MP-4/5/6)** — MarketRequest/MarketResponse models,
   `POST /requests` with category+keyword matching (`matchScore`) that
   notifies matched providers in THEIR tenant context, provider lead
   feed `GET /requests/matched`, one-offer-per-provider
   `POST /requests/:id/respond` (409 on dupes), buyer offer comparison
   with contact reveal `GET /requests/:id/responses`, close. 5 unit +
   6 e2e tests.

### Next
3. **feat/marketplace-web** — public landing/directory/profile pages,
   request wizard, "My leads / My requests" screens.
4. **feat/growth (MP-7)** — invitation sequences to the private scraped
   list via the existing delivery engine; invited→registered tracking.
5. **feat/deploy-oracle** — production compose (API/worker/PG/Redis/
   Caddy), Oracle Always-Free runbook, backups to R2, CI.

## Milestone M5 — Hardening & pilot: CODE COMPLETE ✅ (pilot is a 2-week human activity)

All five build milestones (M0–M5) are code-complete. **129 unit + 137 e2e
tests across 25 suites — all green.** Acceptance tests T-1 through T-12
are automated (T-2..T-12 in their milestone suites; T-1 isolation runs
against every endpoint family).

### Done in M5
- **Audit (FR-10.1)**: global interceptor logs every authenticated mutation (acting user, route pattern, redacted payload — secrets never stored); `GET /audit` for Owner/Admin with userId/action/date filters; exports also audited.
- **Exports (FR-10.2)**: `GET /leads/export` + `GET /messages/export` (docs/04 addition per ruling), RFC-4180, filter-aware, 50k cap.
- **Tenant deletion (FR-10.3)**: `DELETE /tenant` (OWNER + password re-entry) → soft delete with sessions revoked and logins blocked; daily sweep hard-purges after 30 days (FK-safe order).
- **Hardening (NFR-2/6/8)**: rate limits (API 100/min/tenant, auth 5/min/IP/endpoint), env-gated Sentry with 5xx capture, bull-board on the worker behind basic auth, nightly backup script with retention + restore drill.
- **docs/06_Dogfood_Runbook.md**: the step-by-step pilot script (boot, keys, leads, campaign, daily/weekly ops, day-14 exit review).

### The pilot itself (human, 2 weeks)
Follow docs/06 with real keys (Apify/Hunter/Anthropic/Telegram/SMTP+IMAP)
and Docker (or managed PG/Redis). This also covers the deferred manual
checks from M1 (real Apify run) and M3/M4 (real mailbox threading/replies).

### Post-pilot backlog (Phase 2 candidates + deferrals)
- Gmail OAuth connect (needs a Google Cloud app)
- IMAP IDLE / Gmail push to beat the 5-min reply latency
- 2FA endpoints (FR-1.5), lead ARCHIVED-after-90-days cron, message body
  compression (docs/02 §6), Redis-backed throttler storage for multi-instance
- FR-3.5 "keep no-website leads" dedupe-key decision
- Stripe billing, warmup integration, in-app composer (docs/05 Phase 2)

### Environment note
Local dev on this machine is Docker-less: e2e runs against an embedded
UTF8 PostgreSQL 16 via `TEST_DATABASE_URL`; queue producers are stubbed
in tests with processors driven inline exactly as the worker runs them.
CI/machines with Docker use testcontainers + compose unchanged.
