# SignX Reach — Project Instructions

## What this is
Multi-tenant cold-outreach automation SaaS for agencies: scrape leads
(Google Maps via tenant's Apify key), find emails (site scrape +
Hunter fallback), AI-personalize openers (tenant's Anthropic key),
run multi-step email sequences with strict daily caps, detect replies,
alert via Telegram, show dashboards. First tenant = SignX Solutions
itself (dogfooding for its logistics-niche outreach).

## Authoritative specs — READ BEFORE IMPLEMENTING ANY FEATURE
- docs/01_SRS.md — requirements (FR-x / NFR-x IDs used in commits)
- docs/02_Database_Design_ERD.md — schema, enums, indexes, tenancy rules
- docs/03_System_Architecture.md — modules, queues, critical flows
- docs/04_API_Specification.md — endpoint contracts
- docs/05_Roadmap_Stories_Tests.md — milestones M0-M5, acceptance tests T-1..T-12
If code and docs conflict, docs win; if a doc is ambiguous, ASK ME,
don't guess.

## Stack (fixed — do not substitute)
- Backend: NestJS (TypeScript, strict), modular monolith per docs/03 module list
- DB: PostgreSQL 16 + Prisma
- Jobs: BullMQ + Redis (queues named exactly as in docs/03 §4)
- Frontend: Next.js (App Router) + Tailwind + shadcn/ui, in /web
- Tests: Jest; e2e with testcontainers; mailhog for SMTP tests
- Local: docker-compose with postgres, redis, mailhog

## Non-negotiable rules
1. TENANT ISOLATION: every tenant-scoped model has tenantId. All access
   goes through the Prisma client extension that injects tenantId from
   AsyncLocalStorage request context. NEVER write a raw/unscoped query
   on tenant models. Every new endpoint gets a tenant-isolation test
   (tenant-B token vs tenant-A data → 404/403).
   Child models denormalize tenantId even when scoped via a parent
   (ScrapeRun, SequenceStep, Enrollment, Message — and every future
   child model). Exception: User is GLOBAL (no tenantId, no role);
   tenancy and roles live on Membership, which IS tenant-scoped.
   Scoping always follows the JWT's ACTIVE tenant, never the
   membership list.
2. NO DOUBLE-SEND: Message row (status=QUEUED) is created in a
   transaction BEFORE SMTP dispatch; dispatch job checks status !== SENT
   on retry. Test T-3 must pass.
3. SECRETS: integration keys and SMTP creds encrypted AES-256-GCM before
   storage (master key from env), never returned by API after creation.
4. CAPS ARE SERVER-SIDE: per-account daily send caps enforced in
   send.plan via Redis counters; API cannot bypass.
5. DO_NOT_CONTACT is permanent: suppressed leads can never be enrolled;
   bulk operations skip them with a reason.

## Conventions
- Conventional commits referencing spec IDs: `feat(sourcing): dedupe on
  websiteDomain (FR-3.4)`
- One module = one folder under src/modules/, matching docs/03 §3
- DTOs validated with class-validator; all errors follow the error
  envelope in docs/04
- Enums live in prisma/schema.prisma and are the single source of truth
- No feature is done without: unit tests, happy-path e2e, isolation test
  (if new endpoint), and passing lint + typecheck

## Workflow with me
- Work milestone by milestone (M0 → M5). Never start a milestone early.
- At the start of each milestone: propose a short task breakdown, wait
  for my OK.
- After each meaningful chunk: run tests, show me a summary of what
  changed and how to verify it manually.
- If a design decision isn't covered by the docs, list options with a
  recommendation and ask.
- Keep a PROGRESS.md updated: what's done, what's next, known issues.

## Current status
ALL MILESTONES M0–M5 CODE COMPLETE. T-1..T-12 automated; 129 unit +
137 e2e green across 25 suites. Remaining: the 2-week dogfood pilot
(docs/06_Dogfood_Runbook.md) with real credentials, which also covers
the deferred manual checks (real Apify run, real mailbox threading and
replies). Post-pilot backlog in PROGRESS.md.