# SignX Reach — API Specification (v1)

Base: `/api/v1` · Auth: `Authorization: Bearer <JWT>` · All responses JSON. Errors: `{ "error": { "code", "message", "details?" } }`. Pagination: `?page=&limit=` → `{ data, meta: { total, page, limit } }`. All list endpoints support `?sort=` and field filters noted below.

## Auth
| Method | Path | Notes |
|---|---|---|
| POST | /auth/signup | { email, password, tenantName } → creates global User + Tenant + OWNER membership; 409 if email already registered |
| POST | /auth/login | → { accessToken, refreshToken } (refresh tokens DB-backed, rotating, bound to active tenant) |
| POST | /auth/refresh | rotates the refresh token |
| POST | /auth/switch-tenant | { tenantId } → verifies membership, issues new token pair for that workspace |
| POST | /auth/invite | Owner/Admin; { email, role } → invite mail; invitation role becomes the membership role |
| POST | /auth/accept-invite | { token, password? } — password omitted when the invitee already has an account (membership is just added) |
| POST | /auth/2fa/enable · /auth/2fa/verify | TOTP |

## Tenant & Users
| Method | Path | Notes |
|---|---|---|
| GET/PATCH | /tenant | settings incl. sendingEnabled (kill switch), timezone |
| POST | /tenants | create an additional workspace; caller becomes its OWNER |
| GET | /me/tenants | caller's memberships: tenant name, slug, role |
| GET | /tenant/users | members of the active tenant (via memberships) |
| PATCH | /tenant/users/:id | role change (Owner) — updates the membership |
| DELETE | /tenant/users/:id | removes the membership (not the global user) |

## Integrations
| Method | Path | Notes |
|---|---|---|
| GET | /integrations | kinds + status + last4 of key |
| PUT | /integrations/:kind | { key, config? } → validates with test call |
| DELETE | /integrations/:kind | |
| GET | /email-accounts | |
| POST | /email-accounts/smtp | { address, host, port, user, pass, fromName, signature, dailyCap } → test connection |
| GET | /email-accounts/gmail/oauth-url → callback /email-accounts/gmail/callback | OAuth flow |
| PATCH | /email-accounts/:id | cap, signature, status |
| POST | /email-accounts/:id/test | sends test mail to self |

## Sourcing
| Method | Path | Notes |
|---|---|---|
| GET/POST | /queries | filter: status, city |
| PATCH/DELETE | /queries/:id | |
| POST | /queries/:id/run | manual trigger → { runId } |
| GET | /runs/:id | status, found, duplicates |
| POST | /leads/import | multipart CSV + column mapping |

## Leads
| Method | Path | Notes |
|---|---|---|
| GET | /leads | filters: status, city, category, campaignId, q (search), hasEmail |
| GET/PATCH | /leads/:id | edit notes, firstLine, status (incl. DO_NOT_CONTACT) |
| POST | /leads/:id/enrich | re-run email finder |
| POST | /leads/:id/personalize | re-run AI opener |
| POST | /leads/bulk | { ids, action: archive/do_not_contact/enroll, campaignId? } |
| GET | /leads/export | CSV, same filters |

## Campaigns
| Method | Path | Notes |
|---|---|---|
| GET/POST | /campaigns | |
| GET/PATCH/DELETE | /campaigns/:id | status transitions: DRAFT→ACTIVE→PAUSED |
| PUT | /campaigns/:id/steps | full ordered array of steps (subjectTpl, bodyTpl, delayDays, threaded) |
| POST | /campaigns/:id/enroll | { leadIds } or { filter } → { enrolled, skipped[reason] } |
| GET | /campaigns/:id/enrollments | filter: status |
| POST | /enrollments/:id/stop | manual stop |
| GET | /campaigns/:id/stats | per-step sent/replies, reply rate |
| POST | /campaigns/:id/test-send | renders step 1 for a sample lead → sends to own address |

## Messages & Replies
| Method | Path | Notes |
|---|---|---|
| GET | /messages | filter: direction, status, enrollmentId, campaignId |
| GET | /replies | enrollments status=REPLIED, newest first, with lead context |
| PATCH | /replies/:enrollmentId | mark handled, outcome: call-booked/won/lost + note |

## Metrics & Dashboard
| Method | Path | Notes |
|---|---|---|
| GET | /metrics/daily?from=&to= | rollup rows |
| GET | /metrics/overview | scorecards: pipeline counts by status, 30-day reply rate |
| GET | /metrics/funnel | lead → enrolled → sent → replied → won counts |

## Notifications & Audit
| Method | Path | Notes |
|---|---|---|
| GET | /notifications | in-app feed |
| PUT | /integrations/TELEGRAM | { botToken, chatId } (same vault as other keys) |
| GET | /audit | Owner/Admin; filter: userId, action, date range |

## Webhooks (inbound to platform)
| Method | Path | Notes |
|---|---|---|
| POST | /webhooks/gmail | Gmail push notifications (per-account watch), HMAC/JWT verified |

## Conventions
- Idempotency: POST endpoints that trigger jobs accept `Idempotency-Key` header.
- Template variables validated on save: unknown {{var}} → 422 with the offending variable named.
- All destructive endpoints require role ≥ ADMIN; tenant deletion requires OWNER + password re-entry.
