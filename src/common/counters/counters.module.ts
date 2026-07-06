import { Global, Module } from '@nestjs/common';
import { QUOTA_COUNTER, RedisQuotaCounter } from './quota-counter';

@Global()
@Module({
  providers: [{ provide: QUOTA_COUNTER, useClass: RedisQuotaCounter }],
  exports: [QUOTA_COUNTER],
})
export class CountersModule {}
