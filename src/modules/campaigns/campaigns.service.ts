import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AccountStatus, Campaign, CampaignStatus, Prisma } from '@prisma/client';
import { pageParams, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import {
  CreateCampaignDto,
  ListCampaignsDto,
  PutStepsDto,
  UpdateCampaignDto,
} from './dto/campaigns.dto';
import { findUnknownVariables } from './template';

/** docs/04 — DRAFT→ACTIVE→PAUSED (+ COMPLETED as a terminal manual state). */
const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: [CampaignStatus.ACTIVE],
  ACTIVE: [CampaignStatus.PAUSED, CampaignStatus.COMPLETED],
  PAUSED: [CampaignStatus.ACTIVE, CampaignStatus.COMPLETED],
  COMPLETED: [],
};

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListCampaignsDto) {
    const { page, limit, skip, take } = pageParams(dto);
    const where = dto.status ? { status: dto.status } : {};
    const [data, total] = await Promise.all([
      this.prisma.client.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          steps: { orderBy: { stepOrder: 'asc' } },
          emailAccount: { select: { id: true, address: true, status: true } },
          _count: { select: { enrollments: true } },
        },
      }),
      this.prisma.client.campaign.count({ where }),
    ]);
    return paged(data, total, page, limit);
  }

  async get(id: string) {
    const campaign = await this.prisma.client.campaign.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        emailAccount: { select: { id: true, address: true, status: true } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!campaign) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campaign not found' });
    return campaign;
  }

  async create(dto: CreateCampaignDto) {
    if (dto.emailAccountId) await this.mustHaveUsableAccount(dto.emailAccountId);
    return this.prisma.client.campaign.create({
      data: {
        name: dto.name,
        offerText: dto.offerText,
        emailAccountId: dto.emailAccountId,
        scheduleWindow: (dto.scheduleWindow ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
      } satisfies TenantCreateData<Prisma.CampaignUncheckedCreateInput> as Prisma.CampaignUncheckedCreateInput,
    });
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.get(id);

    if (dto.emailAccountId) await this.mustHaveUsableAccount(dto.emailAccountId);

    if (dto.status && dto.status !== campaign.status) {
      if (!TRANSITIONS[campaign.status].includes(dto.status)) {
        throw new ConflictException({
          code: 'INVALID_TRANSITION',
          message: `Cannot move a ${campaign.status} campaign to ${dto.status}`,
        });
      }
      if (dto.status === CampaignStatus.ACTIVE) {
        // The flagged M0 decision: DRAFTs may lack an account; activation may not.
        const accountId = dto.emailAccountId ?? campaign.emailAccountId;
        if (!accountId) {
          throw new BadRequestException({
            code: 'NO_SENDING_ACCOUNT',
            message: 'Connect a sending account to this campaign before activating',
          });
        }
        await this.mustHaveUsableAccount(accountId);
        if (campaign.steps.length === 0) {
          throw new BadRequestException({
            code: 'NO_STEPS',
            message: 'Add at least one sequence step before activating',
          });
        }
      }
    }

    return this.prisma.client.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.offerText !== undefined ? { offerText: dto.offerText } : {}),
        ...(dto.emailAccountId !== undefined ? { emailAccountId: dto.emailAccountId } : {}),
        ...(dto.scheduleWindow !== undefined
          ? { scheduleWindow: dto.scheduleWindow as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  /** Only DRAFTs are deletable — history must survive (docs/02 lifecycle). */
  async remove(id: string) {
    const campaign = await this.get(id);
    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new ConflictException({
        code: 'NOT_DRAFT',
        message: 'Only draft campaigns can be deleted — pause or complete instead',
      });
    }
    await this.prisma.client.campaign.delete({ where: { id } });
    return { removed: true };
  }

  /**
   * docs/04 — full ordered replacement of the sequence. T-12: unknown
   * template variables → 422 naming the variable. Steps are frozen while
   * the campaign is ACTIVE (pause first) so in-flight enrollments keep a
   * consistent step order.
   */
  async setSteps(campaignId: string, dto: PutStepsDto) {
    const campaign = await this.get(campaignId);
    if (campaign.status === CampaignStatus.ACTIVE) {
      throw new ConflictException({
        code: 'CAMPAIGN_ACTIVE',
        message: 'Pause the campaign before editing its steps',
      });
    }

    dto.steps.forEach((step, index) => {
      for (const field of ['subjectTpl', 'bodyTpl'] as const) {
        const unknown = findUnknownVariables(step[field]);
        if (unknown.length > 0) {
          throw new UnprocessableEntityException({
            code: 'UNKNOWN_TEMPLATE_VARIABLE',
            message: `Unknown template variable {{${unknown[0]}}} in step ${index + 1} ${field === 'subjectTpl' ? 'subject' : 'body'}`,
            details: { step: index + 1, field, variables: unknown },
          });
        }
      }
    });

    await this.prisma.client.$transaction(async (tx) => {
      await tx.sequenceStep.deleteMany({ where: { campaignId } });
      await tx.sequenceStep.createMany({
        data: dto.steps.map(
          (step, index) =>
            ({
              campaignId,
              stepOrder: index + 1,
              subjectTpl: step.subjectTpl,
              bodyTpl: step.bodyTpl,
              delayDays: step.delayDays,
              threaded: step.threaded ?? true,
            }) satisfies TenantCreateData<Prisma.SequenceStepUncheckedCreateInput>,
        ) as Prisma.SequenceStepUncheckedCreateInput[],
      });
    });
    return this.get(campaignId);
  }

  private async mustHaveUsableAccount(accountId: string) {
    const account = await this.prisma.client.emailAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Email account not found' });
    }
    if (account.status === AccountStatus.DISABLED || account.status === AccountStatus.ERROR) {
      throw new BadRequestException({
        code: 'ACCOUNT_UNUSABLE',
        message: `Sending account ${account.address} is ${account.status}`,
      });
    }
  }
}

export type CampaignWithSteps = Campaign & {
  steps: { id: string; stepOrder: number; subjectTpl: string; bodyTpl: string; delayDays: number; threaded: boolean }[];
};
