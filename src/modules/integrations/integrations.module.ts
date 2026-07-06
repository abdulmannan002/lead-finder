import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { INTEGRATIONS_FETCH, KeyValidators } from './key-validators';

// key vault (encrypt/validate); email account connect lands in M3 (docs/03 §3)
@Module({
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    KeyValidators,
    // Real fetch in production; e2e overrides this token with a stub.
    { provide: INTEGRATIONS_FETCH, useValue: fetch },
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
