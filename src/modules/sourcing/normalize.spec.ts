import { normalizeDomain, normalizeItem } from './normalize';

describe('normalizeDomain (FR-3.4 dedupe key)', () => {
  it.each([
    ['https://www.acme.com/contact', 'acme.com'],
    ['http://Acme.COM', 'acme.com'],
    ['acme.com', 'acme.com'],
    ['https://shop.acme.co.uk/path?q=1', 'shop.acme.co.uk'],
    ['www.acme.io', 'acme.io'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['   '], ['not a url at all'], ['localhost'], [42]])(
    'rejects %p',
    (input) => {
      expect(normalizeDomain(input)).toBeNull();
    },
  );
});

describe('normalizeItem (FR-3.3)', () => {
  it('maps an Apify Google-Maps item', () => {
    const lead = normalizeItem(
      {
        title: 'Acme Logistics',
        website: 'https://www.acme-logistics.com',
        phone: '+92 300 1234567',
        city: 'Lahore',
        categoryName: 'Logistics service',
        emails: ['info@acme-logistics.com'],
      },
      'Karachi',
    );
    expect(lead).toEqual({
      company: 'Acme Logistics',
      websiteDomain: 'acme-logistics.com',
      email: 'info@acme-logistics.com',
      phone: '+92 300 1234567',
      city: 'Lahore',
      category: 'Logistics service',
    });
  });

  it('falls back to the query city and tolerates missing fields', () => {
    const lead = normalizeItem({ title: 'Bare Minimum' }, 'Multan');
    expect(lead.city).toBe('Multan');
    expect(lead.websiteDomain).toBeNull();
    expect(lead.email).toBeNull();
  });

  it('ignores non-email strings in the emails field', () => {
    const lead = normalizeItem({ title: 'X', emails: ['not-an-email'] }, 'Lahore');
    expect(lead.email).toBeNull();
  });
});
