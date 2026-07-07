import { Module } from '@nestjs/common';
import { EmailAccountsController } from './email-accounts.controller';
import { EmailAccountsService } from './email-accounts.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { INTEGRATIONS_FETCH, KeyValidators } from './key-validators';
import { realSmtpTransportFactory, SMTP_TRANSPORT_FACTORY } from './smtp';

// key vault (encrypt/validate) + email account connect (docs/03 §3)
@Module({
  controllers: [IntegrationsController, EmailAccountsController],
  providers: [
    IntegrationsService,
    EmailAccountsService,
    KeyValidators,
    // Real fetch / real nodemailer in production; e2e overrides these.
    { provide: INTEGRATIONS_FETCH, useValue: fetch },
    { provide: SMTP_TRANSPORT_FACTORY, useValue: realSmtpTransportFactory },
  ],
  exports: [IntegrationsService, EmailAccountsService, SMTP_TRANSPORT_FACTORY],
})
export class IntegrationsModule {}
