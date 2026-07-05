import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/filters/validation-exception.factory';
import { MailService } from '../src/common/mail/mail.service';

export interface SentMail {
  to: string;
  link: string;
}

/** Boots the app exactly like main.ts, with mail captured in memory. */
export async function createApp(): Promise<{ app: INestApplication; outbox: SentMail[] }> {
  const outbox: SentMail[] = [];

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue({
      sendInvite: async (to: string, _tenant: string, _role: string, link: string) => {
        outbox.push({ to, link });
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
  return { app, outbox };
}

export function inviteTokenFrom(mail: SentMail): string {
  const url = new URL(mail.link);
  return url.searchParams.get('token') ?? '';
}
