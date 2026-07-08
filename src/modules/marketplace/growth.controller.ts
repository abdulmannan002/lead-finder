import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * MP-7 — invited→registered funnel over the tenant's PRIVATE lead list.
 * Leads count as invited once an {{invite_link}} email actually went out
 * (token minted at dispatch), and as registered when a signup arrived
 * with their ?ref= token.
 */
@Controller('growth')
export class GrowthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async stats() {
    const [invited, registered] = await Promise.all([
      this.prisma.client.lead.count({ where: { invitedAt: { not: null } } }),
      this.prisma.client.lead.count({ where: { registeredAt: { not: null } } }),
    ]);
    return {
      invited,
      registered,
      conversionPct: invited === 0 ? 0 : Math.round((registered / invited) * 1000) / 10,
    };
  }
}
