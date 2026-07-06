import { Inject, Injectable, Optional } from '@nestjs/common';

/** Injection token so tests can stub lead-site HTTP. */
export const ENRICHMENT_FETCH = 'ENRICHMENT_FETCH';

/** FR-4.1 — pages checked for contact emails. */
const PATHS = ['/', '/contact', '/about'];
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;

@Injectable()
export class SiteScraper {
  private readonly fetchImpl: typeof fetch;

  constructor(@Optional() @Inject(ENRICHMENT_FETCH) fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** Fetches home + /contact + /about; unreachable pages yield ''. */
  async fetchPages(domain: string): Promise<string[]> {
    return Promise.all(PATHS.map((p) => this.fetchPage(`https://${domain}${p}`)));
  }

  /** Homepage text for the AI personalizer (FR-5.1). */
  async fetchHomepage(domain: string): Promise<string> {
    return this.fetchPage(`https://${domain}/`);
  }

  private async fetchPage(url: string): Promise<string> {
    try {
      const res = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SignXReach/1.0)' },
        redirect: 'follow',
      });
      if (!res.ok) return '';
      const text = await res.text();
      return text.slice(0, MAX_BYTES);
    } catch {
      return ''; // dead page ≠ dead lead; other pages may still work
    }
  }
}

/** Crude HTML → text for prompt input (FR-5.1: ~1,500 chars). */
export function htmlToText(html: string, maxChars = 1_500): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|quot|#39|lt|gt);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}
