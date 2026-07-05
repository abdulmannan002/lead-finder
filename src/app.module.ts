import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { SourcingModule } from './modules/sourcing/sourcing.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    IntegrationsModule,
    SourcingModule,
    EnrichmentModule,
    CampaignsModule,
    DeliveryModule,
    MetricsModule,
    NotificationsModule,
    AuditModule,
  ],
})
export class AppModule {}
