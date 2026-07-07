/** Pure inbound-mail classification (FR-8.3, T-7/T-8) and opt-out intent (FR-7.6). */

export interface InboundMessage {
  /** Bare sender address, lowercased. */
  from: string;
  subject: string;
  /** Message-Id of this inbound mail (for the stored row). */
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  /** Lowercased header map (only the ones we care about). */
  headers: Record<string, string>;
  contentType: string | null;
  text: string;
}

export type InboundKind = 'reply' | 'auto' | 'bounce';

const BOUNCE_SENDER = /^(mailer-daemon|postmaster)@/i;
const BOUNCE_SUBJECT =
  /(undeliver|delivery (status|failure)|returned mail|failure notice|mail delivery failed)/i;
const AUTO_SUBJECT =
  /\b(out of (the )?office|automatic reply|auto[- ]?reply|autoreply|vacation|abwesenheit)\b/i;

/** FR-8.3 — bounces and auto-replies must never count as genuine replies. */
export function classifyInbound(mail: InboundMessage): InboundKind {
  if (
    BOUNCE_SENDER.test(mail.from) ||
    (mail.contentType ?? '').includes('report') ||
    (mail.headers['content-type'] ?? '').includes('delivery-status') ||
    BOUNCE_SUBJECT.test(mail.subject)
  ) {
    return 'bounce';
  }

  const autoSubmitted = mail.headers['auto-submitted'];
  if (
    (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') ||
    'x-autoreply' in mail.headers ||
    'x-autorespond' in mail.headers ||
    /^(auto_reply|auto-reply)$/i.test(mail.headers['precedence'] ?? '') ||
    AUTO_SUBJECT.test(mail.subject)
  ) {
    return 'auto';
  }

  return 'reply';
}

const OPT_OUT =
  /\b(unsubscribe|opt[ -]?out|remove me from|stop (emailing|contacting|sending)|do not (contact|email) (me|us)|take me off)\b/i;

/** FR-7.6 — conservative opt-out intent; a match suppresses the lead forever. */
export function hasOptOutIntent(text: string): boolean {
  return OPT_OUT.test(text);
}

/** Every provider message-id this mail claims to descend from. */
export function threadIds(mail: InboundMessage): string[] {
  const ids = new Set<string>();
  if (mail.inReplyTo) ids.add(mail.inReplyTo);
  for (const ref of mail.references) ids.add(ref);
  return [...ids];
}
