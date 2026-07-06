/** Pure helpers for AI opener generation (FR-5.1, FR-5.2). */

/** The model returns this literal when the site is too thin to personalize. */
export const GENERIC_MARKER = 'GENERIC';

const MAX_WORDS = 25;
/** Tolerance before we distrust the model output and fall back. */
const HARD_WORD_CAP = 32;

export function buildOpenerPrompt(input: {
  company: string;
  city: string | null;
  category: string | null;
  homepageText: string;
}): string {
  return [
    `You write one personalized cold-email opening line (max ${MAX_WORDS} words).`,
    `It must reference something concrete and specific about this business from their homepage text.`,
    `No greetings, no flattery filler, no quotes around the line. Just the line itself.`,
    `If the homepage text is too thin or generic to say anything specific, reply with exactly ${GENERIC_MARKER} and nothing else.`,
    ``,
    `Business: ${input.company}`,
    input.category ? `Category: ${input.category}` : null,
    input.city ? `City: ${input.city}` : null,
    ``,
    `Homepage text:`,
    input.homepageText || '(empty)',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/** FR-5.2 — template line from city/category when the site is thin. */
export function genericFallback(input: { category: string | null; city: string | null }): string {
  const what = input.category?.toLowerCase() ?? 'business';
  return input.city
    ? `Came across your ${what} while looking at companies in ${input.city}.`
    : `Came across your ${what} while researching companies in your space.`;
}

/**
 * Normalizes the model output: strips wrapping quotes/whitespace, detects the
 * GENERIC marker, and rejects rambling output (falls back to the template).
 */
export function parseOpener(
  raw: string,
  fallbackInput: { category: string | null; city: string | null },
): { opener: string; generic: boolean } {
  const cleaned = raw.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (!cleaned || cleaned.toUpperCase().startsWith(GENERIC_MARKER)) {
    return { opener: genericFallback(fallbackInput), generic: true };
  }
  if (cleaned.split(/\s+/).length > HARD_WORD_CAP || cleaned.includes('\n')) {
    return { opener: genericFallback(fallbackInput), generic: true };
  }
  return { opener: cleaned, generic: false };
}
