# SignX Reach — Software Requirements Specification (SRS)

Version 1.0 · Working title: SignX Reach · Multi-tenant cold-outreach automation SaaS

## 1. Purpose & Scope

SignX Reach automates B2B client acquisition for agencies: it scrapes leads from Google Maps, finds and verifies email addresses, generates AI-personalized openers, runs multi-step email sequences, detects replies, and surfaces everything in a dashboard. It is multi-tenant: each agency (tenant) has isolated data, its own sending accounts, and its own API keys for third-party services.

Out of scope for v1: LinkedIn automation, SMS/WhatsApp channels, built-in email warmup, CRM integrations (HubSpot etc.), white-labeling.

## 2. Definitions

- **Tenant**: an agency/organization workspace. All data is tenant-scoped; every row belongs to exactly one tenant. A user may hold memberships in multiple tenants (e.g., an agency operator running outreach for several clients).
- **Membership**: the link between a global User and a Tenant, carrying that user's role in that tenant.
- **Lead**: a scraped business with contact data.
- **Campaign**: a configured outreach effort (target niche, offer, sequence of email templates).
- **Enrollment**: a lead's membership in a campaign, tracking sequence progress.
- **Sequence step**: one templated email in a campaign (e.g., step 1 day 0, step 2 day +3).
- **Message**: an individual outbound or inbound email tied to an enrollment.

## 3. User Roles

Roles are properties of a **membership** (user × tenant), not of the user: the same person can be Owner of one workspace and Member of another.

| Role | Capabilities |
|---|---|
| Owner | Everything; billing; delete tenant; manage users |
| Admin | Manage campaigns, leads, email accounts, integrations |
| Member | View dashboards, work replies, edit lead notes |
| Platform superadmin | Cross-tenant support access (SignX staff only, audited) |

## 4. Functional Requirements

### FR-1 Authentication & Tenancy
- FR-1.1 Email/password signup creates a global User, a Tenant (workspace), and an OWNER membership linking them. If the email already has an account → 409 with a hint to log in.
- FR-1.2 JWT access + refresh tokens; passwords hashed (argon2). JWT payload = { userId, tenantId (active workspace), role (for that membership) }. Refresh tokens are DB-backed (hashed, rotating) and bound to the active tenant; all of a user's sessions are revoked on password change.
- FR-1.3 Owners/Admins can invite users by email with a role. If the invitee already has a User account, accepting the invite just creates the Membership (no password step); otherwise accept sets a password and creates the User + Membership. The invitation's role becomes the membership role.
- FR-1.4 Every API query is scoped to the token's ACTIVE tenant; cross-tenant access is impossible by construction (tenantId on every row, enforced centrally in a Prisma client extension). Holding a membership in tenant B never grants access while a tenant-A token is active.
- FR-1.5 2FA (TOTP) optional per user (global — tied to the user's identity, not to a workspace).
- FR-1.6 Multi-workspace: an authenticated user can create additional tenants (becoming their OWNER), list their memberships, and switch the active tenant — switching verifies membership and issues a fresh token pair.

### FR-2 Integrations (per tenant)
- FR-2.1 Tenants store their own API keys: Apify, Hunter.io, Anthropic. Keys are encrypted at rest (AES-256, app-level).
- FR-2.2 Tenants connect 1+ sending email accounts via Gmail OAuth2 or raw SMTP credentials.
- FR-2.3 Each email account has: daily send cap, warmup flag, signature, from-name.
- FR-2.4 Telegram notification: tenant saves a bot token + chat ID; system sends alerts there.
- FR-2.5 Key validation on save (test call); invalid keys rejected with a clear error.

### FR-3 Lead Sourcing
- FR-3.1 Users create scrape queries (search string, city, max results).
- FR-3.2 A scheduler or manual trigger runs queries via the tenant's Apify key (Google Maps actor).
- FR-3.3 Results are normalized into Leads: company, website, phone, address, city, category, source email if present.
- FR-3.4 Dedupe on (tenantId, website domain); duplicates are skipped and counted.
- FR-3.5 Leads without a website are discarded (configurable per tenant).
- FR-3.6 CSV import of leads as an alternative source (mapped columns, same dedupe).

### FR-4 Email Finding & Enrichment
- FR-4.1 For leads lacking an email: fetch the lead's site (home, /contact, /about), extract emails via regex, filter junk domains.
- FR-4.2 Fallback to Hunter.io domain search using the tenant's key, respecting its quota.
- FR-4.3 Email choice priority: personal-name > sales@ > operations@ > info@.
- FR-4.4 Store email_source (scrape/hunter/apify/import/manual) and a confidence flag.
- FR-4.5 Leads that fail all finders get status UNREACHABLE.

### FR-5 AI Personalization
- FR-5.1 For READY leads, fetch homepage text (truncated ~1,500 chars) and call Anthropic API (tenant key) to generate a ≤25-word opener referencing the lead's actual business.
- FR-5.2 If the model returns GENERIC (thin site), fall back to a template line using city/category.
- FR-5.3 Openers are editable by users before/while a campaign runs.
- FR-5.4 Token usage per tenant is logged for transparency.

### FR-6 Campaigns & Sequences
- FR-6.1 A campaign has: name, target description, offer text, a sending email account (exactly one per campaign in v1), schedule window (days of week, hour range, timezone), and ordered sequence steps.
- FR-6.2 A sequence step has: subject template, body template (variables: {{company}}, {{first_line}}, {{city}}, {{offer_price}}, {{signature}}), delay in days from previous step, and thread-with-previous flag.
- FR-6.3 Users enroll leads into a campaign manually (multi-select) or by rule (e.g., all READY leads from query X).
- FR-6.4 A lead can be active in at most one campaign at a time (per tenant).
- FR-6.5 Pause/resume at campaign level and tenant level (global kill switch).

### FR-7 Sending Engine
- FR-7.1 A scheduler (BullMQ repeatable job) computes due sends: follow-ups first, then first-touches, respecting each email account's daily cap and the campaign schedule window.
- FR-7.2 Random 3–7 minute jitter between sends per account.
- FR-7.3 Follow-ups thread on the original message (In-Reply-To/References headers, "Re:" subject).
- FR-7.4 Hard bounce or SMTP failure marks the enrollment BOUNCED and the lead's email invalid; soft failures retry with backoff (max 3).
- FR-7.5 Every outbound message stores provider message-id for reply matching.
- FR-7.6 Unsubscribe handling: a reply containing opt-out intent, or a manual flag, sets lead DO_NOT_CONTACT permanently (tenant-wide, survives re-scraping).

### FR-8 Reply Detection
- FR-8.1 Inbound watcher per connected account (Gmail API watch/polling or IMAP IDLE, 5-min max latency).
- FR-8.2 Match inbound sender/thread to an enrollment; on match: stop the sequence, set enrollment REPLIED, store the reply body.
- FR-8.3 Auto-reply/OOO/delivery-status messages are classified and ignored (bounces mark BOUNCED).
- FR-8.4 On genuine reply: Telegram alert + in-app notification within 1 minute of detection.

### FR-9 Dashboard & Reporting
- FR-9.1 Overview: sends/replies/bounces over time, reply rate, pipeline funnel by status, active campaigns.
- FR-9.2 Lead table: filter/search by status, campaign, city, query; inline edit of notes/status.
- FR-9.3 Reply inbox: list of replied enrollments with reply text and lead context (replies are handled in the user's real mailbox; the app links out).
- FR-9.4 Per-campaign stats: per-step open-in-sequence counts, reply rate per step.
- FR-9.5 Daily metric rollups persisted per tenant for fast charts.

### FR-10 Admin & Audit
- FR-10.1 Activity log: who changed what (campaign edits, key changes, exports, deletes).
- FR-10.2 Data export: leads and messages as CSV.
- FR-10.3 Tenant deletion: soft-delete with 30-day purge.

## 5. Non-Functional Requirements

- NFR-1 **Isolation**: no query may return another tenant's rows; enforced centrally, covered by automated tests.
- NFR-2 **Security**: secrets encrypted at rest; TLS everywhere; OWASP top-10 hygiene; rate limiting on auth endpoints.
- NFR-3 **Reliability**: sending jobs are idempotent (a crashed job never double-sends — send record is written before SMTP dispatch and checked on retry).
- NFR-4 **Scale target (v1)**: 200 tenants, 100k leads/tenant, 5k sends/day platform-wide on a single Postgres + Redis instance.
- NFR-5 **Latency**: dashboard p95 < 500 ms; reply alert < 1 min from mailbox receipt.
- NFR-6 **Observability**: structured logs, per-tenant job metrics, error alerting to platform Telegram/Sentry.
- NFR-7 **Compliance**: honor opt-outs permanently; include sender identity in every email; per-tenant sending caps enforced server-side (tenants cannot exceed them via API).
- NFR-8 **Backups**: nightly Postgres backups, 14-day retention.

## 6. Assumptions & Open Questions

- A-1 Tenants bring their own Apify/Hunter/Anthropic keys (no platform-metered usage) in v1.
- A-2 Billing (Stripe subscriptions, plan limits) is Phase 2; v1 ships with manual account provisioning.
- A-3 Replies are answered in the tenant's own mailbox, not composed in-app (v1).
- Q-1 Should platform provide shared scraping credits as a paid add-on? (Phase 2 decision)
- Q-2 Email warmup: integrate a third-party warmup service or leave to tenants? (Phase 2)
