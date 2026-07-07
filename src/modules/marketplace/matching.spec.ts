import { matchScore } from './matching';

const provider = {
  category: 'software development',
  services: ['pos systems', 'inventory software', 'web apps'],
  city: 'Lahore',
};

const request = (overrides = {}) => ({
  category: 'software development',
  title: 'Need a POS system for my retail store',
  description: 'Retail store in Lahore needs POS Systems with inventory software support.',
  city: 'Lahore',
  remoteOk: true,
  ...overrides,
});

describe('matchScore (MP-4)', () => {
  it('scores category + service keywords + same city', () => {
    // category 3 + 'pos systems' 1 + 'inventory software' 1 + city 1 = 6
    expect(matchScore(provider, request())).toBe(6);
  });

  it('matches on services even across categories', () => {
    const score = matchScore(provider, request({ category: 'retail' }));
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(6);
  });

  it('returns 0 with no relevance at all', () => {
    expect(
      matchScore(provider, request({ category: 'catering', title: 'Wedding food', description: 'Need biryani for 500 guests' })),
    ).toBe(0);
  });

  it('local-only requests exclude out-of-town providers', () => {
    expect(
      matchScore({ ...provider, city: 'Karachi' }, request({ remoteOk: false })),
    ).toBe(0);
    expect(matchScore(provider, request({ remoteOk: false }))).toBeGreaterThan(0);
  });

  it('short service tokens never match noise', () => {
    expect(
      matchScore(
        { category: 'retail', services: ['it'], city: null },
        request({ category: 'catering', description: 'quality items with itemized bills' }),
      ),
    ).toBe(0);
  });
});
