import { Module } from '@nestjs/common';
import { EnrichmentModule } from '../enrichment/enrichment.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProfileController, PublicDirectoryController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

// M6 marketplace (docs/07): business profiles, public directory,
// buyer requests (RFQ) and provider offers.
@Module({
  imports: [EnrichmentModule, NotificationsModule],
  controllers: [ProfileController, PublicDirectoryController, RequestsController],
  providers: [ProfilesService, RequestsService],
  exports: [ProfilesService, RequestsService],
})
export class MarketplaceModule {}
