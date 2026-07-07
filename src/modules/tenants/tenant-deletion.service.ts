import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthUser } from '../../common/guards/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
// SystemPrismaService use is BY DESIGN: password verification reads the
// global User, and the purge sweeps deleted tenants platform-wide.
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';

const PURGE_AFTER_MS = 30 * 86_400_000;

@Injectable()
export class TenantDeletionService {
  private readonly logger = new Logger(TenantDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
  ) {}

  /** FR-10.3 + docs/04 conventions: OWNER + password re-entry → soft delete. */
  async softDelete(actor: AuthUser, password: string) {
    const user = await this.system.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Password confirmation failed',
      });
    }

    const now = new Date();
    const [tenant] = await this.system.$transaction([
      // Scoped update also works, but the transaction spans refresh tokens
      // of every member — keep it on one client.
      this.system.tenant.update({
        where: { id: actor.tenantId },
        data: { status: TenantStatus.DELETED, sendingEnabled: false, deletedAt: now },
      }),
      this.system.refreshToken.updateMany({
        where: { tenantId: actor.tenantId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    this.logger.warn(`tenant ${tenant.slug} soft-deleted by ${user.email}`);
    return { deleted: true, purgeAfter: new Date(now.getTime() + PURGE_AFTER_MS) };
  }

  /** Daily maintenance: hard-purge tenants deleted 30+ days ago. */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - PURGE_AFTER_MS);
    const expired = await this.system.tenant.findMany({
      where: { status: TenantStatus.DELETED, deletedAt: { lt: cutoff } },
      select: { id: true, slug: true },
    });
    for (const tenant of expired) {
      // Messages first — MESSAGE→ENROLLMENT is RESTRICT (docs/02 §3), so
      // the tenant cascade alone could trip over it.
      await this.system.message.deleteMany({ where: { tenantId: tenant.id } });
      await this.system.tenant.delete({ where: { id: tenant.id } });
      this.logger.warn(`tenant ${tenant.slug} hard-purged`);
    }
    return expired.length;
  }
}
