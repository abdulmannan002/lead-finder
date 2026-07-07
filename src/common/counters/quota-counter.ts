import { Redis } from 'ioredis';
import { redisConnectionOptions } from '../queues/redis';

/** DI token — tests override with the in-memory implementation. */
export const QUOTA_COUNTER = 'QUOTA_COUNTER';

/**
 * Server-side period counters in Redis (docs/03 §4: Hunter quota;
 * non-negotiable rule 4: per-account daily send caps the API cannot
 * bypass). The caller supplies the period key so tests and different
 * period semantics (month for Hunter, tenant-timezone day for sends)
 * share one primitive.
 */
export interface QuotaCounter {
  /** Atomically consume 1 if under `limit` within the period. True = allowed. */
  consume(scope: string, key: string, limit: number, periodKey: string): Promise<boolean>;
}

/** 'YYYY-MM' in UTC — Hunter's monthly quota window (FR-4.2). */
export function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' in the given timezone — the cap day boundary (M3 ruling: tenant tz). */
export function dayKey(timezone: string, now = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC' }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(now);
  }
}

function redisKey(scope: string, key: string, periodKey: string): string {
  return `quota:${scope}:${key}:${periodKey}`;
}

export class RedisQuotaCounter implements QuotaCounter {
  private redis?: Redis;

  async consume(scope: string, key: string, limit: number, periodKey: string): Promise<boolean> {
    this.redis ??= new Redis(redisConnectionOptions() as never);
    const counterKey = redisKey(scope, key, periodKey);
    const value = await this.redis.incr(counterKey);
    if (value === 1) await this.redis.expire(counterKey, 40 * 86_400); // > longest period
    if (value > limit) {
      await this.redis.decr(counterKey); // don't burn quota on refusals
      return false;
    }
    return true;
  }
}

/** For tests and single-process dev without Redis. */
export class InMemoryQuotaCounter implements QuotaCounter {
  private readonly counts = new Map<string, number>();

  async consume(scope: string, key: string, limit: number, periodKey: string): Promise<boolean> {
    const counterKey = redisKey(scope, key, periodKey);
    const next = (this.counts.get(counterKey) ?? 0) + 1;
    if (next > limit) return false;
    this.counts.set(counterKey, next);
    return true;
  }
}
