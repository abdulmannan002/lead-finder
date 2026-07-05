-- Partial indexes from docs/02 §3 — Prisma cannot express these, so they
-- live in this hand-written migration. Do not drop them when squashing.

-- Sender hot query: send.plan selects enrollments
-- WHERE status IN ('QUEUED','ACTIVE') AND nextDueAt <= now
CREATE INDEX "Enrollment_due_partial_idx"
  ON "Enrollment" ("status", "nextDueAt")
  WHERE "status" IN ('QUEUED', 'ACTIVE');

-- FR-6.4: a lead can be active in at most one campaign at a time.
CREATE UNIQUE INDEX "Enrollment_one_active_per_lead_key"
  ON "Enrollment" ("leadId")
  WHERE "status" IN ('QUEUED', 'ACTIVE');
