import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { QueriesService } from './queries.service';
import { SourcingController } from './sourcing.controller';

// scrape queries, runs, Apify client, lead ingestion + dedupe, CSV import (docs/03 §3)
@Module({
  imports: [IntegrationsModule],
  controllers: [SourcingController],
  providers: [QueriesService],
  exports: [QueriesService],
})
export class SourcingModule {}
