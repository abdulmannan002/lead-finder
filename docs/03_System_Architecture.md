# SignX Reach — System Architecture

## 1. Stack Decision

| Layer | Choice | Why |
|---|---|---|
| Backend | NestJS (TypeScript), modular monolith | Team already ships NestJS in production; module boundaries allow later service extraction |
| ORM/DB | Prisma + PostgreSQL 16 | Team expertise; relational fits the domain hard |
| Jobs/queues | BullMQ + Redis | Scheduling, retries, rate limiting, per-account concurrency — replaces n8n |
| Frontend | Next.js (React) + Tailwind + shadcn/ui | Fast admin-panel development; SSR for the marketing site later |
| Email out | Nodemailer (SMTP) + Gmail API (OAuth accounts) | Tenants bring accounts |
| Email in | Gmail API watch / IMAP IDLE workers | Reply detection |
| AI | Anthropic API (tenant keys), claude-haiku for openers | Cost-efficient personalization |
| Scraping | Apify actors via REST (tenant keys) | No scraping infra to maintain |
| Infra (v1) | Single VPS or small k8s: 1x API, 1x worker, Postgres, Redis; Caddy TLS | Scale target is modest |
| Observability | Pino logs → Loki/Grafana or Axiom; Sentry; BullMQ dashboard (bull-board) | |

## 2. High-Level Diagram

```
                ┌─────────────────────────────────────────────┐
                │                Next.js Admin                │
                │  dashboard · leads · campaigns · settings   │
                └───────────────────────┬─────────────────────┘
                                        │ REST/JSON (JWT)
┌───────────────────────────────────────▼─────────────────────────────────┐
│                         NestJS API (modular monolith)                   │
│  Auth │ Tenants │ Leads │ Campaigns │ Integrations │ Metrics │ Audit    │
└──────────┬──────────────────────────────────────────────────┬───────────┘
           │ Prisma                                           │ enqueue
     ┌─────▼─────┐                                      ┌─────▼─────┐
     │ PostgreSQL │                                     │   Redis    │
     └─────▲─────┘                                      │  (BullMQ)  │
           │ Prisma                                     └─────┬─────┘
┌──────────┴──────────────────────────────────────────────────▼───────────┐
│                            Worker process(es)                           │
│  scrape.run │ enrich.email │ ai.personalize │ send.dispatch │ inbox.poll │
└──────┬───────────┬───────────────┬───────────────┬───────────────┬──────┘
       │           │               │               │               │
   ┌───▼───┐   ┌───▼────┐    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼────┐
   │ Apify │   │ Hunter │    │ Anthropic │   │ SMTP/Gmail│   │ Telegram │
   └───────┘   └────────┘    └───────────┘   └───────────┘   └──────────┘
```

## 3. Backend Modules (NestJS)

- **auth** — signup/login, JWT issue/refresh, TOTP, invitations
- **tenants** — tenant CRUD, user roles, kill switch, config
- **integrations** — key vault (encrypt/validate), email account connect (OAuth flow, SMTP test)
- **sourcing** — scrape queries, runs, Apify client, lead ingestion + dedupe, CSV import
- **enrichment** — site fetcher, email extraction, Hunter client, AI personalizer
- **campaigns** — campaigns, sequence steps, enrollments, template rendering
- **delivery** — send scheduler, dispatcher, threading, bounce handling, inbox watcher, reply matcher
- **metrics** — daily rollups, dashboard queries
- **notifications** — Telegram + in-app
- **audit** — activity log interceptor

## 4. Job Design (BullMQ)

| Queue | Trigger | Idempotency / limits |
|---|---|---|
| scrape.run | user action or daily cron per pending query | one active run per query; Apify run id stored |
| enrich.email | on lead NEW without email; batch cron | per-tenant Hunter quota counter in Redis |
| ai.personalize | on lead email found | skip if firstLine exists |
| send.plan | cron every 15 min per active campaign | computes due enrollments, enqueues send.dispatch |
| send.dispatch | from send.plan | per-emailAccount rate limiter (cap/day, jitter 3–7 min); Message row written QUEUED before SMTP → retry checks status ≠ SENT (no double-send) |
| inbox.poll | repeatable per connected account (or Gmail push webhook) | last-history-id checkpoint per account |
| rollup.daily | cron 23:55 tenant-tz | upsert on (tenantId, day) |

Failure policy: exponential backoff, max 3 attempts, then dead-letter queue + Sentry + platform alert. Tenant-visible errors (bad key, revoked OAuth) set the related entity status=ERROR and notify the tenant.

## 5. Critical Flows

**Send flow (no-double-send guarantee):**
1. send.plan selects enrollments WHERE status IN (QUEUED, ACTIVE) AND nextDueAt <= now, ordered follow-ups-first, limited by account's remaining daily budget (Redis counter).
2. For each: create Message(status=QUEUED) in the same transaction that advances a `claimedAt` on the enrollment → enqueue send.dispatch(messageId).
3. dispatch loads Message; if status=SENT, exit (retry-safe). Render template → SMTP/Gmail send → store providerMsgId, status=SENT, schedule enrollment's next step (or COMPLETED after last step).

**Reply flow:**
inbox.poll → new inbound → classify (auto-reply? bounce?) → match by In-Reply-To/References against Message.providerMsgId, fallback match by sender email against active enrollments → set enrollment REPLIED (stops future sends by definition of send.plan's WHERE clause) → store inbound Message → notify (Telegram + in-app) → bump metrics.

**Kill switches, in priority order:** tenant.sendingEnabled=false → campaign PAUSED → emailAccount DISABLED. send.plan checks all three.

## 6. Security Notes

- Secrets: AES-256-GCM app-layer encryption; master key from env/KMS; rotate-able (key version column).
- OAuth tokens refreshed by a dedicated job; revocation → account status ERROR + tenant notification.
- Rate limits: auth 5/min/IP; API 100/min/tenant; webhooks HMAC-signed.
- RBAC via NestJS guards per route; superadmin routes on a separate, audited controller.

## 7. Environments & CI/CD

- envs: local (docker-compose: pg, redis, mailhog), staging, prod.
- CI: lint, typecheck, unit + e2e (Jest, testcontainers), Prisma migrate diff check.
- CD: Docker images; migrations run as a pre-deploy job; blue/green not needed at v1 scale (brief maintenance window acceptable).
- Backups: nightly pg_dump to object storage, 14-day retention; restore drill monthly.
