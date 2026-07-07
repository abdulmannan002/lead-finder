# Progress

## Milestone M4 — Replies & metrics: COMPLETE ✅

### Done in M4
- **Notifications (FR-8.4/FR-2.4)**: tenant-scoped in-app feed (`Notification` model per ruling) with unread counter + mark-read; Telegram alerts via the tenant's bot (vault key + chatId), best-effort so alert failures never break pipelines.
- **Inbox watcher (FR-8.1–8.3)**: `inbox.poll` 5-min repeatable, per-account IMAP (imapflow behind a DI token, `inboxCheckpoint` on the account, optional imapHost/imapPort in SMTP creds); pure classifier separates genuine replies from auto-replies/OOO (**T-7**) and DSN bounces (**T-8**); matching by In-Reply-To/References → `providerMsgId`, sender fallback; genuine reply → REPLIED + replyText + inbound Message + immediate alert (**T-6**); opt-out intent → permanent DO_NOT_CONTACT (FR-7.6); IMAP auth failure → account ERROR + notification, sends pause (**T-11**).
- **Reply inbox (FR-9.3)**: `GET /replies` (unhandled filter, lead/campaign context), `PATCH /replies/:id` outcome CALL_BOOKED/WON/LOST + note (ReplyOutcome columns per ruling).
- **Metrics (FR-9.1/9.5)**: hourly `rollup.daily` recomputing today per tenant tz (idempotent upsert on (tenantId, day), idle tenants skipped); `GET /metrics/daily|overview|funnel` (funnel: lead → enrolled → contacted → replied → won).
- **Web**: dashboard with scorecards, recharts sends/replies/bounces chart, funnel bars, notifications card; reply inbox with one-click triage.
- **Acceptance**: exit criterion e2e — reply → alert inside the same poll pass (« 1 min), REPLIED, step 2 never sends, reply appears in the inbox, day rolls up. **129 unit + 122 e2e across 21 suites — all green.**

### Next (M5 — hardening & pilot — awaiting task-breakdown approval)
- Audit log interceptor, CSV exports, rate limits, Sentry, bull-board, backups doc, remaining e2e polish. Exit: SignX dogfoods its logistics campaign for 2 weeks.

### Known issues / notes
- Gmail OAuth still deferred to pilot (needs a Google Cloud app).
- 5-min reply latency bound comes from the poll cadence; IMAP IDLE or Gmail push can tighten it post-pilot.
- `emailsFound` daily metric is an approximation (finder-attributed emails whose lead changed that day).
- Manual checks pending real credentials: M1 Apify run, M3 mailhog threading, M4 real-mailbox reply loop.
- Local dev remains Docker-less: embedded UTF8 PG via `TEST_DATABASE_URL`; queue producers stubbed in tests, processors driven inline.
