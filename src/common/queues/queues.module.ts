import { Global, Module } from '@nestjs/common';
import { BullJobQueue } from './job-queue';
import { QUEUE_NAMES } from './queue-names';

/** DI token for the scrape.run producer (e2e overrides it with a stub). */
export const SCRAPE_RUN_QUEUE = 'QUEUE:scrape.run';

@Global()
@Module({
  providers: [
    { provide: SCRAPE_RUN_QUEUE, useFactory: () => new BullJobQueue(QUEUE_NAMES.SCRAPE_RUN) },
  ],
  exports: [SCRAPE_RUN_QUEUE],
})
export class QueuesModule {}
