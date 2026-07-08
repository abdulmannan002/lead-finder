/** Pure template engine for sequence steps (FR-6.2, T-12). */

/** The only variables docs/04 allows in step templates. */
export const ALLOWED_VARIABLES = [
  'company',
  'first_line',
  'city',
  'offer_price', // maps to Campaign.offerText (M3 ruling)
  'signature',
  'invite_link', // MP-7 — per-lead marketplace signup link (docs/07)
] as const;

export type TemplateVariables = Partial<Record<(typeof ALLOWED_VARIABLES)[number], string | null>>;

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** T-12 — every unknown {{variable}} in the template, deduped, in order. */
export function findUnknownVariables(template: string): string[] {
  const allowed = new Set<string>(ALLOWED_VARIABLES);
  const unknown: string[] = [];
  for (const match of template.matchAll(VAR_RE)) {
    const name = match[1];
    if (!allowed.has(name) && !unknown.includes(name)) unknown.push(name);
  }
  return unknown;
}

/** Renders a validated template; missing/null values become empty strings. */
export function renderTemplate(template: string, vars: TemplateVariables): string {
  return template.replace(VAR_RE, (_whole, name: string) => {
    const value = vars[name as keyof TemplateVariables];
    return value ?? '';
  });
}
