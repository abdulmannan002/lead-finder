import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ScopedClientViolationError, tenantScopeExtension } from './tenant-scope';

const RAW_METHODS = new Set([
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
  '$runCommandRaw',
]);

function blockRaw(prop: string): never {
  throw new ScopedClientViolationError(
    `${prop} is not available on the tenant-scoped client. Raw SQL must go through ` +
      `SystemPrismaService and is code-review gated (docs/02 §5).`,
  );
}

function guardRaw<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'string' && RAW_METHODS.has(prop)) blockRaw(prop);
      if (prop === '$transaction') {
        const original = Reflect.get(t, prop, receiver) as (...a: any[]) => any;
        // Interactive transactions hand out an inner client — guard it too,
        // otherwise `$transaction(tx => tx.$executeRaw...)` would be a hole.
        return (arg: any, opts?: any) =>
          typeof arg === 'function'
            ? original.call(t, (tx: any) => arg(guardRaw(tx)), opts)
            : original.call(t, arg, opts);
      }
      return Reflect.get(t, prop, receiver);
    },
  });
}

function createScopedClient(base: PrismaClient) {
  return guardRaw(base.$extends(tenantScopeExtension));
}

function buildForType(base: PrismaClient) {
  return base.$extends(tenantScopeExtension);
}
type ExtendedClient = ReturnType<typeof buildForType>;

export type TenantScopedClient = Omit<
  ExtendedClient,
  '$queryRaw' | '$queryRawUnsafe' | '$executeRaw' | '$executeRawUnsafe'
>;

/**
 * The ONLY client feature code may use for tenant data. Every operation on
 * a model carrying tenantId is scoped to (and stamped with) the tenant of
 * the current AsyncLocalStorage context — fail-closed when absent — and
 * raw SQL is blocked. See tenant-scope.ts for the rules.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly base = new PrismaClient();
  readonly client: TenantScopedClient = createScopedClient(this.base) as TenantScopedClient;

  async onModuleInit() {
    await this.base.$connect();
  }

  async onModuleDestroy() {
    await this.base.$disconnect();
  }
}
