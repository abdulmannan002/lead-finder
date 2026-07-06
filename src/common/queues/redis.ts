import type { ConnectionOptions } from 'bullmq';

/** BullMQ/ioredis connection options from REDIS_URL. */
export function redisConnectionOptions(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.password ? { password: url.password } : {}),
    ...(url.username ? { username: url.username } : {}),
    // Required by BullMQ: blocking commands must not be retried per-request.
    maxRetriesPerRequest: null,
  };
}
