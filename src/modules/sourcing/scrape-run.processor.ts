import { Injectable, Logger } from '@nestjs/common';
import { EmailSource, IntegrationKind, Prisma, QueryStatus, RunStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { IntegrationsService } from '../integrations/integrations.service';
import { ApifyClient, DEFAULT_ACTOR_ID } from './apify.client';
import { normalizeItem } from './normalize';
import type { ScrapeRunJobData } from './queries.service';

/**
 * scrape.run job (docs/03 §4). Runs inside runWithContext(tenantId), so
 * every Prisma call here is tenant-scoped. Idempotent: leads dedupe on
 * (tenantId, websiteDomain) via createMany skipDuplicates, so a retried
 * job can never double-insert (FR-3.4, T-2).
 */
@Injectable()
export class ScrapeRunProcessor {
  private readonly logger = new Logger(ScrapeRunProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly apify: ApifyClient,
  ) {}

  async process(data: ScrapeRunJobData): Promise<void> {
    const run = await this.prisma.client.scrapeRun.findUnique({
      where: { id: data.runId },
      include: { query: true },
    });
    if (!run) return; // run (or its tenant) is gone — nothing to do

    try {
      if (run.status !== RunStatus.RUNNING) {
        // retry after a failed attempt
        await this.prisma.client.scrapeRun.update({
          where: { id: run.id },
          data: { status: RunStatus.RUNNING },
        });
      }

      const apifyKey = await this.integrations.getKey(IntegrationKind.APIFY);
      if (!apifyKey) throw new Error('APIFY integration is missing or disabled');
      const actorId = (apifyKey.config?.actorId as string | undefined) ?? DEFAULT_ACTOR_ID;

      const { apifyRunId, items } = await this.apify.runActor(apifyKey.key, actorId, {
        searchStringsArray: [run.query.searchString],
        locationQuery: run.query.city,
        maxCrawledPlacesPerSearch: run.query.maxResults,
      });

      const tenant = await this.prisma.client.tenant.findFirst({});
      const discardNoWebsite = tenant?.discardNoWebsite ?? true;

      const normalized = items.map((i) => normalizeItem(i, run.query.city));
      // FR-3.5 — M1 implements only the discard path (docs/02 §3 note).
      const usable = normalized.filter((n) => n.websiteDomain !== null);
      const discarded = normalized.length - usable.length;
      if (!discardNoWebsite && discarded > 0) {
        this.logger.warn(
          `${discarded} no-website leads discarded despite discardNoWebsite=false — keep-path lands post-M1`,
        );
      }

      const { count: created } = await this.prisma.client.lead.createMany({
        data: usable.map(
          (n) =>
            ({
              scrapeRunId: run.id,
              company: n.company,
              websiteDomain: n.websiteDomain as string,
              email: n.email,
              emailSource: n.email ? EmailSource.APIFY : null,
              phone: n.phone,
              city: n.city,
              category: n.category,
            }) satisfies TenantCreateData<Prisma.LeadUncheckedCreateInput>,
        ) as Prisma.LeadUncheckedCreateInput[],
        skipDuplicates: true, // FR-3.4 — duplicates silently skipped, counted below
      });

      await this.prisma.client.scrapeRun.update({
        where: { id: run.id },
        data: {
          status: RunStatus.SUCCESS,
          found: created,
          duplicates: usable.length - created,
          rawStats: { itemsFetched: items.length, discardedNoWebsite: discarded, apifyRunId },
          finishedAt: new Date(),
        },
      });
      await this.prisma.client.scrapeQuery.update({
        where: { id: run.queryId },
        data: { status: QueryStatus.DONE },
      });
      this.logger.log(
        `run ${run.id}: ${created} new, ${usable.length - created} duplicates, ${discarded} without website`,
      );
    } catch (err) {
      await this.prisma.client.scrapeRun.update({
        where: { id: run.id },
        data: {
          status: RunStatus.FAILED,
          rawStats: { error: (err as Error).message },
          finishedAt: new Date(),
        },
      });
      await this.prisma.client.scrapeQuery.update({
        where: { id: run.queryId },
        data: { status: QueryStatus.FAILED },
      });
      throw err; // let BullMQ retry per the failure policy
    }
  }
}
