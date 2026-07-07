import { findUnknownVariables, renderTemplate } from './template';

describe('findUnknownVariables (T-12)', () => {
  it('accepts every documented variable', () => {
    const tpl =
      'Hi {{company}} — {{first_line}} We work with teams in {{city}} from {{offer_price}}.\n{{signature}}';
    expect(findUnknownVariables(tpl)).toEqual([]);
  });

  it('names unknown variables, deduped, in order', () => {
    expect(
      findUnknownVariables('Hello {{first_name}}, {{company}} {{first_name}} {{pricee}}'),
    ).toEqual(['first_name', 'pricee']);
  });

  it('tolerates whitespace inside the braces', () => {
    expect(findUnknownVariables('{{ company }} {{ nope }}')).toEqual(['nope']);
  });

  it('ignores non-variable braces', () => {
    expect(findUnknownVariables('code sample: {notAVar} and {{}}')).toEqual([]);
  });
});

describe('renderTemplate', () => {
  const vars = {
    company: 'Acme Logistics',
    first_line: 'Impressed by your cold-chain fleet.',
    city: 'Lahore',
    offer_price: 'PKR 50k/month',
    signature: 'Best,\nSara',
  };

  it('substitutes all variables', () => {
    expect(
      renderTemplate('Hi {{company}} in {{ city }} — {{first_line}} ({{offer_price}})\n{{signature}}', vars),
    ).toBe(
      'Hi Acme Logistics in Lahore — Impressed by your cold-chain fleet. (PKR 50k/month)\nBest,\nSara',
    );
  });

  it('renders missing/null values as empty strings', () => {
    expect(renderTemplate('{{company}}|{{city}}', { company: 'X', city: null })).toBe('X|');
    expect(renderTemplate('{{signature}}', {})).toBe('');
  });
});
