import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { RollupProcessor } from './rollup.processor';

// daily rollups, dashboard queries (docs/03 §3)
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, RollupProcessor],
  exports: [MetricsService, RollupProcessor],
})
export class MetricsModule {}
