import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ApifyClient, SOURCING_FETCH } from './apify.client';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { QueriesService } from './queries.service';
import { ScrapeRunProcessor } from './scrape-run.processor';
import { SourcingController } from './sourcing.controller';

// scrape queries, runs, Apify client, lead ingestion + dedupe, CSV import (docs/03 §3)
@Module({
  imports: [IntegrationsModule],
  controllers: [SourcingController, LeadsController],
  providers: [
    QueriesService,
    LeadsService,
    ApifyClient,
    ScrapeRunProcessor,
    // Real fetch in production; tests override this token with a stub.
    { provide: SOURCING_FETCH, useValue: fetch },
  ],
  exports: [QueriesService, ScrapeRunProcessor],
})
export class SourcingModule {}
