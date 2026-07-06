import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { ScrapeRunProcessor } from '../src/modules/sourcing/scrape-run.processor';
import { createApp } from './app.factory';

/**
 * T-2 (docs/05 §3): re-running the same query creates 0 new leads and
 * increments the duplicates counter. The Apify API is faked; the
 * processor runs inline exactly as the worker would run it (inside
 * runWithContext with the job payload's tenantId).
 */
describe('Lead ingestion + dedupe — T-2 (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let apifyDataset: { items: unknown[]; failRun?: boolean };
  let token: string;
  let tenantId: string;
  let queryId: string;

  const place = (n: number, overrides: Record<string, unknown> = {}) => ({
    title: `Business ${n}`,
    website: `https://www.biz${n}.com`,
    phone: `+92 300 000${n}`,
    city: 'Lahore',
    categoryName: 'Logistics service',
    ...overrides,
  });

  beforeAll(async () => {
    ({ app, apifyDataset } = await createApp());
    server = app.getHttpServer();

    const session = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'owner@ingest.test', password: 'password123', tenantName: 'Ingest Co' })
      .expect(201);
    token = session.body.accessToken;
    tenantId = session.body.tenant.id;

    await request(server)
      .put('/api/v1/integrations/APIFY')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'apify_api_valid_KEY1' })
      .expect(200);

    const query = await request(server)
      .post('/api/v1/queries')
      .set('Authorization', `Bearer ${token}`)
      .send({ searchString: 'logistics companies', city: 'Lahore', maxResults: 30 })
      .expect(201);
    queryId = query.body.id;

    // 20 unique businesses + 2 in-batch duplicates + 3 without a website
    apifyDataset.items = [
      ...Array.from({ length: 20 }, (_, i) => place(i + 1)),
      place(1, { title: 'Business 1 (dup)' }),
      place(2, { title: 'Business 2 (dup)' }),
      place(21, { website: undefined }),
      place(22, { website: '' }),
      place(23, { website: 'not a url' }),
    ];
  });

  afterAll(async () => {
    await app.close();
  });

  async function triggerAndProcess(): Promise<string> {
    const res = await request(server)
      .post(`/api/v1/queries/${queryId}/run`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const runId = res.body.runId;
    const processor = app.get(ScrapeRunProcessor);
    // Exactly what src/worker.ts does with the job payload.
    await runWithContext({ tenantId }, () => processor.process({ tenantId, runId, queryId }));
    return runId;
  }

  it('first run normalizes, discards no-website items and inserts unique leads (FR-3.3/3.4/3.5)', async () => {
    const runId = await triggerAndProcess();

    const run = await request(server)
      .get(`/api/v1/runs/${runId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(run.body.status).toBe('SUCCESS');
    expect(run.body.found).toBe(20);
    expect(run.body.duplicates).toBe(2); // in-batch dupes of biz1/biz2
    expect(run.body.rawStats.discardedNoWebsite).toBe(3);
    expect(run.body.rawStats.apifyRunId).toBe('fake-apify-run');

    const system = app.get(SystemPrismaService);
    expect(await system.lead.count({ where: { tenantId } })).toBe(20);
    const lead = await system.lead.findFirst({
      where: { tenantId, websiteDomain: 'biz1.com' },
    });
    expect(lead?.company).toBe('Business 1');
    expect(lead?.status).toBe('NEW');
  });

  it('T-2: re-running the same query yields 0 new leads and counts every duplicate', async () => {
    const runId = await triggerAndProcess();

    const run = await request(server)
      .get(`/api/v1/runs/${runId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(run.body.status).toBe('SUCCESS');
    expect(run.body.found).toBe(0);
    expect(run.body.duplicates).toBe(22);

    const system = app.get(SystemPrismaService);
    expect(await system.lead.count({ where: { tenantId } })).toBe(20);
  });

  it('marks the query DONE after a successful run', async () => {
    const res = await request(server)
      .get('/api/v1/queries')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data[0].status).toBe('DONE');
  });

  it('a failing Apify run marks run + query FAILED and rethrows for retry', async () => {
    apifyDataset.failRun = true;

    const res = await request(server)
      .post(`/api/v1/queries/${queryId}/run`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const processor = app.get(ScrapeRunProcessor);
    await expect(
      runWithContext({ tenantId }, () =>
        processor.process({ tenantId, runId: res.body.runId, queryId }),
      ),
    ).rejects.toThrow(/FAILED/);

    const run = await request(server)
      .get(`/api/v1/runs/${res.body.runId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(run.body.status).toBe('FAILED');
    expect(run.body.rawStats.error).toContain('FAILED');

    const queries = await request(server)
      .get('/api/v1/queries')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(queries.body.data[0].status).toBe('FAILED');

    // No leads were created or lost along the way.
    const system = app.get(SystemPrismaService);
    expect(await system.lead.count({ where: { tenantId } })).toBe(20);
  });
});
