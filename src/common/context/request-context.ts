import { AsyncLocalStorage } from 'node:async_hooks';
import { UserRole } from '@prisma/client';

/**
 * Per-request (or per-job) context. The JWT guard fills it in for HTTP
 * requests; workers must wrap job handlers in runWithContext with the
 * tenantId stored on the job payload — same primitive everywhere.
 */
export interface RequestContext {
  userId?: string;
  tenantId?: string;
  role?: UserRole;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run fn inside a (possibly empty) context. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The current context, or undefined outside any runWithContext scope. */
export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Merge values into the current context (used by the JWT guard after
 * verifying the token). Throws if no context scope exists — that means
 * ContextMiddleware is not mounted, which must never be silently ignored.
 */
export function setContext(values: RequestContext): void {
  const store = storage.getStore();
  if (!store) {
    throw new Error('No request context scope — is ContextMiddleware mounted?');
  }
  Object.assign(store, values);
}
