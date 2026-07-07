import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { SourcingModule } from './modules/sourcing/sourcing.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { DeliveryModule } from './modules/delivery/delivery.module'; // send engine (M3)
import { MetricsModule } from './modules/metrics/metrics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { MailModule } from './common/mail/mail.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { CountersModule } from './common/counters/counters.module';
import { QueuesModule } from './common/queues/queues.module';
import { ContextMiddleware } from './common/context/context.middleware';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    CryptoModule,
    CountersModule,
    QueuesModule,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Every request runs inside an AsyncLocalStorage scope so the
    // tenant-scoped Prisma client can resolve the active tenant anywhere
    // in the call stack. The JWT guard fills the scope after verification.
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
