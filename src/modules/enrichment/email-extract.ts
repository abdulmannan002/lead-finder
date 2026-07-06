import { EmailConfidence } from '@prisma/client';

/** Pure email extraction + selection (FR-4.1, FR-4.3, FR-4.4). */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Local parts that are role accounts, ranked per FR-4.3 (lower = better). */
const ROLE_RANK: Record<string, number> = {
  sales: 1,
  operations: 2,
  ops: 2,
  info: 3,
  contact: 4,
  hello: 4,
  office: 5,
  admin: 6,
  support: 7,
};

/** Never-usable addresses and hosts (FR-4.1 junk filter). */
const JUNK_LOCAL = /^(noreply|no-reply|donotreply|mailer-daemon|postmaster|abuse|webmaster|privacy|unsubscribe)/i;
const JUNK_HOSTS =
  /(example\.(com|org|net)|sentry\.|wixpress\.com|sentry-next\.|godaddy\.com|placeholder|yourdomain|domain\.com|email\.com|mysite\.com)$/i;
const IMAGE_FALSE_POSITIVE = /\.(png|jpe?g|gif|webp|svg|css|js)$/i;

export function extractEmails(html: string): string[] {
  const found = new Set<string>();
  for (const raw of html.match(EMAIL_RE) ?? []) {
    const email = raw.toLowerCase().replace(/^u00[0-9a-f]{2}/, '');
    if (IMAGE_FALSE_POSITIVE.test(email)) continue;
    if (JUNK_LOCAL.test(email)) continue;
    if (JUNK_HOSTS.test(email.split('@')[1] ?? '')) continue;
    found.add(email);
  }
  return [...found];
}

/** Heuristic: a local part that looks like a person, not a mailbox role. */
export function isPersonalName(local: string): boolean {
  const cleaned = local.replace(/[0-9]+$/, '');
  if (ROLE_RANK[cleaned] !== undefined) return false;
  if (/^(sales|info|ops|operations|contact|hello|office|admin|support|team|mail|enquiries|inquiries|careers|jobs|billing|accounts|marketing|hr)$/i.test(cleaned)) {
    return false;
  }
  // first, first.last, first_last, flast — short alpha tokens
  return /^[a-z]+([._-][a-z]+)?$/i.test(cleaned) && cleaned.length >= 2 && cleaned.length <= 24;
}

export interface PickedEmail {
  email: string;
  confidence: EmailConfidence;
}

/**
 * FR-4.3 priority: personal-name > sales@ > operations@ > info@ > other
 * roles. Same-domain addresses beat off-domain ones at equal rank.
 * Personal-name on the lead's own domain → HIGH confidence (M2 ruling).
 */
export function pickBestEmail(emails: string[], leadDomain: string): PickedEmail | null {
  if (emails.length === 0) return null;

  const scored = emails.map((email) => {
    const [local, host] = email.split('@');
    const sameDomain = host === leadDomain || host?.endsWith(`.${leadDomain}`);
    const personal = isPersonalName(local);
    const roleRank = ROLE_RANK[local.replace(/[0-9]+$/, '')] ?? 8;
    return {
      email,
      personal,
      sameDomain,
      // personal beats every role; then FR-4.3 role order; then same-domain
      score: (personal ? 0 : roleRank * 10) + (sameDomain ? 0 : 1),
    };
  });
  scored.sort((a, b) => a.score - b.score);

  const best = scored[0];
  return {
    email: best.email,
    confidence:
      best.personal && best.sameDomain ? EmailConfidence.HIGH : EmailConfidence.LOW,
  };
}
