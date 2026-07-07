import { Global, Module } from '@nestjs/common';
import { BullJobQueue } from './job-queue';
import { QUEUE_NAMES } from './queue-names';

/** DI tokens for producers (e2e overrides them with stubs). */
export const SCRAPE_RUN_QUEUE = 'QUEUE:scrape.run';
export const ENRICH_EMAIL_QUEUE = 'QUEUE:enrich.email';
export const AI_PERSONALIZE_QUEUE = 'QUEUE:ai.personalize';
export const SEND_DISPATCH_QUEUE = 'QUEUE:send.dispatch';

@Global()
@Module({
  providers: [
    { provide: SCRAPE_RUN_QUEUE, useFactory: () => new BullJobQueue(QUEUE_NAMES.SCRAPE_RUN) },
    { provide: ENRICH_EMAIL_QUEUE, useFactory: () => new BullJobQueue(QUEUE_NAMES.ENRICH_EMAIL) },
    {
      provide: AI_PERSONALIZE_QUEUE,
      useFactory: () => new BullJobQueue(QUEUE_NAMES.AI_PERSONALIZE),
    },
    { provide: SEND_DISPATCH_QUEUE, useFactory: () => new BullJobQueue(QUEUE_NAMES.SEND_DISPATCH) },
  ],
  exports: [SCRAPE_RUN_QUEUE, ENRICH_EMAIL_QUEUE, AI_PERSONALIZE_QUEUE, SEND_DISPATCH_QUEUE],
})
export class QueuesModule {}
