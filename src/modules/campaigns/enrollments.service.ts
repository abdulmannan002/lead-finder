import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, EnrollmentStatus, Lead, LeadStatus, Prisma } from '@prisma/client';
import { pageParams, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { buildLeadWhere } from '../sourcing/leads.service';
import { EnrollDto, ListEnrollmentsDto } from './dto/enrollments.dto';

export interface EnrollResult {
  enrolled: number;
  skipped: { id: string; reason: string }[];
}

/** Enrollments may still be stopped/inspected in these states. */
const STOPPABLE = new Set<EnrollmentStatus>([EnrollmentStatus.QUEUED, EnrollmentStatus.ACTIVE]);

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * FR-6.3 — manual multi-select or by-filter enrollment. Every skip
   * carries a reason (docs/04): suppressed (T-9, rule 5 — permanent),
   * no_email, bounced, archived, already_active (FR-6.4 via the M0
   * partial unique index), not_found (incl. cross-tenant ids).
   */
  async enroll(campaignId: string, dto: EnrollDto): Promise<EnrollResult> {
    if (!dto.leadIds && !dto.filter) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Provide leadIds or a filter',
      });
    }

    const campaign = await this.prisma.client.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campaign not found' });
    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new ConflictException({
        code: 'CAMPAIGN_COMPLETED',
        message: 'This campaign is completed — create a new one',
      });
    }

    const skipped: EnrollResult['skipped'] = [];
    let leads: Lead[];
    if (dto.leadIds) {
      leads = await this.prisma.client.lead.findMany({ where: { id: { in: dto.leadIds } } });
      const found = new Set(leads.map((l) => l.id));
      for (const id of dto.leadIds) {
        if (!found.has(id)) skipped.push({ id, reason: 'not_found' });
      }
    } else {
      leads = await this.prisma.client.lead.findMany({
        where: buildLeadWhere(dto.filter!),
        take: 500,
      });
    }

    let enrolled = 0;
    for (const lead of leads) {
      // Rule 5 / T-9: suppression is permanent — bulk operations skip with a reason.
      if (lead.status === LeadStatus.DO_NOT_CONTACT) {
        skipped.push({ id: lead.id, reason: 'suppressed' });
        continue;
      }
      if (lead.status === LeadStatus.BOUNCED) {
        skipped.push({ id: lead.id, reason: 'bounced' });
        continue;
      }
      if (lead.status === LeadStatus.ARCHIVED) {
        skipped.push({ id: lead.id, reason: 'archived' });
        continue;
      }
      if (!lead.email) {
        skipped.push({ id: lead.id, reason: 'no_email' });
        continue;
      }
      try {
        await this.prisma.client.enrollment.create({
          data: {
            campaignId,
            leadId: lead.id,
            status: EnrollmentStatus.QUEUED,
            nextDueAt: new Date(),
          } satisfies TenantCreateData<Prisma.EnrollmentUncheckedCreateInput> as Prisma.EnrollmentUncheckedCreateInput,
        });
        enrolled++;
      } catch (err) {
        // FR-6.4 — one active campaign per lead (partial unique index),
        // or a re-enroll into the same campaign (leadId+campaignId unique).
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          skipped.push({ id: lead.id, reason: 'already_active' });
        } else {
          throw err;
        }
      }
    }
    return { enrolled, skipped };
  }

  async list(campaignId: string, dto: ListEnrollmentsDto) {
    const campaign = await this.prisma.client.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campaign not found' });

    const { page, limit, skip, take } = pageParams(dto);
    const where = { campaignId, ...(dto.status ? { status: dto.status } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.client.enrollment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          lead: { select: { id: true, company: true, websiteDomain: true, email: true } },
        },
      }),
      this.prisma.client.enrollment.count({ where }),
    ]);
    return paged(data, total, page, limit);
  }

  /** docs/04 — manual stop; the sequence never resumes. */
  async stop(enrollmentId: string) {
    const enrollment = await this.prisma.client.enrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Enrollment not found' });
    }
    if (!STOPPABLE.has(enrollment.status)) {
      throw new ConflictException({
        code: 'NOT_STOPPABLE',
        message: `Enrollment is ${enrollment.status}`,
      });
    }
    return this.prisma.client.enrollment.update({
      where: { id: enrollmentId },
      data: { status: EnrollmentStatus.STOPPED, nextDueAt: null },
    });
  }
}
