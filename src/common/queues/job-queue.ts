import { Queue } from 'bullmq';
import { redisConnectionOptions } from './redis';

/**
 * Every job payload carries tenantId — the worker rebuilds the request
 * context from it so the tenant-scoped Prisma client works in jobs.
 */
export interface TenantJobData {
  tenantId: string;
  [key: string]: unknown;
}

export interface JobOptions {
  jobId?: string;
  /** BullMQ repeatable schedule (used for cron-style sweeps). */
  repeat?: { every: number };
}

export interface JobQueue<T extends TenantJobData = TenantJobData> {
  add(name: string, data: T, opts?: JobOptions): Promise<void>;
}

/** docs/03 §4 failure policy: 3 attempts, exponential backoff. */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

/**
 * Lazily-connected BullMQ queue: the API process only touches Redis when
 * it actually enqueues something (and e2e overrides the DI token, so
 * tests never need Redis at all).
 */
export class BullJobQueue<T extends TenantJobData = TenantJobData> implements JobQueue<T> {
  private queue?: Queue;

  constructor(private readonly name: string) {}

  async add(jobName: string, data: T, opts?: JobOptions): Promise<void> {
    this.queue ??= new Queue(this.name, {
      connection: redisConnectionOptions(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    await this.queue.add(jobName, data, opts);
  }
}
