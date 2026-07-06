import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EnrichEmailProcessor } from './enrich-email.processor';
import { EnrichmentController } from './enrichment.controller';
import { HunterClient } from './hunter.client';
import { ENRICHMENT_FETCH, SiteScraper } from './site-scraper';

// site fetcher, email extraction, Hunter client, AI personalizer (docs/03 §3)
@Module({
  imports: [IntegrationsModule],
  controllers: [EnrichmentController],
  providers: [
    SiteScraper,
    HunterClient,
    EnrichEmailProcessor,
    // Real fetch in production; tests override this token with a stub.
    { provide: ENRICHMENT_FETCH, useValue: fetch },
  ],
  exports: [EnrichEmailProcessor, SiteScraper],
})
export class EnrichmentModule {}