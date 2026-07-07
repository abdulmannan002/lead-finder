import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CampaignOpsService } from './campaign-ops.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

// campaigns, sequence steps, enrollments, template rendering (docs/03 §3)
@Module({
  imports: [IntegrationsModule],
  controllers: [CampaignsController, EnrollmentsController],
  providers: [CampaignsService, EnrollmentsService, CampaignOpsService],
  exports: [CampaignsService, EnrollmentsService, CampaignOpsService],
})
export class CampaignsModule {}
