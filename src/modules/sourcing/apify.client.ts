import { Inject, Injectable, Optional } from '@nestjs/common';

/** Injection token so tests can stub Apify's HTTP API. */
export const SOURCING_FETCH = 'SOURCING_FETCH';

/** Approved default actor (M1 ruling); overridable via integration config.actorId. */
export const DEFAULT_ACTOR_ID = 'compass~crawler-google-places';

const API = 'https://api.apify.com/v2';
const POLL_MS = 5_000;
const MAX_POLLS = 120; // ~10 minutes

export interface ApifyRunResult {
  apifyRunId: string;
  items: Record<string, unknown>[];
}

@Injectable()
export class ApifyClient {
  private readonly fetchImpl: typeof fetch;

  constructor(@Optional() @Inject(SOURCING_FETCH) fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** Starts the actor, polls to completion, returns the dataset items. */
  async runActor(
    token: string,
    actorId: string,
    input: Record<string, unknown>,
  ): Promise<ApifyRunResult> {
    const started = await this.json<{ data: { id: string; defaultDatasetId: string } }>(
      `${API}/acts/${actorId}/runs?token=${encodeURIComponent(token)}`,
      { method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } },
    );
    const apifyRunId = started.data.id;
    let datasetId = started.data.defaultDatasetId;

    for (let i = 0; i < MAX_POLLS; i++) {
      const run = await this.json<{ data: { status: string; defaultDatasetId: string } }>(
        `${API}/actor-runs/${apifyRunId}?token=${encodeURIComponent(token)}`,
      );
      datasetId = run.data.defaultDatasetId ?? datasetId;
      const status = run.data.status;
      if (status === 'SUCCEEDED') {
        const items = await this.json<Record<string, unknown>[]>(
          `${API}/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true&format=json`,
        );
        return { apifyRunId, items };
      }
      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
        throw new Error(`Apify run ${apifyRunId} ended ${status}`);
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw new Error(`Apify run ${apifyRunId} did not finish within the polling budget`);
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(url, init);
    if (!res.ok) throw new Error(`Apify API ${res.status} for ${url.split('?')[0]}`);
    return (await res.json()) as T;
  }
}
