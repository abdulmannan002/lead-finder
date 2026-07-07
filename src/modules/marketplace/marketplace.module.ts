import { Module } from '@nestjs/common';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { ProfileController, PublicDirectoryController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

// M6 marketplace (docs/07): business profiles + public directory.
// Requests/RFQ land in the next branch.
@Module({
  imports: [EnrichmentModule],
  controllers: [ProfileController, PublicDirectoryController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class MarketplaceModule {}
