import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { BusinessProfile, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { pageParams, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
// SystemPrismaService use is BY DESIGN: the public directory reads
// PUBLISHED profiles across tenants (docs/07 tenancy note).
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import {
  ANTHROPIC_CLIENT_FACTORY,
  AnthropicClientFactory,
  OPENER_MODEL,
} from '../enrichment/anthropic.client';
import { DirectoryQueryDto, UpsertProfileDto } from './dto/profiles.dto';

/** Fields safe to expose on public surfaces (never internal ids beyond slug). */
const PUBLIC_SELECT = {
  slug: true,
  displayName: true,
  category: true,
  services: true,
  description: true,
  city: true,
  country: true,
  phone: true,
  whatsapp: true,
  websiteUrl: true,
  createdAt: true,
  tenant: {
    select: {
      memberships: {
        where: { role: 'OWNER' as const },
        select: { user: { select: { emailVerifiedAt: true } } },
      },
    },
  },
} satisfies Prisma.BusinessProfileSelect;

type PublicRow = Prisma.BusinessProfileGetPayload<{ select: typeof PUBLIC_SELECT }>;

function toPublic(row: PublicRow) {
  const { tenant, ...profile } = row;
  return {
    ...profile,
    /** MP-3 — badge: any owner with a verified email. */
    verified: tenant.memberships.some((m) => m.user.emailVerifiedAt !== null),
  };
}

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    @Optional()
    @Inject(ANTHROPIC_CLIENT_FACTORY)
    private readonly anthropicFactory?: AnthropicClientFactory,
  ) {}

  /** The workspace's own profile (MP-1) — null until created. */
  getMine(): Promise<BusinessProfile | null> {
    return this.prisma.client.businessProfile.findFirst({});
  }

  /** Create-or-update; one profile per workspace. */
  async upsertMine(dto: UpsertProfileDto): Promise<BusinessProfile> {
    const existing = await this.getMine();
    const data = {
      displayName: dto.displayName,
      category: dto.category.toLowerCase(),
      services: dto.services.map((s) => s.toLowerCase()) as Prisma.InputJsonValue,
      description: dto.description,
      city: dto.city,
      phone: dto.phone,
      whatsapp: dto.whatsapp,
      websiteUrl: dto.websiteUrl,
      ...(dto.published !== undefined ? { published: dto.published } : {}),
    };
    if (existing) {
      return this.prisma.client.businessProfile.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.client.businessProfile.create({
      data: {
        ...data,
        slug: await this.uniqueSlug(dto.displayName),
      } satisfies TenantCreateData<Prisma.BusinessProfileUncheckedCreateInput> as unknown as Prisma.BusinessProfileUncheckedCreateInput,
    });
  }

  /**
   * MP-1 — AI profile description via the PLATFORM key (marketplace
   * businesses don't bring their own; docs/07 budget: haiku, tiny cap).
   */
  async generateDescription(): Promise<{ description: string }> {
    const profile = await this.getMine();
    if (!profile) {
      throw new BadRequestException({ code: 'NO_PROFILE', message: 'Create your profile first' });
    }
    const apiKey = process.env.PLATFORM_ANTHROPIC_KEY;
    if (!apiKey || !this.anthropicFactory) {
      throw new BadRequestException({
        code: 'AI_UNAVAILABLE',
        message: 'AI descriptions are not configured on this deployment',
      });
    }

    const client = this.anthropicFactory(apiKey);
    const response = await client.messages.create({
      model: OPENER_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            'Write a professional 2-3 sentence business description for a public directory listing.',
            'Plain text, no quotes, no headings, third person, confident but factual. Max 70 words.',
            '',
            `Business: ${profile.displayName}`,
            `Category: ${profile.category}`,
            `Services: ${(profile.services as string[]).join(', ')}`,
            profile.city ? `City: ${profile.city}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    });
    const description =
      response.content.find((b) => b.type === 'text')?.text?.trim().slice(0, 2000) ?? '';
    if (!description) {
      throw new BadRequestException({ code: 'AI_EMPTY', message: 'Generation failed — try again' });
    }
    await this.prisma.client.businessProfile.update({
      where: { id: profile.id },
      data: { description },
    });
    return { description };
  }

  /** MP-2 — public, unauthenticated, PUBLISHED-only directory search. */
  async directory(dto: DirectoryQueryDto) {
    const { page, limit, skip, take } = pageParams(dto);
    const where: Prisma.BusinessProfileWhereInput = {
      published: true,
      tenant: { status: 'ACTIVE' },
      ...(dto.category ? { category: dto.category.toLowerCase() } : {}),
      ...(dto.city ? { city: { contains: dto.city, mode: 'insensitive' } } : {}),
      ...(dto.q
        ? {
            OR: [
              { displayName: { contains: dto.q, mode: 'insensitive' } },
              { description: { contains: dto.q, mode: 'insensitive' } },
              { category: { contains: dto.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.system.businessProfile.findMany({
        where,
        select: PUBLIC_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.system.businessProfile.count({ where }),
    ]);
    return paged(rows.map(toPublic), total, page, limit);
  }

  /** MP-2 — public profile page by slug. */
  async publicProfile(slug: string) {
    const row = await this.system.businessProfile.findFirst({
      where: { slug, published: true, tenant: { status: 'ACTIVE' } },
      select: PUBLIC_SELECT,
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    return toPublic(row);
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'business';
    const taken = await this.system.businessProfile.findUnique({ where: { slug: base } });
    return taken ? `${base}-${randomBytes(2).toString('hex')}` : base;
  }
}
