import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { toCsv } from '../../common/csv';
import { AuthUser } from '../../common/guards/current-user.decorator';
import { pageParams, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { BulkAction, ListLeadsDto, UpdateLeadDto } from './dto/leads.dto';

const EXPORT_CAP = 50_000;

/** Shared filter builder — the enrollment filter reuses the exact list semantics. */
export function buildLeadWhere(dto: ListLeadsDto): Prisma.LeadWhereInput {
  return {
    ...(dto.status ? { status: dto.status } : {}),
    ...(dto.city ? { city: { contains: dto.city, mode: 'insensitive' } } : {}),
    ...(dto.category ? { category: { contains: dto.category, mode: 'insensitive' } } : {}),
    ...(dto.hasEmail !== undefined ? { email: dto.hasEmail ? { not: null } : null } : {}),
    ...(dto.q
      ? {
          OR: [
            { company: { contains: dto.q, mode: 'insensitive' } },
            { websiteDomain: { contains: dto.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListLeadsDto) {
    const { page, limit, skip, take } = pageParams(dto);
    const where = buildLeadWhere(dto);
    const [data, total] = await Promise.all([
      this.prisma.client.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.lead.count({ where }),
    ]);
    return paged(data, total, page, limit);
  }

  async get(id: string) {
    const lead = await this.prisma.client.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lead not found' });
    return lead;
  }

  /** FR-10.2 — same filters as list; exports are audited (FR-10.1). */
  async exportCsv(dto: ListLeadsDto, actor: AuthUser): Promise<string> {
    const rows = await this.prisma.client.lead.findMany({
      where: buildLeadWhere(dto),
      orderBy: { createdAt: 'desc' },
      take: EXPORT_CAP,
    });
    await this.prisma.client.activityLog.create({
      data: {
        action: 'EXPORT /leads',
        userId: actor.userId,
        payload: { rows: rows.length },
      } satisfies TenantCreateData<Prisma.ActivityLogUncheckedCreateInput> as unknown as Prisma.ActivityLogUncheckedCreateInput,
    });
    return toCsv(rows, [
      { header: 'company', value: (l) => l.company },
      { header: 'websiteDomain', value: (l) => l.websiteDomain },
      { header: 'email', value: (l) => l.email },
      { header: 'emailSource', value: (l) => l.emailSource },
      { header: 'emailConfidence', value: (l) => l.emailConfidence },
      { header: 'phone', value: (l) => l.phone },
      { header: 'city', value: (l) => l.city },
      { header: 'category', value: (l) => l.category },
      { header: 'status', value: (l) => l.status },
      { header: 'firstLine', value: (l) => l.firstLine },
      { header: 'notes', value: (l) => l.notes },
      { header: 'createdAt', value: (l) => l.createdAt },
    ]);
  }

  /**
   * FR-9.2 inline edits. Non-negotiable rule 5: DO_NOT_CONTACT is
   * permanent — once suppressed, the status can never change again.
   */
  async update(id: string, dto: UpdateLeadDto) {
    const lead = await this.get(id);
    if (
      lead.status === LeadStatus.DO_NOT_CONTACT &&
      dto.status !== undefined &&
      dto.status !== LeadStatus.DO_NOT_CONTACT
    ) {
      throw new ConflictException({
        code: 'SUPPRESSED',
        message: 'This lead is DO_NOT_CONTACT — suppression is permanent',
      });
    }
    return this.prisma.client.lead.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.firstLine !== undefined ? { firstLine: dto.firstLine } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  /** docs/04 — bulk archive / do_not_contact; suppressed leads are skipped with a reason. */
  async bulk(ids: string[], action: Exclude<BulkAction, 'enroll'>) {
    const found = await this.prisma.client.lead.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    const foundIds = new Set(found.map((l) => l.id));
    const skipped: { id: string; reason: string }[] = ids
      .filter((id) => !foundIds.has(id))
      .map((id) => ({ id, reason: 'not_found' }));

    const targetStatus =
      action === 'archive' ? LeadStatus.ARCHIVED : LeadStatus.DO_NOT_CONTACT;
    const eligible: string[] = [];
    for (const lead of found) {
      if (lead.status === LeadStatus.DO_NOT_CONTACT) {
        // Rule 5: suppression is permanent — nothing may move them, and
        // re-suppressing is a no-op.
        skipped.push({ id: lead.id, reason: 'suppressed' });
      } else {
        eligible.push(lead.id);
      }
    }

    const { count } = await this.prisma.client.lead.updateMany({
      where: { id: { in: eligible } },
      data: { status: targetStatus },
    });
    return { updated: count, skipped };
  }
}
