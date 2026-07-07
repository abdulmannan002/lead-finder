import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MessagesController } from './messages.controller';
import { SendDispatchProcessor } from './send-dispatch.processor';
import { SendPlanProcessor } from './send-plan.processor';

// send scheduler, dispatcher, threading, bounce handling (docs/03 §3);
// inbox watcher + reply matcher arrive in M4
@Module({
  imports: [IntegrationsModule],
  controllers: [MessagesController],
  providers: [SendPlanProcessor, SendDispatchProcessor],
  exports: [SendPlanProcessor, SendDispatchProcessor],
})
export class DeliveryModule {}
