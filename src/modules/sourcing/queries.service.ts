import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationKind, Prisma, QueryStatus, RunStatus } from '@prisma/client';
import { pageParams, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { JobQueue } from '../../common/queues/job-queue';
import { SCRAPE_RUN_QUEUE } from '../../common/queues/queues.module';
import { IntegrationsService } from '../integrations/integrations.service';
import { CreateQueryDto, ListQueriesDto, UpdateQueryDto } from './dto/sourcing.dto';

export interface ScrapeRunJobData {
  tenantId: string;
  runId: string;
  queryId: string;
  [key: string]: unknown;
}

@Injectable()
export class QueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    @Inject(SCRAPE_RUN_QUEUE) private readonly queue: JobQueue<ScrapeRunJobData>,
  ) {}

  async list(dto: ListQueriesDto) {
    const { page, limit, skip, take } = pageParams(dto);
    const where = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.city ? { city: { contains: dto.city, mode: 'insensitive' as const } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.client.scrapeQuery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { runs: { orderBy: { startedAt: 'desc' }, take: 1 } },
      }),
      this.prisma.client.scrapeQuery.count({ where }),
    ]);
    return paged(data, total, page, limit);
  }

  create(dto: CreateQueryDto) {
    return this.prisma.client.scrapeQuery.create({
      data: {
        searchString: dto.searchString,
        city: dto.city,
        maxResults: dto.maxResults ?? 100,
      } satisfies TenantCreateData<Prisma.ScrapeQueryUncheckedCreateInput> as Prisma.ScrapeQueryUncheckedCreateInput,
    });
  }

  async update(id: string, dto: UpdateQueryDto) {
    await this.mustExist(id);
    return this.prisma.client.scrapeQuery.update({ where: { id }, data: { ...dto } });
  }

  async remove(id: string) {
    await this.mustExist(id);
    await this.prisma.client.scrapeQuery.delete({ where: { id } });
    return { removed: true };
  }

  /**
   * FR-3.2 — manual trigger. One active run per query (docs/03 §4); the
   * Idempotency-Key header doubles as the BullMQ jobId so a retried POST
   * cannot enqueue twice.
   */
  async run(tenantId: string, queryId: string, idempotencyKey?: string) {
    const query = await this.mustExist(queryId);

    const apify = await this.integrations.getKey(IntegrationKind.APIFY);
    if (!apify) {
      throw new BadRequestException({
        code: 'NO_APIFY_KEY',
        message: 'Connect an Apify key in Settings before running scrapes',
      });
    }

    const active = await this.prisma.client.scrapeRun.findFirst({
      where: { queryId, status: RunStatus.RUNNING },
    });
    if (active) {
      throw new ConflictException({
        code: 'RUN_IN_PROGRESS',
        message: 'This query already has an active run',
        details: { runId: active.id },
      });
    }

    const run = await this.prisma.client.scrapeRun.create({
      data: {
        queryId: query.id,
      } satisfies TenantCreateData<Prisma.ScrapeRunUncheckedCreateInput> as Prisma.ScrapeRunUncheckedCreateInput,
    });
    await this.prisma.client.scrapeQuery.update({
      where: { id: query.id },
      data: { status: QueryStatus.RUNNING },
    });

    await this.queue.add(
      'run',
      { tenantId, runId: run.id, queryId: query.id },
      { jobId: idempotencyKey ?? run.id },
    );
    return { runId: run.id };
  }

  async getRun(id: string) {
    const run = await this.prisma.client.scrapeRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Run not found' });
    return run;
  }

  private async mustExist(id: string) {
    const query = await this.prisma.client.scrapeQuery.findUnique({ where: { id } });
    if (!query) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Query not found' });
    return query;
  }
}
