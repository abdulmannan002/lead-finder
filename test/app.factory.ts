import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/filters/validation-exception.factory';
import { MailService } from '../src/common/mail/mail.service';
import { INTEGRATIONS_FETCH } from '../src/modules/integrations/key-validators';
import { SOURCING_FETCH } from '../src/modules/sourcing/apify.client';
import { ENRICHMENT_FETCH } from '../src/modules/enrichment/site-scraper';
import { ANTHROPIC_CLIENT_FACTORY } from '../src/modules/enrichment/anthropic.client';
import { OutboundMail, SmtpCredentials, SMTP_TRANSPORT_FACTORY } from '../src/modules/integrations/smtp';
import { NOTIFICATIONS_FETCH } from '../src/modules/notifications/telegram.client';
import { INBOX_FETCHER } from '../src/modules/delivery/inbox-fetcher';
import { InboundMessage } from '../src/modules/delivery/inbound-classify';
import { InMemoryQuotaCounter, QUOTA_COUNTER } from '../src/common/counters/quota-counter';
import {
  AI_PERSONALIZE_QUEUE,
  ENRICH_EMAIL_QUEUE,
  SCRAPE_RUN_QUEUE,
  SEND_DISPATCH_QUEUE,
} from '../src/common/queues/queues.module';

export interface SentMail {
  to: string;
  link: string;
}

export interface EnqueuedJob {
  name: string;
  data: any;
  opts?: { jobId?: string; delay?: number };
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

export interface FakeAnthropic {
  /** The model's next reply text (e.g. an opener line or 'GENERIC'). */
  reply: string;
  /** Every call made: the api key + prompt, for assertions. */
  calls: { apiKey: string; prompt: string }[];
}

export interface SentSmtp {
  creds: SmtpCredentials;
  mail: OutboundMail;
  messageId: string;
}

export interface FakeSmtp {
  /** Every mail "delivered" through the fake transport, in order. */
  sent: SentSmtp[];
  /** When set, the next sendMail rejects with this error (then clears). */
  failNextSendWith?: Error & { responseCode?: number };
}

export interface FakeTelegram {
  /** Every alert pushed through the fake Telegram API. */
  sent: { botToken: string; chatId: string; text: string }[];
}

export interface FakeInbox {
  /** Pending messages per account user (creds.user); consumed on fetch. */
  pending: Map<string, InboundMessage[]>;
  /** creds.user values whose next fetch should fail with an auth error. */
  failAuthFor: Set<string>;
  /** Fetch counter per user, drives the fake checkpoint. */
  fetches: number;
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
  dispatchQueued: EnqueuedJob[];
  apifyDataset: { items: unknown[]; failRun?: boolean };
  fakeWeb: FakeWeb;
  fakeAnthropic: FakeAnthropic;
  fakeSmtp: FakeSmtp;
  fakeTelegram: FakeTelegram;
  fakeInbox: FakeInbox;
}> {
  const outbox: SentMail[] = [];
  const queued: EnqueuedJob[] = [];
  const enrichQueued: EnqueuedJob[] = [];
  const personalizeQueued: EnqueuedJob[] = [];
  const dispatchQueued: EnqueuedJob[] = [];
  const apifyDataset: { items: unknown[]; failRun?: boolean } = { items: [] };
  const fakeWeb: FakeWeb = { pages: {}, hunterEmails: [] };
  const fakeAnthropic: FakeAnthropic = { reply: 'GENERIC', calls: [] };
  const fakeSmtp: FakeSmtp = { sent: [] };
  const fakeTelegram: FakeTelegram = { sent: [] };
  const fakeInbox: FakeInbox = { pending: new Map(), failAuthFor: new Set(), fetches: 0 };
  let smtpSeq = 0;

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
    .overrideProvider(SEND_DISPATCH_QUEUE)
    .useValue(record(dispatchQueued))
    .overrideProvider(SOURCING_FETCH)
    .useValue(fakeApifyFetch(apifyDataset))
    .overrideProvider(ENRICHMENT_FETCH)
    .useValue(fakeEnrichmentFetch(fakeWeb))
    .overrideProvider(QUOTA_COUNTER)
    .useValue(new InMemoryQuotaCounter())
    .overrideProvider(INBOX_FETCHER)
    .useValue({
      fetchNew: async (creds: SmtpCredentials, checkpoint: string | null) => {
        if (fakeInbox.failAuthFor.has(creds.user)) {
          fakeInbox.failAuthFor.delete(creds.user);
          throw new Error('Invalid credentials (authentication failed)');
        }
        const messages = fakeInbox.pending.get(creds.user) ?? [];
        fakeInbox.pending.set(creds.user, []);
        fakeInbox.fetches++;
        return {
          messages,
          checkpoint: messages.length > 0 ? `1:${fakeInbox.fetches}` : checkpoint,
        };
      },
    })
    .overrideProvider(NOTIFICATIONS_FETCH)
    .useValue((async (url: any, init: any) => {
      const match = /bot([^/]+)\/sendMessage/.exec(String(url));
      const body = JSON.parse(String(init?.body ?? '{}'));
      fakeTelegram.sent.push({
        botToken: match?.[1] ?? '',
        chatId: String(body.chat_id ?? ''),
        text: String(body.text ?? ''),
      });
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    }) as typeof fetch)
    .overrideProvider(SMTP_TRANSPORT_FACTORY)
    .useValue((creds: SmtpCredentials) => ({
      // Hosts containing "bad" fail verification (bad host/credentials).
      verify: async () => {
        if (creds.host.includes('bad')) throw new Error('535 authentication failed');
        return true as const;
      },
      sendMail: async (mail: OutboundMail) => {
        if (fakeSmtp.failNextSendWith) {
          const err = fakeSmtp.failNextSendWith;
          fakeSmtp.failNextSendWith = undefined;
          throw err;
        }
        const messageId = `<fake-${++smtpSeq}@${creds.host}>`;
        fakeSmtp.sent.push({ creds, mail, messageId });
        return { messageId };
      },
    }))
    .overrideProvider(ANTHROPIC_CLIENT_FACTORY)
    .useValue((apiKey: string) => ({
      messages: {
        create: async (params: { messages: { content: string }[] }) => {
          fakeAnthropic.calls.push({ apiKey, prompt: params.messages[0].content });
          return {
            content: [{ type: 'text', text: fakeAnthropic.reply }],
            usage: { input_tokens: 420, output_tokens: 17 },
          };
        },
      },
    }))
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return {
    app,
    outbox,
    queued,
    enrichQueued,
    personalizeQueued,
    dispatchQueued,
    apifyDataset,
    fakeWeb,
    fakeAnthropic,
    fakeSmtp,
    fakeTelegram,
    fakeInbox,
  };
}

export function inviteTokenFrom(mail: SentMail): string {
  const url = new URL(mail.link);
  return url.searchParams.get('token') ?? '';
}
