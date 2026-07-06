# Progress

## Milestone M2 — Enrichment: COMPLETE ✅

### Done in M2
- **Email finder (FR-4.x)**: SiteScraper (home + /contact + /about, timeout + size caps), regex/mailto extraction with junk filtering, FR-4.3 selection (personal-name > sales > operations > info, same-domain preferred), `Lead.emailConfidence` HIGH/LOW per ruling.
- **Hunter fallback (FR-4.2)**: tenant key from the vault, per-tenant **monthly Redis quota** (`config.monthlyQuota`, default 25) behind an injectable counter; refusals don't burn quota.
- **enrich.email processor**: NEW→ENRICHING→READY/UNREACHABLE (FR-4.5); transient errors revert to NEW for the 10-min batch sweep; already-emailed leads promoted straight to READY; chained from scrape ingestion + `POST /leads/:id/enrich`.
- **AI personalizer (FR-5.x)**: claude-haiku (`claude-haiku-4-5`) via the tenant's Anthropic key (official SDK); ≤25-word opener referencing the actual business or literal GENERIC → city/category template fallback (FR-5.2); skip-if-exists idempotency; `POST /leads/:id/personalize` forces regenerate; openers user-editable (FR-5.3); **token usage logged per tenant** to the activity log (FR-5.4 ruling).
- **Web**: email source/confidence badges, editable opener column, per-row "Find email" / "AI opener" actions.
- **Acceptance**: M2 exit criterion verified in e2e — 20 NEW leads through the full pipeline → 15 READY (75%) with emails + openers, 5 UNREACHABLE, 15 token-usage logs.
- **Tests**: 95 unit + 64 e2e across 10 suites — all green.

### Next (M3 — "the risky one" — awaiting task-breakdown approval)
- Email account connect (SMTP first, Gmail OAuth second), campaign + steps builder UI, enrollment, send.plan/send.dispatch with caps/jitter/threading, test-send. T-3 (no-double-send), T-4 (caps), T-5 (threading), T-12 (template validation).

### Known issues / notes
- `Campaign.emailAccountId` nullable for DRAFT campaigns — validate on activation (M3).
- FR-3.5 "keep no-website leads" path deferred (docs/02 §3 note).
- `bulk action=enroll` arrives with campaigns (M3).
- Local dev has no Docker: e2e runs via `TEST_DATABASE_URL` (embedded PG 16); queue producers stubbed in tests, processors driven inline exactly as the worker would.
- Personalizer reads the tenant Anthropic integration directly (scoped) and skips quietly when absent — leads stay READY without openers until a key is added.
