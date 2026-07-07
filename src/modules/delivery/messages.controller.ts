import { Controller, Get, Query } from '@nestjs/common';
import { MessageDirection, MessageStatus, Prisma } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto, pageParams, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';

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

@Controller('messages')
export class MessagesController {
  constructor(private readonly prisma: PrismaService) {}

  /** docs/04 — message log with direction/status/enrollment/campaign filters. */
  @Get()
  async list(@Query() dto: ListMessagesDto) {
    const { page, limit, skip, take } = pageParams(dto);
    const where: Prisma.MessageWhereInput = {
      ...(dto.direction ? { direction: dto.direction } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.enrollmentId ? { enrollmentId: dto.enrollmentId } : {}),
      ...(dto.campaignId ? { enrollment: { campaignId: dto.campaignId } } : {}),
    };
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
