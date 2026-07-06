# Progress

## Milestone M1 — Leads in: CODE COMPLETE ✅ (manual exit check pending)

### Done in M1
- **Secrets vault**: AES-256-GCM (12-byte IV + auth tag), versioned master key for rotation, last4-only exposure. 7 unit tests.
- **Integrations**: PUT/GET/DELETE /integrations/:kind with validate-on-save test calls (Apify, Hunter, Anthropic, Telegram+chatId); keys write-only after creation; `getKey()` for other modules.
- **Queue infra**: BullMQ with docs/03 §4 queue names; lazily-connected producer behind a DI token; worker entry wraps every job in `runWithContext(tenantId)`; 3-attempt exponential backoff.
- **Sourcing**: queries CRUD + manual run trigger (one active run per query, Idempotency-Key = jobId); Apify client (default actor `compass~crawler-google-places`, config-overridable); normalizer (domain dedupe key); scrape.run processor with createMany-skipDuplicates dedupe and run stats. **T-2 passing** (re-run → 0 new, duplicates counted).
- **Leads API**: list with filters (status/city/category/q/hasEmail) + pagination, detail, inline edit; DO_NOT_CONTACT permanence (409 SUPPRESSED); bulk archive/do_not_contact with skip reasons.
- **CSV import**: multipart + column mapping through the same normalize/dedupe path; named errors (UNKNOWN_COLUMN etc.).
- **Web**: Settings integrations manager; Leads page with query panel, CSV import, filterable lead table with inline editing.
- **Tests**: 68 unit + 45 e2e (auth, isolation T-1+B.5, integrations, sourcing, ingest T-2, leads, CSV) — all green.

### M1 exit criterion — remaining manual step
"Real Apify run lands ≥20 deduped leads visible in UI" needs a real
Apify key: `docker compose up -d` (or any Postgres/Redis), `npm run
start:dev` + `npm run start:worker:dev` + `cd web && npm run dev`, add
the Apify key in Settings, create a query, hit Run.

### Next (M2 — awaiting task-breakdown approval)
- Site-scrape email finder, Hunter fallback (per-tenant quota counter), AI personalizer, editable openers.

### Known issues / notes
- `Campaign.emailAccountId` nullable for DRAFT campaigns — validate on activation (M3).
- FR-3.5 "keep no-website leads" path deferred (docs/02 §3 note) — needs a dedupe-key decision.
- `bulk action=enroll` returns validation error until M3 (campaigns).
- E2e: testcontainers by default; `TEST_DATABASE_URL` override used on this Docker-less machine. Real Redis-backed queue e2e runs where Docker exists; locally the queue producer is stubbed and the processor is exercised inline.
- Access tokens don't re-check tenant status per request (15 min max staleness).
