# SignX Reach

Multi-tenant cold-outreach automation SaaS for agencies: scrape leads from
Google Maps, find and verify emails, generate AI-personalized openers, run
multi-step email sequences with strict daily caps, detect replies, and see
everything on a dashboard. Each agency (tenant) has fully isolated data and
brings its own third-party API keys.

## Stack

- **API**: NestJS (TypeScript, strict), modular monolith — `/src`
- **DB**: PostgreSQL 16 + Prisma — `/prisma`
- **Jobs**: BullMQ + Redis
- **Web**: Next.js (App Router) + Tailwind + shadcn/ui — `/web`
- **Tests**: Jest, e2e with testcontainers, mailhog for SMTP

## Getting started

```bash
docker compose up -d            # postgres:16, redis:7, mailhog
cp .env.example .env            # then fill in the secrets
npm install
npx prisma migrate dev
npm run start:dev               # API on :3001

cd web && npm install && npm run dev   # web on :3000
```

## Project docs

Authoritative specs live in [`docs/`](docs/): SRS, database design/ERD,
system architecture, API specification, and the roadmap/test plan.

## Development

```bash
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm test              # unit tests
npm run test:e2e      # e2e (Docker via testcontainers, or set TEST_DATABASE_URL)
```

Progress is tracked in [PROGRESS.md](PROGRESS.md).
