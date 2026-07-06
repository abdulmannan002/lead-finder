import { Redis } from 'ioredis';
import { redisConnectionOptions } from '../queues/redis';

/** DI token — tests override with the in-memory implementation. */
export const QUOTA_COUNTER = 'QUOTA_COUNTER';

/**
 * Monthly per-tenant quota counters (docs/03 §4: "per-tenant Hunter
 * quota counter in Redis"). Server-side by design — the API cannot
 * bypass it (same principle as non-negotiable rule 4).
 */
export interface QuotaCounter {
  /** Atomically consume 1 if under `limit` for this month. True = allowed. */
  consume(scope: string, tenantId: string, limit: number): Promise<boolean>;
}

function monthKey(scope: string, tenantId: string): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `quota:${scope}:${tenantId}:${month}`;
}

export class RedisQuotaCounter implements QuotaCounter {
  private redis?: Redis;

  async consume(scope: string, tenantId: string, limit: number): Promise<boolean> {
    this.redis ??= new Redis(redisConnectionOptions() as never);
    const key = monthKey(scope, tenantId);
    const value = await this.redis.incr(key);
    if (value === 1) await this.redis.expire(key, 40 * 86_400); // > 1 month
    if (value > limit) {
      await this.redis.decr(key); // don't burn quota on refusals
      return false;
    }
    return true;
  }
}

/** For tests and single-process dev without Redis. */
export class InMemoryQuotaCounter implements QuotaCounter {
  private readonly counts = new Map<string, number>();

  async consume(scope: string, tenantId: string, limit: number): Promise<boolean> {
    const key = monthKey(scope, tenantId);
    const next = (this.counts.get(key) ?? 0) + 1;
    if (next > limit) return false;
    this.counts.set(key, next);
    return true;
  }
}
