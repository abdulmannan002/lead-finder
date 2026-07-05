import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../../common/guards/current-user.decorator';
// All tenant/member operations go through the SCOPED client: the
// extension pins Tenant to the active tenant id and scopes Membership
// rows, so cross-tenant ids resolve to 404 by construction.
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateTenantDto } from './dto/tenants.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const tenant = await this.prisma.client.tenant.findFirst({});
    if (!tenant) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Tenant not found' });
    return tenant;
  }

  async update(user: AuthUser, dto: UpdateTenantDto) {
    return this.prisma.client.tenant.update({
      where: { id: user.tenantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.sendingEnabled !== undefined ? { sendingEnabled: dto.sendingEnabled } : {}),
      },
    });
  }

  async listMembers() {
    const memberships = await this.prisma.client.membership.findMany({
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, createdAt: true } } },
    });
    return memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }

  /** PATCH /tenant/users/:id — Owner only (guarded at the controller). */
  async changeRole(membershipId: string, role: UserRole) {
    const target = await this.prisma.client.membership.findUnique({
      where: { id: membershipId },
    });
    if (!target) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Membership not found' });
    }
    if (target.role === UserRole.OWNER && role !== UserRole.OWNER) {
      await this.assertNotLastOwner();
    }
    const updated = await this.prisma.client.membership.update({
      where: { id: membershipId },
      data: { role },
    });
    return { membershipId: updated.id, role: updated.role };
  }

  /** DELETE /tenant/users/:id — removes the membership, never the global user. */
  async removeMember(actor: AuthUser, membershipId: string) {
    const target = await this.prisma.client.membership.findUnique({
      where: { id: membershipId },
    });
    if (!target) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Membership not found' });
    }
    if (target.role === UserRole.OWNER) {
      if (actor.role !== UserRole.OWNER) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Only an Owner can remove an Owner',
        });
      }
      await this.assertNotLastOwner();
    }
    await this.prisma.client.membership.delete({ where: { id: membershipId } });
    return { removed: true };
  }

  private async assertNotLastOwner() {
    const owners = await this.prisma.client.membership.count({
      where: { role: UserRole.OWNER },
    });
    if (owners <= 1) {
      throw new BadRequestException({
        code: 'LAST_OWNER',
        message: 'A workspace must keep at least one Owner',
      });
    }
  }
}
