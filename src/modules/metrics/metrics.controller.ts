import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { IsISO8601, IsOptional } from 'class-validator';
import { MetricsService } from './metrics.service';

class DailyRangeDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** docs/04 — rollup rows for charts (defaults to the last 30 days). */
  @Get('daily')
  daily(@Query() dto: DailyRangeDto) {
    const to = dto.to ? new Date(dto.to) : new Date();
    const from = dto.from ? new Date(dto.from) : new Date(to.getTime() - 30 * 86_400_000);
    if (from > to) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'from must be <= to' });
    }
    return this.metrics.daily(from, to);
  }

  @Get('overview')
  overview() {
    return this.metrics.overview();
  }

  @Get('funnel')
  funnel() {
    return this.metrics.funnel();
  }
}
