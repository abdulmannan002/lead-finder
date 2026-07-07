import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NOTIFICATIONS_FETCH, TelegramClient } from './telegram.client';

// Telegram + in-app notifications (docs/03 §3)
@Module({
  imports: [IntegrationsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    TelegramClient,
    // Real fetch in production; tests override this token with a stub.
    { provide: NOTIFICATIONS_FETCH, useValue: fetch },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
