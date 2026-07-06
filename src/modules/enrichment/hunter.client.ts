import { Inject, Injectable, Optional } from '@nestjs/common';
import { ENRICHMENT_FETCH } from './site-scraper';

export interface HunterResult {
  email: string;
  /** Hunter's 0–100 confidence score. */
  score: number;
}

/** FR-4.2 — Hunter.io domain search with the tenant's key. */
@Injectable()
export class HunterClient {
  private readonly fetchImpl: typeof fetch;

  constructor(@Optional() @Inject(ENRICHMENT_FETCH) fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async domainSearch(apiKey: string, domain: string): Promise<HunterResult | null> {
    const res = await this.fetchImpl(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(apiKey)}&limit=5`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`Hunter answered ${res.status}`);
    const body = (await res.json()) as {
      data?: { emails?: { value: string; confidence: number; type: string }[] };
    };
    const emails = body.data?.emails ?? [];
    if (emails.length === 0) return null;
    // Personal beats generic at equal confidence, mirroring FR-4.3.
    const ranked = [...emails].sort(
      (a, b) => b.confidence - a.confidence || (a.type === 'personal' ? -1 : 1),
    );
    return { email: ranked[0].value.toLowerCase(), score: ranked[0].confidence };
  }
}
