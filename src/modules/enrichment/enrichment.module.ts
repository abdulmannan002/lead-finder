import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ANTHROPIC_CLIENT_FACTORY, realAnthropicClientFactory } from './anthropic.client';
import { EnrichEmailProcessor } from './enrich-email.processor';
import { EnrichmentController } from './enrichment.controller';
import { HunterClient } from './hunter.client';
import { PersonalizeProcessor } from './personalize.processor';
import { ENRICHMENT_FETCH, SiteScraper } from './site-scraper';

// site fetcher, email extraction, Hunter client, AI personalizer (docs/03 §3)
@Module({
  imports: [IntegrationsModule],
  controllers: [EnrichmentController],
  providers: [
    SiteScraper,
    HunterClient,
    EnrichEmailProcessor,
    PersonalizeProcessor,
    // Real fetch / real Anthropic SDK in production; tests override these.
    { provide: ENRICHMENT_FETCH, useValue: fetch },
    { provide: ANTHROPIC_CLIENT_FACTORY, useValue: realAnthropicClientFactory },
  ],
  exports: [EnrichEmailProcessor, PersonalizeProcessor, SiteScraper],
})
export class EnrichmentModule {}