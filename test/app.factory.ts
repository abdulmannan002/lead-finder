import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/filters/validation-exception.factory';
import { MailService } from '../src/common/mail/mail.service';
import { INTEGRATIONS_FETCH } from '../src/modules/integrations/key-validators';
import { SCRAPE_RUN_QUEUE } from '../src/common/queues/queues.module';

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

/** Boots the app exactly like main.ts, with mail, HTTP and queues stubbed. */
export async function createApp(): Promise<{
  app: INestApplication;
  outbox: SentMail[];
  queued: EnqueuedJob[];
}> {
  const outbox: SentMail[] = [];
  const queued: EnqueuedJob[] = [];

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
    .useValue({
      add: async (name: string, data: any, opts?: { jobId?: string }) => {
        queued.push({ name, data, opts });
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, outbox, queued };
}

export function inviteTokenFrom(mail: SentMail): string {
  const url = new URL(mail.link);
  return url.searchParams.get('token') ?? '';
}
