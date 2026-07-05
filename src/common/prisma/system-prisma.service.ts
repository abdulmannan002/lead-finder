import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The ONLY unscoped database client. Every injection of this service is a
 * deliberate, greppable bypass of tenant isolation and is code-review
 * gated (docs/02 §5).
 *
 * Legitimate call sites: auth flows that run before a tenant context
 * exists (signup, login, refresh, accept-invite), cross-workspace reads
 * that are cross-tenant BY DESIGN (GET /me/tenants, switch-tenant
 * membership check), tenant lifecycle, and platform jobs.
 */
@Injectable()
export class SystemPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
