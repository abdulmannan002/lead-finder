import { Injectable, Logger } from '@nestjs/common';
import { runWithContext } from '../../common/context/request-context';
// SystemPrismaService use is BY DESIGN: the rollup sweeps every tenant
// (docs/02 §5); per-tenant counting runs inside that tenant's context.
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';
import type { TenantJobData } from '../../common/queues/job-queue';
import { TenantDeletionService } from '../tenants/tenant-deletion.service';
import { MetricsService } from './metrics.service';

export interface RollupJobData extends TenantJobData {
  batch?: boolean;
}

/**
 * rollup.daily (docs/03 §4): upsert on (tenantId, day). Runs hourly and
 * recomputes "today" (tenant timezone) from source tables, so the run
 * closest to midnight finalizes the day — idempotent by construction.
 */
@Injectable()
export class RollupProcessor {
  private readonly logger = new Logger(RollupProcessor.name);

  constructor(
    private readonly system: SystemPrismaService,
    private readonly metrics: MetricsService,
    private readonly tenantDeletion: TenantDeletionService,
  ) {}

  async process(_data: RollupJobData): Promise<void> {
    const tenants = await this.system.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, timezone: true },
    });

    for (const tenant of tenants) {
      const { dayStart, dayEnd, dayDate } = tenantDayBounds(tenant.timezone);
      const counts = await runWithContext({ tenantId: tenant.id }, () =>
        this.metrics.computeDay(dayStart, dayEnd),
      );
      // Idle tenants don't accumulate zero rows; existing rows still update
      // (a day can legitimately fall back to zero after data deletion).
      const allZero = Object.values(counts).every((v) => v === 0);
      if (allZero) {
        const existing = await this.system.dailyMetric.findUnique({
          where: { tenantId_day: { tenantId: tenant.id, day: dayDate } },
        });
        if (!existing) continue;
      }
      await this.system.dailyMetric.upsert({
        where: { tenantId_day: { tenantId: tenant.id, day: dayDate } },
        create: { tenantId: tenant.id, day: dayDate, ...counts },
        update: counts,
      });
    }
    this.logger.log(`rolled up ${tenants.length} tenants`);

    // Daily maintenance rides along: FR-10.3 30-day hard purge.
    const purged = await this.tenantDeletion.purgeExpired();
    if (purged > 0) this.logger.warn(`purged ${purged} deleted tenants`);
  }
}

/** Start/end of "today" in the tenant's timezone, plus the DATE key. */
export function tenantDayBounds(timezone: string, now = new Date()): {
  dayStart: Date;
  dayEnd: Date;
  dayDate: Date;
} {
  let dayString: string;
  try {
    dayString = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(now);
  } catch {
    dayString = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(now);
  }
  // Resolve the tenant-local midnight to a UTC instant by measuring the
  // zone's current offset.
  const utcGuess = new Date(`${dayString}T00:00:00Z`);
  let offsetMs = 0;
  try {
    const zoned = new Date(now.toLocaleString('en-US', { timeZone: timezone || 'UTC' }));
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    offsetMs = zoned.getTime() - utc.getTime();
  } catch {
    offsetMs = 0;
  }
  const dayStart = new Date(utcGuess.getTime() - offsetMs);
  return {
    dayStart,
    dayEnd: new Date(dayStart.getTime() + 86_400_000),
    dayDate: utcGuess, // @db.Date column — the calendar date is what matters
  };
}
