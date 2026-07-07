import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SendDispatchProcessor } from './send-dispatch.processor';
import { SendPlanProcessor } from './send-plan.processor';

// send scheduler, dispatcher, threading, bounce handling (docs/03 §3);
// inbox watcher + reply matcher arrive in M4
@Module({
  imports: [IntegrationsModule],
  providers: [SendPlanProcessor, SendDispatchProcessor],
  exports: [SendPlanProcessor, SendDispatchProcessor],
})
export class DeliveryModule {}
