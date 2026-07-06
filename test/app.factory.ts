import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/filters/validation-exception.factory';
import { MailService } from '../src/common/mail/mail.service';
import { INTEGRATIONS_FETCH } from '../src/modules/integrations/key-validators';

export interface SentMail {
  to: string;
  link: string;
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

/** Boots the app exactly like main.ts, with mail + provider HTTP stubbed. */
export async function createApp(): Promise<{ app: INestApplication; outbox: SentMail[] }> {
  const outbox: SentMail[] = [];

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue({
      sendInvite: async (to: string, _tenant: string, _role: string, link: string) => {
        outbox.push({ to, link });
      },
    })
    .overrideProvider(INTEGRATIONS_FETCH)
    .useValue(fakeProviderFetch)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, outbox };
}

export function inviteTokenFrom(mail: SentMail): string {
  const url = new URL(mail.link);
  return url.searchParams.get('token') ?? '';
}
