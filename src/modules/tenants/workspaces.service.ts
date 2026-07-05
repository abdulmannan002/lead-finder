import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
// SystemPrismaService use is BY DESIGN: these two flows are cross-tenant
// on purpose — creating a NEW workspace and listing the caller's
// memberships across all workspaces (docs/02 §5, FR-1.6).
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly system: SystemPrismaService) {}

  /** POST /tenants — caller becomes OWNER of the new workspace. */
  async create(userId: string, name: string) {
    const slug = await this.uniqueSlug(name);
    const tenant = await this.system.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name, slug } });
      await tx.membership.create({
        data: { userId, tenantId: tenant.id, role: UserRole.OWNER },
      });
      return tenant;
    });
    return { id: tenant.id, name: tenant.name, slug: tenant.slug, role: UserRole.OWNER };
  }

  /** GET /me/tenants — the caller's memberships (switcher source). */
  async listMine(userId: string) {
    const memberships = await this.system.membership.findMany({
      where: { userId, tenant: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'asc' },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
    return memberships.map((m) => ({
      tenantId: m.tenant.id,
      name: m.tenant.name,
      slug: m.tenant.slug,
      role: m.role,
    }));
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'workspace';
    const taken = await this.system.tenant.findUnique({ where: { slug: base } });
    return taken ? `${base}-${randomBytes(3).toString('hex')}` : base;
  }
}
