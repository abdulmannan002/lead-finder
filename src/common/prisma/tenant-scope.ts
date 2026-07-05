import { Prisma } from '@prisma/client';
import { RequestContext } from '../context/request-context';

/** Thrown when a tenant-scoped model is touched with no tenant context. */
export class TenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${operation} on ${model} without a tenant context. HTTP requests get one from the JWT guard; ` +
        `jobs must use runWithContext; genuine system access must use SystemPrismaService.`,
    );
  }
}

/** Thrown when feature code passes a tenantId that differs from the context. */
export class TenantMismatchError extends Error {
  constructor(model: string) {
    super(`Explicit tenantId/tenant on ${model} conflicts with the request context — remove it; the extension stamps it.`);
  }
}

/** Thrown for models/operations the scoped client refuses to serve. */
export class ScopedClientViolationError extends Error {}

/**
 * Tenant-scoped models, derived from the schema itself: every model with a
 * tenantId field. Nothing to maintain by hand — a new model with tenantId
 * is scoped automatically; forgetting the column means the model is NOT
 * protected, which the denormalization rule in docs/02 §3 forbids.
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'tenantId'))
    .map((m) => m.name),
);

const TENANT_READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'update',
  'updateMany',
]);

const CREATE_LIKE = new Set(['create', 'createMany', 'createManyAndReturn']);

function stampData(model: string, data: any, tenantId: string): any {
  if (data === undefined || data === null) return data;
  if (Array.isArray(data)) return data.map((d) => stampData(model, d, tenantId));
  if ('tenant' in data) {
    // Relation-style tenant assignment bypasses the mismatch check below.
    throw new TenantMismatchError(model);
  }
  if (data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new TenantMismatchError(model);
  }
  return { ...data, tenantId };
}

function rejectForeignTenant(model: string, data: any, tenantId: string): void {
  if (!data) return;
  if ('tenant' in data) throw new TenantMismatchError(model);
  if (data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new TenantMismatchError(model);
  }
}

/**
 * Pure function that rewrites Prisma args so the operation can only see or
 * touch rows of the context tenant. Fail-closed: no context → throw.
 *
 * Known limitation: nested relation writes (connect/connectOrCreate through
 * a parent) are not interceptable here. Mitigated by the denormalized
 * tenantId on all child models (docs/02 §3) — the child row itself is
 * always stamped and scoped — plus the per-endpoint isolation test suite.
 */
export function applyTenantScope(
  model: string,
  operation: string,
  args: any,
  ctx: RequestContext | undefined,
): any {
  // Global identity — never served by the scoped client at the top level.
  // (Nested includes via Membership are fine: they ride on a scoped query.)
  if (model === 'User') {
    throw new ScopedClientViolationError(
      'User is a global model — read it via Membership includes or use SystemPrismaService (code-review gated).',
    );
  }

  const a = args ?? {};

  if (model === 'Tenant') {
    if (!ctx?.tenantId) throw new TenantContextError(model, operation);
    if (!TENANT_READ_OPS.has(operation)) {
      throw new ScopedClientViolationError(
        `Tenant.${operation} is a lifecycle operation — use SystemPrismaService (code-review gated).`,
      );
    }
    return { ...a, where: { ...a.where, id: ctx.tenantId } };
  }

  if (!TENANT_SCOPED_MODELS.has(model)) return args;

  if (!ctx?.tenantId) throw new TenantContextError(model, operation);
  const tenantId = ctx.tenantId;

  if (CREATE_LIKE.has(operation)) {
    return { ...a, data: stampData(model, a.data, tenantId) };
  }

  if (operation === 'upsert') {
    rejectForeignTenant(model, a.update, tenantId);
    return {
      ...a,
      where: { ...a.where, tenantId },
      create: stampData(model, a.create, tenantId),
    };
  }

  if (operation === 'update' || operation === 'updateMany') {
    rejectForeignTenant(model, a.data, tenantId);
  }

  // Everything else that accepts a where filter — reads, aggregates,
  // updates, deletes. findUnique works because Prisma allows non-unique
  // fields alongside the unique selector (extended where-unique).
  return { ...a, where: { ...a.where, tenantId } };
}

export const tenantScopeExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: 'tenantScope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          // Imported lazily to avoid a require cycle at module load.
          const { currentContext } = require('../context/request-context') as typeof import('../context/request-context');
          return query(applyTenantScope(model, operation, args, currentContext()));
        },
      },
    },
  }),
);
