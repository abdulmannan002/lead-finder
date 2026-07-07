import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { INBOX_FETCHER, ImapInboxFetcher } from './inbox-fetcher';
import { InboxPollProcessor } from './inbox-poll.processor';
import { MessagesController } from './messages.controller';
import { RepliesController } from './replies.controller';
import { SendDispatchProcessor } from './send-dispatch.processor';
import { SendPlanProcessor } from './send-plan.processor';

// send scheduler, dispatcher, threading, bounce handling, inbox watcher,
// reply matcher (docs/03 §3)
@Module({
  imports: [IntegrationsModule, NotificationsModule],
  controllers: [MessagesController, RepliesController],
  providers: [
    SendPlanProcessor,
    SendDispatchProcessor,
    InboxPollProcessor,
    // Real IMAP in production; tests override this token with a fake inbox.
    { provide: INBOX_FETCHER, useClass: ImapInboxFetcher },
  ],
  exports: [SendPlanProcessor, SendDispatchProcessor, InboxPollProcessor],
})
export class DeliveryModule {}
