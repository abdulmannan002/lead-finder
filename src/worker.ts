import { INestApplicationContext, Logger, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Job, Worker } from 'bullmq';
import { AppModule } from './app.module';
import { runWithContext } from './common/context/request-context';
import { redisConnectionOptions } from './common/queues/redis';
import { QUEUE_NAMES } from './common/queues/queue-names';
import type { TenantJobData } from './common/queues/job-queue';
import { ScrapeRunProcessor } from './modules/sourcing/scrape-run.processor';
import { EnrichEmailProcessor } from './modules/enrichment/enrich-email.processor';
import { PersonalizeProcessor } from './modules/enrichment/personalize.processor';
import { SendDispatchProcessor } from './modules/delivery/send-dispatch.processor';
import { SendPlanProcessor } from './modules/delivery/send-plan.processor';
import { InboxPollProcessor } from './modules/delivery/inbox-poll.processor';
import { RollupProcessor } from './modules/metrics/rollup.processor';
import { BullJobQueue } from './common/queues/job-queue';

interface JobProcessor {
  process(data: TenantJobData): Promise<void>;
}

/**
 * Queue → processor wiring. New milestones append here; queue names come
 * from docs/03 §4 via each processor module.
 */
const PROCESSORS: Array<{ queue: string; provider: Type<JobProcessor> }> = [
  { queue: QUEUE_NAMES.SCRAPE_RUN, provider: ScrapeRunProcessor },
  { queue: QUEUE_NAMES.ENRICH_EMAIL, provider: EnrichEmailProcessor },
  { queue: QUEUE_NAMES.AI_PERSONALIZE, provider: PersonalizeProcessor },
  { queue: QUEUE_NAMES.SEND_PLAN, provider: SendPlanProcessor },
  { queue: QUEUE_NAMES.SEND_DISPATCH, provider: SendDispatchProcessor },
  { queue: QUEUE_NAMES.INBOX_POLL, provider: InboxPollProcessor },
  { queue: QUEUE_NAMES.ROLLUP_DAILY, provider: RollupProcessor },
];

/** docs/03 §4 — the repeatable crons. */
async function registerRepeatables() {
  const enrich = new BullJobQueue(QUEUE_NAMES.ENRICH_EMAIL);
  await enrich.add(
    'batch',
    { tenantId: '', batch: true },
    { jobId: 'enrich-batch-scan', repeat: { every: 10 * 60 * 1000 } },
  );
  // send.plan every 15 min (docs/03 §4).
  const plan = new BullJobQueue(QUEUE_NAMES.SEND_PLAN);
  await plan.add(
    'plan',
    { tenantId: '', batch: true },
    { jobId: 'send-plan', repeat: { every: 15 * 60 * 1000 } },
  );
  // inbox.poll every 5 min (FR-8.1 latency bound).
  const inbox = new BullJobQueue(QUEUE_NAMES.INBOX_POLL);
  await inbox.add(
    'batch',
    { tenantId: '', batch: true },
    { jobId: 'inbox-poll-scan', repeat: { every: 5 * 60 * 1000 } },
  );
  // rollup.daily hourly — recomputes "today" per tenant tz; the run
  // nearest midnight finalizes the day (docs/03 §4 cron 23:55 semantics).
  const rollup = new BullJobQueue(QUEUE_NAMES.ROLLUP_DAILY);
  await rollup.add(
    'rollup',
    { tenantId: '', batch: true },
    { jobId: 'rollup-daily', repeat: { every: 60 * 60 * 1000 } },
  );
}

async function bootstrap() {
  const logger = new Logger('Worker');
  const app: INestApplicationContext = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const workers = PROCESSORS.map(({ queue, provider }) => {
    const processor = app.get(provider);
    const worker = new Worker(
      queue,
      // Rebuild the tenant context from the payload so the tenant-scoped
      // Prisma client behaves in jobs exactly as it does in requests.
      (job: Job<TenantJobData>) =>
        runWithContext({ tenantId: job.data.tenantId }, () => processor.process(job.data)),
      { connection: redisConnectionOptions(), concurrency: 5 },
    );
    worker.on('failed', (job, err) =>
      logger.error(`${queue}#${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`),
    );
    logger.log(`Listening on ${queue}`);
    return worker;
  });

  await registerRepeatables();

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void bootstrap();
