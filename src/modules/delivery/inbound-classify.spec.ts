import { classifyInbound, hasOptOutIntent, InboundMessage, threadIds } from './inbound-classify';

function mail(overrides: Partial<InboundMessage>): InboundMessage {
  return {
    from: 'someone@example.pk',
    subject: 'Re: Quick question',
    messageId: '<in-1@example.pk>',
    inReplyTo: null,
    references: [],
    headers: {},
    contentType: null,
    text: 'Sounds interesting, tell me more.',
    ...overrides,
  };
}

describe('classifyInbound (FR-8.3)', () => {
  it('a normal reply is a reply', () => {
    expect(classifyInbound(mail({}))).toBe('reply');
  });

  it.each([
    mail({ from: 'mailer-daemon@mx.example.pk' }),
    mail({ from: 'postmaster@example.pk' }),
    mail({ subject: 'Undeliverable: Quick question' }),
    mail({ subject: 'Mail delivery failed: returning message to sender' }),
    mail({ contentType: 'multipart/report; report-type=delivery-status' }),
  ])('bounces are detected (T-8) — %#', (m) => {
    expect(classifyInbound(m)).toBe('bounce');
  });

  it.each([
    mail({ headers: { 'auto-submitted': 'auto-replied' } }),
    mail({ headers: { 'x-autoreply': 'yes' } }),
    mail({ headers: { precedence: 'auto_reply' } }),
    mail({ subject: 'Automatic reply: Quick question' }),
    mail({ subject: 'Out of Office — back Monday' }),
  ])('auto-replies are detected (T-7) — %#', (m) => {
    expect(classifyInbound(m)).toBe('auto');
  });

  it('Auto-Submitted: no is NOT an auto-reply', () => {
    expect(classifyInbound(mail({ headers: { 'auto-submitted': 'no' } }))).toBe('reply');
  });
});

describe('hasOptOutIntent (FR-7.6)', () => {
  it.each([
    'Please unsubscribe me.',
    'Remove me from your list.',
    'Stop emailing me!',
    'Take me off this list',
    'I want to opt out',
  ])('detects "%s"', (text) => {
    expect(hasOptOutIntent(text)).toBe(true);
  });

  it.each([
    'Sounds interesting, tell me more.',
    'We already stopped working with vendors this year, but call me in June.',
    'What does it cost?',
  ])('does not trip on "%s"', (text) => {
    expect(hasOptOutIntent(text)).toBe(false);
  });
});

describe('threadIds', () => {
  it('merges in-reply-to and references, deduped', () => {
    const ids = threadIds(
      mail({ inReplyTo: '<a@x>', references: ['<root@x>', '<a@x>'] }),
    );
    expect(ids.sort()).toEqual(['<a@x>', '<root@x>'].sort());
  });
});
