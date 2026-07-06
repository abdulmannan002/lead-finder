/** Pure normalization from Apify Google-Maps items to Lead fields (FR-3.3). */

export interface NormalizedLead {
  company: string;
  websiteDomain: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  category: string | null;
}

/** FR-3.4 dedupe key: lowercase hostname without the www prefix. */
export function normalizeDomain(website: unknown): string | null {
  if (typeof website !== 'string' || website.trim() === '') return null;
  try {
    const url = new URL(website.includes('://') ? website : `https://${website}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

export function normalizeItem(item: Record<string, unknown>, fallbackCity: string): NormalizedLead {
  const emails = Array.isArray(item.emails) ? (item.emails as unknown[]) : [];
  const email = [emails[0], item.email].find((e) => typeof e === 'string' && e.includes('@'));
  return {
    company: String(item.title ?? item.name ?? 'Unknown').slice(0, 200),
    websiteDomain: normalizeDomain(item.website ?? item.url ?? null),
    email: (email as string | undefined) ?? null,
    phone: typeof item.phone === 'string' ? item.phone : null,
    city: typeof item.city === 'string' && item.city ? item.city : fallbackCity,
    category: typeof item.categoryName === 'string' ? item.categoryName : null,
  };
}
