import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailConfidence, EmailSource, IntegrationKind, LeadStatus } from '@prisma/client';
import { monthKey, QUOTA_COUNTER, QuotaCounter } from '../../common/counters/quota-counter';
import { PrismaService } from '../../common/prisma/prisma.service';
// SystemPrismaService use is BY DESIGN: the batch scan is a platform-wide
// sweep across tenants (docs/02 §5); per-lead work stays tenant-scoped.
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';
import { JobQueue } from '../../common/queues/job-queue';
import { AI_PERSONALIZE_QUEUE, ENRICH_EMAIL_QUEUE } from '../../common/queues/queues.module';
import { IntegrationsService } from '../integrations/integrations.service';
import { extractEmails, pickBestEmail } from './email-extract';
import { HunterClient } from './hunter.client';
import { SiteScraper } from './site-scraper';

export interface EnrichJobData {
  tenantId: string;
  leadId?: string;
  /** Platform-wide sweep: enqueue per-lead jobs for NEW leads without email. */
  batch?: boolean;
  [key: string]: unknown;
}

const DEFAULT_HUNTER_MONTHLY_QUOTA = 25; // Hunter free tier (M2 ruling)
const BATCH_LIMIT = 500;

/** Statuses the finder may work on; everything else is left alone. */
const ENRICHABLE = new Set<LeadStatus>([
  LeadStatus.NEW,
  LeadStatus.ENRICHING,
  LeadStatus.UNREACHABLE,
]);

@Injectable()
export class EnrichEmailProcessor {
  private readonly logger = new Logger(EnrichEmailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly scraper: SiteScraper,
    private readonly hunter: HunterClient,
    @Inject(QUOTA_COUNTER) private readonly quota: QuotaCounter,
    @Inject(ENRICH_EMAIL_QUEUE) private readonly enrichQueue: JobQueue<EnrichJobData>,
    @Inject(AI_PERSONALIZE_QUEUE) private readonly personalizeQueue: JobQueue,
  ) {}

  async process(data: EnrichJobData): Promise<void> {
    if (data.batch) return this.batchScan();
    if (!data.leadId) return;
    return this.enrichLead(data.tenantId, data.leadId);
  }

  /** docs/03 §4 "batch cron" — runs without a tenant context. */
  private async batchScan(): Promise<void> {
    const due = await this.system.lead.findMany({
      where: { status: LeadStatus.NEW, email: null, tenant: { status: 'ACTIVE' } },
      select: { id: true, tenantId: true },
      take: BATCH_LIMIT,
      orderBy: { createdAt: 'asc' },
    });
    for (const lead of due) {
      await this.enrichQueue.add(
        'enrich',
        { tenantId: lead.tenantId, leadId: lead.id },
        { jobId: `enrich:${lead.id}` },
      );
    }
    if (due.length > 0) this.logger.log(`batch scan queued ${due.length} leads`);
  }

  /** FR-4.1–4.5. Runs inside the tenant context. */
  private async enrichLead(tenantId: string, leadId: string): Promise<void> {
    const lead = await this.prisma.client.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;

    // Already has an email (Apify/import/manual): just promote + personalize.
    if (lead.email) {
      if (lead.status === LeadStatus.NEW || lead.status === LeadStatus.ENRICHING) {
        await this.prisma.client.lead.update({
          where: { id: leadId },
          data: { status: LeadStatus.READY },
        });
        await this.enqueuePersonalize(tenantId, leadId);
      }
      return;
    }

    if (!ENRICHABLE.has(lead.status)) return;

    await this.prisma.client.lead.update({
      where: { id: leadId },
      data: { status: LeadStatus.ENRICHING },
    });

    try {
      // 1) The lead's own site (FR-4.1).
      const pages = await this.scraper.fetchPages(lead.websiteDomain);
      const picked = pickBestEmail(extractEmails(pages.join('\n')), lead.websiteDomain);
      if (picked) {
        return await this.found(tenantId, leadId, picked.email, EmailSource.SCRAPE, picked.confidence);
      }

      // 2) Hunter fallback within the tenant's monthly quota (FR-4.2).
      const hunterKey = await this.integrations.getKey(IntegrationKind.HUNTER);
      if (hunterKey) {
        const limit = Number(hunterKey.config?.monthlyQuota ?? DEFAULT_HUNTER_MONTHLY_QUOTA);
        if (await this.quota.consume('hunter', tenantId, limit, monthKey())) {
          const result = await this.hunter.domainSearch(hunterKey.key, lead.websiteDomain);
          if (result) {
            return await this.found(
              tenantId,
              leadId,
              result.email,
              EmailSource.HUNTER,
              result.score >= 80 ? EmailConfidence.HIGH : EmailConfidence.LOW,
            );
          }
        } else {
          this.logger.warn(`hunter quota exhausted for tenant ${tenantId}`);
        }
      }

      // 3) Every finder failed (FR-4.5).
      await this.prisma.client.lead.update({
        where: { id: leadId },
        data: { status: LeadStatus.UNREACHABLE },
      });
    } catch (err) {
      // Transient failure: back to NEW so the batch cron retries it later.
      await this.prisma.client.lead.update({
        where: { id: leadId },
        data: { status: LeadStatus.NEW },
      });
      throw err;
    }
  }

  private async found(
    tenantId: string,
    leadId: string,
    email: string,
    emailSource: EmailSource,
    emailConfidence: EmailConfidence,
  ): Promise<void> {
    await this.prisma.client.lead.update({
      where: { id: leadId },
      data: { email, emailSource, emailConfidence, status: LeadStatus.READY },
    });
    await this.enqueuePersonalize(tenantId, leadId);
  }

  private enqueuePersonalize(tenantId: string, leadId: string): Promise<void> {
    return this.personalizeQueue.add(
      'personalize',
      { tenantId, leadId },
      { jobId: `personalize:${leadId}` },
    );
  }
}
