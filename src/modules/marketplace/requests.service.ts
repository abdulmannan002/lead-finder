import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { runWithContext } from '../../common/context/request-context';
import { pageParams, paged, PageQueryDto } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
// SystemPrismaService use is BY DESIGN: matching and offer-reading are
// cross-tenant marketplace surfaces (docs/07 tenancy note).
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRequestDto } from './dto/requests.dto';
import { matchScore } from './matching';

const MAX_NOTIFIED_PROVIDERS = 50;

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** MP-4 — buyer posts a request; matched providers are notified (MP-5). */
  async create(buyerTenantId: string, dto: CreateRequestDto) {
    const request = await this.prisma.client.marketRequest.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category.toLowerCase(),
        city: dto.city,
        remoteOk: dto.remoteOk ?? true,
        budget: dto.budget,
      } satisfies TenantCreateData<Prisma.MarketRequestUncheckedCreateInput> as Prisma.MarketRequestUncheckedCreateInput,
    });

    const notified = await this.notifyMatches(buyerTenantId, request.id);
    return { ...request, notifiedProviders: notified };
  }

  /** Finds published providers that fit and alerts them in THEIR tenant context. */
  private async notifyMatches(buyerTenantId: string, requestId: string): Promise<number> {
    const request = await this.system.marketRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    const candidates = await this.system.businessProfile.findMany({
      where: {
        published: true,
        tenantId: { not: buyerTenantId }, // never your own request
        tenant: { status: 'ACTIVE' },
      },
      select: { tenantId: true, category: true, services: true, city: true },
    });

    const matched = candidates
      .map((p) => ({
        tenantId: p.tenantId,
        score: matchScore(
          { category: p.category, services: p.services as string[], city: p.city },
          request,
        ),
      }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_NOTIFIED_PROVIDERS);

    for (const match of matched) {
      // Each alert is raised inside the PROVIDER's tenant context so the
      // scoped notification pipeline (in-app + their Telegram) just works.
      await runWithContext({ tenantId: match.tenantId }, () =>
        this.notifications.notify(
          'system',
          `New lead: "${request.title}" (${request.category}${request.city ? `, ${request.city}` : ''}). Respond from your Leads feed.`,
          { requestId: request.id },
        ),
      ).catch((err) => this.logger.warn(`match alert failed: ${err.message}`));
    }
    return matched.length;
  }

  /** Buyer's own requests with offer counts. */
  async mine(dto: PageQueryDto) {
    const { page, limit, skip, take } = pageParams(dto);
    const [data, total] = await Promise.all([
      this.prisma.client.marketRequest.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { _count: { select: { responses: true } } },
      }),
      this.prisma.client.marketRequest.count(),
    ]);
    return paged(data, total, page, limit);
  }

  /** MP-5 — the provider's lead feed: OPEN requests matching their profile. */
  async matchedFeed(providerTenantId: string, dto: PageQueryDto) {
    const profile = await this.prisma.client.businessProfile.findFirst({});
    if (!profile || !profile.published) {
      throw new BadRequestException({
        code: 'NO_PUBLISHED_PROFILE',
        message: 'Publish your business profile to receive leads',
      });
    }

    const open = await this.system.marketRequest.findMany({
      where: { status: RequestStatus.OPEN, tenantId: { not: providerTenantId } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        responses: { where: { tenantId: providerTenantId }, select: { id: true } },
      },
    });

    const scored = open
      .map((r) => ({
        request: r,
        score: matchScore(
          { category: profile.category, services: profile.services as string[], city: profile.city },
          r,
        ),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const { page, limit, skip, take } = pageParams(dto);
    const pageRows = scored.slice(skip, skip + take).map(({ request, score }) => ({
      id: request.id,
      title: request.title,
      description: request.description,
      category: request.category,
      city: request.city,
      remoteOk: request.remoteOk,
      budget: request.budget,
      createdAt: request.createdAt,
      score,
      responded: request.responses.length > 0,
    }));
    return paged(pageRows, scored.length, page, limit);
  }

  /** MP-6 — provider submits one offer; the buyer is alerted. */
  async respond(providerTenantId: string, requestId: string, pitch: string) {
    const request = await this.system.marketRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== RequestStatus.OPEN) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found or closed' });
    }
    if (request.tenantId === providerTenantId) {
      throw new BadRequestException({ code: 'OWN_REQUEST', message: 'This is your own request' });
    }
    const profile = await this.prisma.client.businessProfile.findFirst({});
    if (!profile || !profile.published) {
      throw new BadRequestException({
        code: 'NO_PUBLISHED_PROFILE',
        message: 'Publish your business profile before responding to leads',
      });
    }

    try {
      const response = await this.prisma.client.marketResponse.create({
        data: {
          requestId,
          pitch,
        } satisfies TenantCreateData<Prisma.MarketResponseUncheckedCreateInput> as Prisma.MarketResponseUncheckedCreateInput,
      });

      await runWithContext({ tenantId: request.tenantId }, () =>
        this.notifications.notify(
          'system',
          `New offer on "${request.title}" from ${profile.displayName}.`,
          { requestId, responseId: response.id },
        ),
      ).catch(() => undefined);

      return response;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'ALREADY_RESPONDED',
          message: 'You already responded to this request',
        });
      }
      throw err;
    }
  }

  /** Buyer compares offers — responder contact is revealed here (MP-6). */
  async offers(buyerTenantId: string, requestId: string) {
    const request = await this.prisma.client.marketRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found' });

    const responses = await this.system.marketResponse.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
    const profiles = await this.system.businessProfile.findMany({
      where: { tenantId: { in: responses.map((r) => r.tenantId) } },
      select: {
        tenantId: true,
        slug: true,
        displayName: true,
        category: true,
        city: true,
        phone: true,
        whatsapp: true,
        tenant: {
          select: {
            memberships: {
              where: { role: 'OWNER' },
              select: { user: { select: { emailVerifiedAt: true } } },
            },
          },
        },
      },
    });
    const bySender = new Map(profiles.map((p) => [p.tenantId, p]));

    return {
      request,
      offers: responses.map((r) => {
        const p = bySender.get(r.tenantId);
        return {
          id: r.id,
          pitch: r.pitch,
          createdAt: r.createdAt,
          provider: p
            ? {
                slug: p.slug,
                displayName: p.displayName,
                category: p.category,
                city: p.city,
                phone: p.phone,
                whatsapp: p.whatsapp,
                verified: p.tenant.memberships.some((m) => m.user.emailVerifiedAt !== null),
              }
            : null,
        };
      }),
    };
  }

  /** Buyer closes a request; no further offers. */
  async close(requestId: string) {
    const request = await this.prisma.client.marketRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Request not found' });
    return this.prisma.client.marketRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.CLOSED },
    });
  }
}
