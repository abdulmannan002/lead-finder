/**
 * Queue names EXACTLY as in docs/03 §4 — do not rename, dashboards and
 * runbooks key on these strings. Only scrape.run is wired in M1; the
 * rest are reserved for their milestones.
 */
export const QUEUE_NAMES = {
  SCRAPE_RUN: 'scrape.run',
  ENRICH_EMAIL: 'enrich.email',
  AI_PERSONALIZE: 'ai.personalize',
  SEND_PLAN: 'send.plan',
  SEND_DISPATCH: 'send.dispatch',
  INBOX_POLL: 'inbox.poll',
  ROLLUP_DAILY: 'rollup.daily',
} as const;
