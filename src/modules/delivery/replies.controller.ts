import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { EnrollmentStatus, ReplyOutcome } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto, pageParams, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';

class ListRepliesDto extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unhandled?: boolean;
}

class HandleReplyDto {
  @IsEnum(ReplyOutcome)
  outcome!: ReplyOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * FR-9.3 — the reply inbox. Replies are answered in the tenant's real
 * mailbox (A-3); the app lists them with context and records triage.
 */
@Controller('replies')
export class RepliesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() dto: ListRepliesDto) {
    const { page, limit, skip, take } = pageParams(dto);
    const where = {
      status: EnrollmentStatus.REPLIED,
      ...(dto.unhandled ? { replyHandledAt: null } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.client.enrollment.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: {
          lead: {
            select: { id: true, company: true, email: true, websiteDomain: true, city: true },
          },
          campaign: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.enrollment.count({ where }),
    ]);
    return paged(data, total, page, limit);
  }

  /** docs/04 — mark handled with an outcome; the note lands on the lead. */
  @Patch(':enrollmentId')
  async handle(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: HandleReplyDto,
  ) {
    const enrollment = await this.prisma.client.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { lead: true },
    });
    if (!enrollment || enrollment.status !== EnrollmentStatus.REPLIED) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Reply not found' });
    }

    const [updated] = await this.prisma.client.$transaction([
      this.prisma.client.enrollment.update({
        where: { id: enrollmentId },
        data: { replyOutcome: dto.outcome, replyHandledAt: new Date() },
      }),
      ...(dto.note
        ? [
            this.prisma.client.lead.update({
              where: { id: enrollment.leadId },
              data: {
                notes: enrollment.lead.notes
                  ? `${enrollment.lead.notes}\n[reply] ${dto.note}`
                  : `[reply] ${dto.note}`,
              },
            }),
          ]
        : []),
    ]);
    return updated;
  }
}
