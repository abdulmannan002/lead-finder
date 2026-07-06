import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/filters/validation-exception.factory';
import { MailService } from '../src/common/mail/mail.service';
import { INTEGRATIONS_FETCH } from '../src/modules/integrations/key-validators';
import { SOURCING_FETCH } from '../src/modules/sourcing/apify.client';
import { ENRICHMENT_FETCH } from '../src/modules/enrichment/site-scraper';
import { InMemoryQuotaCounter, QUOTA_COUNTER } from '../src/common/counters/quota-counter';
import {
  AI_PERSONALIZE_QUEUE,
  ENRICH_EMAIL_QUEUE,
  SCRAPE_RUN_QUEUE,
} from '../src/common/queues/queues.module';

export interface SentMail {
  to: string;
  link: string;
}

export interface EnqueuedJob {
  name: string;
  data: any;
  opts?: { jobId?: string };
}

/**
 * Outbound-HTTP stub for key validation: any key containing "bad" is
 * rejected, everything else validates. No real provider is ever called.
 */
const fakeProviderFetch = (async (url: any, init: any) => {
  const target = String(url);
  const headerKey = init?.headers?.['x-api-key'] ?? '';
  const bad = target.includes('bad') || String(headerKey).includes('bad');
  return {
    ok: !bad,
    status: bad ? 401 : 200,
    json: async () => ({ ok: !bad }),
  } as Response;
}) as typeof fetch;

/**
 * Fake Apify: start-run → poll (SUCCEEDED immediately) → dataset items
 * from the mutable holder the test controls.
 */
function fakeApifyFetch(dataset: { items: unknown[]; failRun?: boolean }): typeof fetch {
  return (async (url: any) => {
    const target = String(url);
    let body: unknown;
    if (target.includes('/acts/')) {
      body = { data: { id: 'fake-apify-run', defaultDatasetId: 'fake-dataset' } };
    } else if (target.includes('/actor-runs/')) {
      body = {
        data: { status: dataset.failRun ? 'FAILED' : 'SUCCEEDED', defaultDatasetId: 'fake-dataset' },
      };
    } else if (target.includes('/datasets/')) {
      body = dataset.items;
    } else {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
}

export interface FakeWeb {
  /** '<host><path>' (e.g. 'acme.com/contact') → HTML body. Missing = dead page. */
  pages: Record<string, string>;
  /** Hunter domain-search emails returned for any domain. */
  hunterEmails: { value: string; confidence: number; type: string }[];
}

/** Lead-site + Hunter stub for the enrichment pipeline. */
function fakeEnrichmentFetch(web: FakeWeb): typeof fetch {
  return (async (url: any) => {
    const target = new URL(String(url));
    if (target.hostname === 'api.hunter.io') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { emails: web.hunterEmails } }),
      } as Response;
    }
    const key = `${target.hostname}${target.pathname === '/' ? '/' : target.pathname}`;
    const html = web.pages[key];
    return {
      ok: html !== undefined,
      status: html !== undefined ? 200 : 404,
      text: async () => html ?? '',
      json: async () => ({}),
    } as Response;
  }) as typeof fetch;
}

/** Boots the app exactly like main.ts, with mail, HTTP and queues stubbed. */
export async function createApp(): Promise<{
  app: INestApplication;
  outbox: SentMail[];
  queued: EnqueuedJob[];
  enrichQueued: EnqueuedJob[];
  personalizeQueued: EnqueuedJob[];
  apifyDataset: { items: unknown[]; failRun?: boolean };
  fakeWeb: FakeWeb;
}> {
  const outbox: SentMail[] = [];
  const queued: EnqueuedJob[] = [];
  const enrichQueued: EnqueuedJob[] = [];
  const personalizeQueued: EnqueuedJob[] = [];
  const apifyDataset: { items: unknown[]; failRun?: boolean } = { items: [] };
  const fakeWeb: FakeWeb = { pages: {}, hunterEmails: [] };

  const record = (sink: EnqueuedJob[]) => ({
    add: async (name: string, data: any, opts?: { jobId?: string }) => {
      sink.push({ name, data, opts });
    },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue({
      sendInvite: async (to: string, _tenant: string, _role: string, link: string) => {
        outbox.push({ to, link });
      },
    })
    .overrideProvider(INTEGRATIONS_FETCH)
    .useValue(fakeProviderFetch)
    .overrideProvider(SCRAPE_RUN_QUEUE)
    .useValue(record(queued))
    .overrideProvider(ENRICH_EMAIL_QUEUE)
    .useValue(record(enrichQueued))
    .overrideProvider(AI_PERSONALIZE_QUEUE)
    .useValue(record(personalizeQueued))
    .overrideProvider(SOURCING_FETCH)
    .useValue(fakeApifyFetch(apifyDataset))
    .overrideProvider(ENRICHMENT_FETCH)
    .useValue(fakeEnrichmentFetch(fakeWeb))
    .overrideProvider(QUOTA_COUNTER)
    .useValue(new InMemoryQuotaCounter())
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, outbox, queued, enrichQueued, personalizeQueued, apifyDataset, fakeWeb };
}

export function inviteTokenFrom(mail: SentMail): string {
  const url = new URL(mail.link);
  return url.searchParams.get('token') ?? '';
}
