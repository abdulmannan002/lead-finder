import { buildOpenerPrompt, genericFallback, parseOpener } from './opener';

const CTX = { category: 'Logistics service', city: 'Lahore' };

describe('buildOpenerPrompt (FR-5.1)', () => {
  it('includes company, city, category and homepage text', () => {
    const prompt = buildOpenerPrompt({
      company: 'Acme Logistics',
      city: 'Lahore',
      category: 'Logistics service',
      homepageText: 'We move freight across Punjab since 1995.',
    });
    expect(prompt).toContain('Acme Logistics');
    expect(prompt).toContain('Lahore');
    expect(prompt).toContain('We move freight across Punjab');
    expect(prompt).toContain('GENERIC');
  });

  it('omits missing fields without leaving holes', () => {
    const prompt = buildOpenerPrompt({
      company: 'X',
      city: null,
      category: null,
      homepageText: '',
    });
    expect(prompt).not.toContain('City:');
    expect(prompt).not.toContain('Category:');
    expect(prompt).toContain('(empty)');
  });
});

describe('parseOpener (FR-5.2 fallback rules)', () => {
  it('accepts a clean short line and strips wrapping quotes', () => {
    const { opener, generic } = parseOpener(
      '"Impressed by your 25-year freight record across Punjab."',
      CTX,
    );
    expect(generic).toBe(false);
    expect(opener).toBe('Impressed by your 25-year freight record across Punjab.');
  });

  it('GENERIC marker → template fallback', () => {
    const { opener, generic } = parseOpener('GENERIC', CTX);
    expect(generic).toBe(true);
    expect(opener).toBe(genericFallback(CTX));
    expect(opener).toContain('Lahore');
    expect(opener.split(/\s+/).length).toBeLessThanOrEqual(25);
  });

  it('empty output → fallback', () => {
    expect(parseOpener('   ', CTX).generic).toBe(true);
  });

  it('rambling output (over the word cap) → fallback', () => {
    const rambling = Array(50).fill('word').join(' ');
    expect(parseOpener(rambling, CTX).generic).toBe(true);
  });

  it('multiline output → fallback', () => {
    expect(parseOpener('Line one.\nLine two.', CTX).generic).toBe(true);
  });

  it('fallback works without a city or category', () => {
    const { opener } = parseOpener('GENERIC', { category: null, city: null });
    expect(opener).toContain('business');
  });
});
