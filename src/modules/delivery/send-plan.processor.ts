import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AccountStatus,
  CampaignStatus,
  EnrollmentStatus,
  MessageDirection,
  MessageStatus,
} from '@prisma/client';
import { dayKey, QUOTA_COUNTER, QuotaCounter } from '../../common/counters/quota-counter';
// SystemPrismaService use is BY DESIGN: send.plan is the platform-wide
// scheduler sweeping every tenant (docs/02 §5, docs/03 §5); every row it
// writes carries an explicit tenantId.
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';
import { JobQueue, TenantJobData } from '../../common/queues/job-queue';
import { SEND_DISPATCH_QUEUE } from '../../common/queues/queues.module';
import { isWithinWindow, ScheduleWindow } from './schedule-window';

export interface SendPlanJobData extends TenantJobData {
  batch?: boolean;
}

/** FR-7.2 — human-like spacing: 3–7 minutes between sends per account. */
const JITTER_MIN_MS = 3 * 60_000;
const JITTER_SPREAD_MS = 4 * 60_000;
/** A claim older than this is considered abandoned (crashed dispatch). */
const CLAIM_TTL_MS = 60 * 60_000;
const PLAN_BATCH_PER_CAMPAIGN = 100;

/**
 * send.plan (docs/03 §4/§5): every 15 minutes, computes due sends —
 * follow-ups first — respecting the three kill switches (T-10), the
 * campaign schedule window and each account's server-side daily cap
 * (T-4, rule 4). For each planned send, the Message row (QUEUED) is
 * created in the SAME transaction that claims the enrollment, before
 * any SMTP work happens (rule 2 / T-3), then send.dispatch is enqueued
 * with cumulative jitter.
 */
@Injectable()
export class SendPlanProcessor {
  private readonly logger = new Logger(SendPlanProcessor.name);

  constructor(
    private readonly system: SystemPrismaService,
    @Inject(QUOTA_COUNTER) private readonly quota: QuotaCounter,
    @Inject(SEND_DISPATCH_QUEUE) private readonly dispatchQueue: JobQueue,
  ) {}

  async process(_data: SendPlanJobData): Promise<void> {
    const now = new Date();

    // Kill switch 1: tenant sendingEnabled (T-10).
    const tenants = await this.system.tenant.findMany({
      where: { status: 'ACTIVE', sendingEnabled: true },
      select: { id: true, timezone: true },
    });

    for (const tenant of tenants) {
      // Kill switches 2 + 3: campaign ACTIVE, account usable.
      const campaigns = await this.system.campaign.findMany({
        where: {
          tenantId: tenant.id,
          status: CampaignStatus.ACTIVE,
          emailAccount: { status: { in: [AccountStatus.ACTIVE, AccountStatus.WARMUP] } },
        },
        include: {
          emailAccount: true,
          steps: { orderBy: { stepOrder: 'asc' } },
        },
      });

      /** Cumulative jitter per account so parallel campaigns share the spacing. */
      const accountDelays = new Map<string, number>();
      /** Accounts whose daily budget ran out mid-plan. */
      const exhausted = new Set<string>();

      for (const campaign of campaigns) {
        const account = campaign.emailAccount!;
        if (exhausted.has(account.id)) continue;
        if (
          !isWithinWindow(
            campaign.scheduleWindow as ScheduleWindow | null,
            tenant.timezone,
            now,
          )
        ) {
          continue;
        }

        // The sender's hot query (docs/02 §3 partial index):
        // due enrollments, follow-ups first (FR-7.1).
        const due = await this.system.enrollment.findMany({
          where: {
            campaignId: campaign.id,
            status: { in: [EnrollmentStatus.QUEUED, EnrollmentStatus.ACTIVE] },
            nextDueAt: { lte: now },
            OR: [
              { claimedAt: null },
              { claimedAt: { lt: new Date(now.getTime() - CLAIM_TTL_MS) } },
            ],
          },
          orderBy: [{ currentStep: 'desc' }, { nextDueAt: 'asc' }],
          take: PLAN_BATCH_PER_CAMPAIGN,
        });

        for (const enrollment of due) {
          const step = campaign.steps[enrollment.currentStep];
          if (!step) {
            await this.system.enrollment.update({
              where: { id: enrollment.id },
              data: { status: EnrollmentStatus.COMPLETED, nextDueAt: null, claimedAt: null },
            });
            continue;
          }

          // T-4 / rule 4: the server-side daily budget, tenant-timezone day.
          const allowed = await this.quota.consume(
            'send',
            account.id,
            account.dailyCap,
            dayKey(tenant.timezone, now),
          );
          if (!allowed) {
            exhausted.add(account.id);
            this.logger.log(`account ${account.address}: daily cap reached`);
            break;
          }

          // Rule 2 / T-3: Message(QUEUED) + claim in ONE transaction,
          // strictly before any SMTP dispatch.
          const [message] = await this.system.$transaction([
            this.system.message.create({
              data: {
                tenantId: tenant.id,
                enrollmentId: enrollment.id,
                stepId: step.id,
                direction: MessageDirection.OUTBOUND,
                status: MessageStatus.QUEUED,
              },
            }),
            this.system.enrollment.update({
              where: { id: enrollment.id },
              data: { claimedAt: now },
            }),
          ]);

          const delay =
            (accountDelays.get(account.id) ?? 0) +
            Math.floor(JITTER_MIN_MS + Math.random() * JITTER_SPREAD_MS);
          accountDelays.set(account.id, delay);

          await this.dispatchQueue.add(
            'dispatch',
            { tenantId: tenant.id, messageId: message.id },
            { jobId: `dispatch:${message.id}`, delay },
          );
        }
      }
    }
  }
}
