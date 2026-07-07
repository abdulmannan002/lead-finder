import { Controller, Get, Query, Res } from '@nestjs/common';
import { MessageDirection, MessageStatus, Prisma } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Response } from 'express';
import { toCsv } from '../../common/csv';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { PageQueryDto, pageParams, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';

const EXPORT_CAP = 50_000;

class ListMessagesDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(MessageDirection)
  direction?: MessageDirection;

  @IsOptional()
  @IsEnum(MessageStatus)
  status?: MessageStatus;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;
}

function buildMessageWhere(dto: ListMessagesDto): Prisma.MessageWhereInput {
  return {
    ...(dto.direction ? { direction: dto.direction } : {}),
    ...(dto.status ? { status: dto.status } : {}),
    ...(dto.enrollmentId ? { enrollmentId: dto.enrollmentId } : {}),
    ...(dto.campaignId ? { enrollment: { campaignId: dto.campaignId } } : {}),
  };
}

@Controller('messages')
export class MessagesController {
  constructor(private readonly prisma: PrismaService) {}

  /** FR-10.2 — messages CSV (docs/04 addition per M5 ruling). Audited. */
  @Get('export')
  async export(
    @CurrentUser() user: AuthUser,
    @Query() dto: ListMessagesDto,
    @Res() res: Response,
  ) {
    const rows = await this.prisma.client.message.findMany({
      where: buildMessageWhere(dto),
      orderBy: { createdAt: 'desc' },
      take: EXPORT_CAP,
      include: {
        enrollment: { select: { campaignId: true, lead: { select: { company: true, email: true } } } },
        step: { select: { stepOrder: true } },
      },
    });
    await this.prisma.client.activityLog.create({
      data: {
        action: 'EXPORT /messages',
        userId: user.userId,
        payload: { rows: rows.length },
      } satisfies TenantCreateData<Prisma.ActivityLogUncheckedCreateInput> as unknown as Prisma.ActivityLogUncheckedCreateInput,
    });
    const csv = toCsv(rows, [
      { header: 'direction', value: (m) => m.direction },
      { header: 'status', value: (m) => m.status },
      { header: 'company', value: (m) => m.enrollment.lead.company },
      { header: 'leadEmail', value: (m) => m.enrollment.lead.email },
      { header: 'campaignId', value: (m) => m.enrollment.campaignId },
      { header: 'step', value: (m) => m.step?.stepOrder },
      { header: 'subject', value: (m) => m.subject },
      { header: 'sentAt', value: (m) => m.sentAt },
      { header: 'providerMsgId', value: (m) => m.providerMsgId },
    ]);
    res
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="messages.csv"')
      .send(csv);
  }

  /** docs/04 — message log with direction/status/enrollment/campaign filters. */
  @Get()
  async list(@Query() dto: ListMessagesDto) {
    const { page, limit, skip, take } = pageParams(dto);
    const where = buildMessageWhere(dto);
    const [data, total] = await Promise.all([
      this.prisma.client.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          enrollment: {
            select: {
              id: true,
              campaignId: true,
              lead: { select: { id: true, company: true, email: true } },
            },
          },
          step: { select: { stepOrder: true } },
        },
      }),
      this.prisma.client.message.count({ where }),
    ]);
    return paged(data, total, page, limit);
  }
}
