import { extractEmails, isPersonalName, pickBestEmail } from './email-extract';

describe('extractEmails (FR-4.1)', () => {
  it('finds emails in HTML and mailto links, deduped and lowercased', () => {
    const html = `
      <p>Reach us at Info@Acme.com or <a href="mailto:sales@acme.com">sales</a></p>
      <span>info@acme.com</span>`;
    expect(extractEmails(html).sort()).toEqual(['info@acme.com', 'sales@acme.com']);
  });

  it('filters junk locals, junk hosts and image false positives', () => {
    const html = `
      noreply@acme.com donotreply@acme.com postmaster@acme.com
      someone@example.com user@yourdomain.com hero@2x.png logo@3x.jpeg
      real.person@acme.com`;
    expect(extractEmails(html)).toEqual(['real.person@acme.com']);
  });

  it('returns empty for email-free pages', () => {
    expect(extractEmails('<html><body>Call us!</body></html>')).toEqual([]);
  });
});

describe('isPersonalName', () => {
  it.each(['ahmed', 'jane.doe', 'j_smith', 'omar-khan'])('%s → personal', (local) => {
    expect(isPersonalName(local)).toBe(true);
  });

  it.each(['sales', 'info', 'operations', 'support', 'hr', 'contact', 'hello'])(
    '%s → role',
    (local) => {
      expect(isPersonalName(local)).toBe(false);
    },
  );
});

describe('pickBestEmail (FR-4.3 priority, FR-4.4 confidence)', () => {
  it('personal-name beats every role account', () => {
    const picked = pickBestEmail(['info@acme.com', 'ahmed@acme.com', 'sales@acme.com'], 'acme.com');
    expect(picked).toEqual({ email: 'ahmed@acme.com', confidence: 'HIGH' });
  });

  it('role order: sales > operations > info', () => {
    expect(pickBestEmail(['info@acme.com', 'operations@acme.com'], 'acme.com')?.email).toBe(
      'operations@acme.com',
    );
    expect(pickBestEmail(['info@acme.com', 'sales@acme.com'], 'acme.com')?.email).toBe(
      'sales@acme.com',
    );
  });

  it('role accounts are LOW confidence', () => {
    expect(pickBestEmail(['sales@acme.com'], 'acme.com')?.confidence).toBe('LOW');
  });

  it('same-domain wins over off-domain at equal rank; off-domain personal is LOW', () => {
    expect(pickBestEmail(['info@gmail.com', 'info@acme.com'], 'acme.com')?.email).toBe(
      'info@acme.com',
    );
    expect(pickBestEmail(['jane@gmail.com'], 'acme.com')).toEqual({
      email: 'jane@gmail.com',
      confidence: 'LOW',
    });
  });

  it('returns null for an empty list', () => {
    expect(pickBestEmail([], 'acme.com')).toBeNull();
  });
});
