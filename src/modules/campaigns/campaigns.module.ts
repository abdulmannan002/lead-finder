import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

// campaigns, sequence steps, enrollments, template rendering (docs/03 §3)
@Module({
  imports: [IntegrationsModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
