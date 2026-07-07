# Progress

## Milestone M3 — Campaigns & sending: COMPLETE ✅ ("the risky one")

### Done in M3
- **Email accounts (FR-2.2/2.3)**: SMTP connect with pre-save connection test, AES-256-GCM credentials (write-only), cap/signature/status editing, send-test-to-self. Gmail OAuth stubbed 501 per ruling (pilot needs a Google Cloud app).
- **Campaigns (FR-6.1/6.2)**: CRUD with DRAFT→ACTIVE→PAUSED(→COMPLETED) transitions; activation validates account + steps; full-replacement step editor with **T-12** template validation (unknown `{{var}}` → 422 naming it); steps frozen while ACTIVE; pure template engine (`{{offer_price}}` → offerText per ruling).
- **Enrollment (FR-6.3/6.4, T-9)**: by ids or lead filter with per-lead skip reasons (suppressed/no_email/bounced/archived/already_active/not_found); one-active-campaign-per-lead via the M0 partial unique; manual stop; `bulk action=enroll`.
- **Send engine (FR-7.1–7.5)**: `send.plan` 15-min repeatable — kill-switch chain (T-10), schedule windows (tenant-tz fallback), follow-ups-first via the partial index, **server-side daily caps** (Redis counter, tenant-tz day — T-4), Message(QUEUED)+claim in one tx (rule 2), 3–7 min jitter (FR-7.2); `send.dispatch` — SENT-check retry safety (**T-3**), template render, threading with In-Reply-To/References/Re: (**T-5**), providerMsgId stored (FR-7.5), hard-bounce handling (FR-7.4), soft-failure backoff.
- **Ops**: test-send (step 1 → own address), `GET /messages`, per-step stats with reply attribution (FR-9.4 skeleton for M4).
- **Web**: SMTP account manager in Settings; campaign builder (sequence editor with variable hints, account picker, activate/pause, test-send, enroll-READY, stats).
- **Acceptance**: full 3-step lifecycle e2e — delivery, growing References chain, restart-safe, COMPLETED. **108 unit + 101 e2e tests across 16 suites — all green.**

### M3 exit criterion — remaining manual step
"3-step sequence delivers to a test inbox and threads in Gmail" — the automated suite proves it against the fake transport; the mailhog/Gmail visual check needs Docker (mailhog) or a real SMTP account: run API + worker + web, connect SMTP, build a campaign, enroll, watch mailhog (localhost:8025).

### Next (M4 — awaiting task-breakdown approval)
- Inbox watcher (IMAP/Gmail polling), reply matching + sequence stop, auto-reply/bounce classification, Telegram + in-app alerts, daily rollups, dashboard charts, reply inbox. T-6, T-7, T-8, T-11.

### Known issues / notes
- Gmail OAuth deferred to pilot (M5) per ruling — SMTP is the only connect path.
- Reply columns in campaign stats fill with real data once M4's reply detection lands (attribution logic already tested via simulated REPLIED enrollments).
- Soft SMTP failures rely on BullMQ backoff; after final attempt the claim goes stale (1h) and send.plan re-books the enrollment.
- Local dev still Docker-less: e2e via `TEST_DATABASE_URL` embedded PG; queue producers stubbed, processors driven inline.
