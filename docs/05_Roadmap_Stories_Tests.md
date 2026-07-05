# SignX Reach — Development Roadmap, User Stories & Test Plan

## 1. Milestones

**M0 — Skeleton (week 1)**
Repo, docker-compose (pg/redis/mailhog), NestJS scaffold with auth + tenants, Prisma schema migrated, Next.js shell with login. Exit: two tenants sign up; isolation test passes.

**M1 — Leads in (weeks 2-3)**
Integrations vault (Apify/Hunter/Anthropic keys), scrape queries + runs, lead ingestion + dedupe, CSV import, lead table UI. Exit: real Apify run lands ≥20 deduped leads visible in UI.

**M2 — Enrichment (week 4)**
Site-scrape email finder, Hunter fallback, AI personalizer, editable openers. Exit: batch of 20 NEW leads → ≥60% READY with emails and openers.

**M3 — Campaigns & sending (weeks 5-6) — the risky one**
Email account connect (SMTP first, Gmail OAuth second), campaign + steps builder UI, enrollment, send.plan/send.dispatch with caps/jitter/threading, test-send. Exit: 3-step sequence delivers to a test inbox, threads correctly, respects cap, survives worker restart without double-send.

**M4 — Replies & metrics (week 7)**
Inbox watcher, reply matching + sequence stop, Telegram + in-app alerts, daily rollups, dashboard charts, reply inbox. Exit: reply to a test sequence → alert < 1 min, enrollment REPLIED, no further sends.

**M5 — Hardening & pilot (week 8)**
Audit log, exports, kill switches, rate limits, backups, Sentry, bull-board, e2e suite. Exit: SignX itself runs its logistics campaign on the platform for 2 weeks (dogfooding) — the platform's first tenant is you.

**Phase 2 (post-pilot):** Stripe billing + plan limits, warmup integration, platform-metered scraping credits, in-app reply composer, team inbox, white-label.

## 2. User Stories (MVP backlog, prioritized)

**Epic: Onboarding**
- US-1 As an agency owner, I sign up and get an isolated workspace so my data is private.
- US-2 As an owner, I add my Apify/Hunter/Anthropic keys and see them validated so I know sourcing will work.
- US-3 As an owner, I connect a sending mailbox with a daily cap so my domain reputation is protected.

**Epic: Sourcing**
- US-4 As a user, I create a search query (niche + city + max results) and run it so leads appear automatically.
- US-5 As a user, duplicates are silently skipped so my list stays clean.
- US-6 As a user, I import a CSV of leads so I can use lists from other sources.

**Epic: Enrichment**
- US-7 As a user, leads get emails found automatically with a source label so I can trust them.
- US-8 As a user, each lead gets an AI opener I can edit so emails feel personal without manual research.

**Epic: Campaigns**
- US-9 As a user, I build a campaign with a 3-step sequence using variables so follow-ups are automatic.
- US-10 As a user, I enroll filtered leads in bulk so launching takes minutes.
- US-11 As a user, sends respect my cap, schedule window, and human-like spacing so I don't look like a bot.
- US-12 As a user, I can pause a campaign or hit a global kill switch instantly.

**Epic: Replies**
- US-13 As a user, when a lead replies the sequence stops immediately so I never follow up on a reply.
- US-14 As a user, I get a Telegram ping with the reply text so I can respond within minutes.
- US-15 As a user, opt-out intent marks the lead do-not-contact forever so I stay compliant.

**Epic: Insight**
- US-16 As a user, I see sends/replies/bounce trends and a pipeline funnel so I know if it's working.
- US-17 As an owner, I see an audit trail of changes so I can trust my team's actions.

## 3. Acceptance Test Plan (critical paths)

| ID | Scenario | Pass criteria |
|---|---|---|
| T-1 | Tenant isolation | Tenant-B token on every tenant-scoped endpoint with tenant-A ids → 404/403, zero data leakage |
| T-2 | Dedupe | Re-run same query → 0 new leads, duplicates counter increments |
| T-3 | No-double-send | Kill worker mid-dispatch, restart → message sent exactly once (assert 1 SMTP call via mailhog) |
| T-4 | Cap enforcement | Cap=5, 20 due enrollments → exactly 5 sends today, 15 remain due tomorrow |
| T-5 | Threading | Steps 2-3 arrive in same Gmail thread as step 1 |
| T-6 | Reply stops sequence | Reply after step 1 → step 2 never sends; enrollment REPLIED |
| T-7 | Auto-reply ignored | OOO reply → enrollment stays ACTIVE, no alert |
| T-8 | Bounce handling | Hard bounce → enrollment BOUNCED, lead email flagged, metrics increment |
| T-9 | Opt-out permanence | DO_NOT_CONTACT lead re-scraped → stays suppressed, cannot be enrolled (bulk enroll skips with reason) |
| T-10 | Kill switch | sendingEnabled=false → due sends remain queued, none dispatched |
| T-11 | Key revocation | Revoke Gmail OAuth → account status ERROR, tenant notified, sends paused for that account |
| T-12 | Template validation | Unknown {{variable}} on step save → 422 naming the variable |

## 4. Definition of Done (per feature)

Code + unit tests, e2e test for the happy path, tenant-isolation test if a new endpoint, audit log entry if mutating, docs updated, deployed to staging, demoed against the dogfood tenant.

## 5. Team & Effort Estimate

Solo full-stack (you) at ~30 focused hrs/week: 8-9 weeks to M5. With one additional developer: 5-6 weeks (split: one on delivery/inbox engine, one on UI + sourcing). The delivery module (M3-M4) is 40% of total effort — do not underestimate inbox watching and threading edge cases.
