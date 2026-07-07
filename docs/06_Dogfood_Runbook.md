# SignX Reach — Dogfood Runbook (M5 pilot)

Goal (docs/05): SignX runs its own logistics-niche campaign on the
platform for 2 weeks as tenant #1.

## 0. Prerequisites
- Docker Desktop (postgres 16, redis 7, mailhog) or managed equivalents
- Real keys: Apify (Google Maps actor credits), Hunter.io, Anthropic;
  a Telegram bot (token + chat id); an SMTP mailbox with IMAP access
  (app password recommended)

## 1. Boot
```bash
docker compose up -d
cp .env.example .env       # fill secrets; generate JWT + master keys
npm install && npx prisma migrate deploy
npm run start:dev          # API :3001
npm run start:worker:dev   # worker (queues + crons + bull-board if enabled)
cd web && npm install && npm run dev   # web :3000
```

## 2. Workspace setup (day 1)
1. Sign up at localhost:3000 → workspace "SignX Solutions".
2. Settings → connect the SMTP account (cap 20–30/day to protect the
   domain), send a test email, confirm receipt.
3. Settings → add Apify, Hunter, Anthropic, Telegram keys (each is
   validated on save).

## 3. Leads (days 1–2)
1. Leads → create queries, e.g. "freight forwarders" / "Lahore",
   "logistics companies" / "Karachi", max 100 each → Run.
2. Verify: ≥20 deduped leads visible (M1 exit); re-run a query and
   confirm 0 new + duplicates counted (T-2).
3. Watch enrichment fill emails (source/confidence badges) and AI
   openers; spot-edit weak openers inline (FR-5.3).

## 4. Campaign (day 2)
1. Campaigns → "Logistics outreach — {{offer_price}}" with 3 steps
   (day 0 intro, +3 bump, +4 close), threaded.
2. Test-send → check the rendered mail in your own inbox.
3. Enroll READY leads (suppressed/no-email are skipped with reasons).
4. Activate. Watch mailhog (localhost:8025) locally or the real inbox in
   production; confirm threading in Gmail (T-5) and caps (T-4).

## 5. Daily during the pilot
- Dashboard: sends/replies/bounces chart + funnel (rollups hourly).
- Replies: triage with call-booked / won / lost (+ note).
- Telegram: expect a ping within ~5 min of any genuine reply.
- Audit (Owner): GET /api/v1/audit for the change trail.
- bull-board (if enabled): worker :3002/admin/queues.

## 6. Weekly ops
- Verify nightly backups exist (scripts/backup.sh via cron).
- Restore drill once during the pilot (see script footer).
- Review UNREACHABLE/BOUNCED rates; tune queries and openers.

## 7. Exit review (day 14)
- ≥1 active campaign completed its sequence cohort
- Reply rate visible per step; at least one WON outcome recorded
- Zero cross-tenant incidents (spot-check /audit), zero double-sends
  (message log: no duplicate providerMsgId per enrollment step)
- Backups verified restorable

## Known gaps going into the pilot
- Gmail OAuth not implemented (SMTP+IMAP only).
- Reply latency bounded by the 5-min poll (IDLE/push post-pilot).
- 2FA endpoints deferred (FR-1.5 optional).
