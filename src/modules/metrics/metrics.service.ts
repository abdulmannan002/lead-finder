import { Injectable } from '@nestjs/common';
import {
  CampaignStatus,
  EmailSource,
  EnrollmentStatus,
  MessageDirection,
  MessageStatus,
  ReplyOutcome,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface DayCounts {
  leadsScraped: number;
  emailsFound: number;
  sent: number;
  replies: number;
  bounces: number;
  errors: number;
}

/**
 * FR-9.x — dashboard queries + the per-day counts the rollup persists.
 * All computations run against source tables so re-running is idempotent.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Counts for [from, to) — the rollup upserts these into DailyMetric. */
  async computeDay(from: Date, to: Date): Promise<DayCounts> {
    const createdInDay = { gte: from, lt: to };
    const [leadsScraped, emailsFound, sent, replies, bounces, errors] = await Promise.all([
      this.prisma.client.lead.count({
        where: { scrapeRunId: { not: null }, createdAt: createdInDay },
      }),
      // Approximation: finder-attributed emails whose lead changed that day.
      this.prisma.client.lead.count({
        where: {
          emailSource: { in: [EmailSource.SCRAPE, EmailSource.HUNTER] },
          updatedAt: createdInDay,
        },
      }),
      this.prisma.client.message.count({
        where: {
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          sentAt: createdInDay,
        },
      }),
      this.prisma.client.message.count({
        where: {
          direction: MessageDirection.INBOUND,
          status: MessageStatus.RECEIVED,
          createdAt: createdInDay,
        },
      }),
      this.prisma.client.message.count({
        where: { status: MessageStatus.BOUNCED, createdAt: createdInDay },
      }),
      this.prisma.client.message.count({
        where: { status: MessageStatus.FAILED, createdAt: createdInDay },
      }),
    ]);
    return { leadsScraped, emailsFound, sent, replies, bounces, errors };
  }

  /** GET /metrics/daily — persisted rollup rows (FR-9.5). */
  async daily(from: Date, to: Date) {
    return this.prisma.client.dailyMetric.findMany({
      where: { day: { gte: from, lte: to } },
      orderBy: { day: 'asc' },
    });
  }

  /** GET /metrics/overview — scorecards (FR-9.1). */
  async overview() {
    const since30d = new Date(Date.now() - 30 * 86_400_000);
    const [pipeline, activeCampaigns, sent30, replies30] = await Promise.all([
      this.prisma.client.lead.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.client.campaign.count({ where: { status: CampaignStatus.ACTIVE } }),
      this.prisma.client.message.count({
        where: {
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          sentAt: { gte: since30d },
        },
      }),
      this.prisma.client.enrollment.count({
        where: { status: EnrollmentStatus.REPLIED, updatedAt: { gte: since30d } },
      }),
    ]);
    return {
      pipeline: Object.fromEntries(pipeline.map((p) => [p.status, p._count._all])),
      activeCampaigns,
      last30d: {
        sent: sent30,
        replies: replies30,
        replyRate: sent30 > 0 ? Number((replies30 / sent30).toFixed(3)) : 0,
      },
    };
  }

  /** GET /metrics/funnel — lead → enrolled → sent → replied → won (FR-9.1). */
  async funnel() {
    const [leads, enrolled, sentEnrollments, replied, won] = await Promise.all([
      this.prisma.client.lead.count(),
      this.prisma.client.enrollment.count(),
      this.prisma.client.enrollment.count({ where: { currentStep: { gt: 0 } } }),
      this.prisma.client.enrollment.count({ where: { status: EnrollmentStatus.REPLIED } }),
      this.prisma.client.enrollment.count({ where: { replyOutcome: ReplyOutcome.WON } }),
    ]);
    return { leads, enrolled, sent: sentEnrollments, replied, won };
  }
}
