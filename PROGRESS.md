# Progress

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
