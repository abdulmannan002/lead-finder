import { Controller, Get, Query } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Roles } from '../../common/guards/roles.decorator';
import { PageQueryDto, pageParams, paged } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';

class ListAuditDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** Substring match, e.g. "campaigns" or "DELETE". */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  action?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** docs/04 — Owner/Admin; filter by userId, action, date range (FR-10.1). */
  @Roles(UserRole.ADMIN)
  @Get()
  async list(@Query() dto: ListAuditDto) {
    const { page, limit, skip, take } = pageParams(dto);
    const where: Prisma.ActivityLogWhereInput = {
      ...(dto.userId ? { userId: dto.userId } : {}),
      ...(dto.action ? { action: { contains: dto.action, mode: 'insensitive' } } : {}),
      ...(dto.from || dto.to
        ? {
            at: {
              ...(dto.from ? { gte: new Date(dto.from) } : {}),
              ...(dto.to ? { lte: new Date(dto.to) } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.client.activityLog.findMany({
        where,
        orderBy: { at: 'desc' },
        skip,
        take,
        include: { user: { select: { id: true, email: true } } },
      }),
      this.prisma.client.activityLog.count({ where }),
    ]);
    return paged(data, total, page, limit);
  }
}
