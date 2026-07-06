import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, EnqueuedJob } from './app.factory';

describe('Sourcing queries & runs (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let queued: EnqueuedJob[];
  let tokenA: string;
  let tokenB: string;
  let tenantAId: string;
  let queryAId: string;

  beforeAll(async () => {
    ({ app, queued } = await createApp());
    server = app.getHttpServer();

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@sourcing.test', password: 'password123', tenantName: 'Sourcing A' })
      .expect(201);
    tokenA = a.body.accessToken;
    tenantAId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@sourcing.test', password: 'password123', tenantName: 'Sourcing B' })
      .expect(201);
    tokenB = b.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a query (FR-3.1)', async () => {
    const res = await request(server)
      .post('/api/v1/queries')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ searchString: 'logistics companies', city: 'Lahore', maxResults: 50 })
      .expect(201);
    queryAId = res.body.id;
    expect(res.body.status).toBe('PENDING');
    expect(res.body.maxResults).toBe(50);
  });

  it('lists with pagination meta (docs/04 conventions)', async () => {
    const res = await request(server)
      .get('/api/v1/queries?page=1&limit=10')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 10 });
    expect(res.body.data).toHaveLength(1);
  });

  it('requires an Apify key before running (FR-2.5 gate)', async () => {
    const res = await request(server)
      .post(`/api/v1/queries/${queryAId}/run`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(400);
    expect(res.body.error.code).toBe('NO_APIFY_KEY');
    expect(queued).toHaveLength(0);
  });

  it('enqueues exactly one scrape.run job with tenantId in the payload', async () => {
    await request(server)
      .put('/api/v1/integrations/APIFY')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'apify_api_valid_AAAA' })
      .expect(200);

    const res = await request(server)
      .post(`/api/v1/queries/${queryAId}/run`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', 'idem-123')
      .expect(201);
    expect(res.body.runId).toBeDefined();
    expect(queued).toHaveLength(1);
    expect(queued[0].data).toMatchObject({ tenantId: tenantAId, queryId: queryAId });
    expect(queued[0].opts?.jobId).toBe('idem-123');

    const run = await request(server)
      .get(`/api/v1/runs/${res.body.runId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(run.body.status).toBe('RUNNING');
  });

  it('refuses a second run while one is active (docs/03 §4)', async () => {
    const res = await request(server)
      .post(`/api/v1/queries/${queryAId}/run`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(409);
    expect(res.body.error.code).toBe('RUN_IN_PROGRESS');
    expect(queued).toHaveLength(1);
  });

  describe('isolation (T-1)', () => {
    it("B cannot see, edit, run or delete A's query", async () => {
      const list = await request(server)
        .get('/api/v1/queries')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(list.body.meta.total).toBe(0);

      await request(server)
        .patch(`/api/v1/queries/${queryAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ city: 'Karachi' })
        .expect(404);

      await request(server)
        .post(`/api/v1/queries/${queryAId}/run`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(server)
        .delete(`/api/v1/queries/${queryAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it("B cannot read A's run", async () => {
      const runsA = queued[0].data.runId;
      await request(server)
        .get(`/api/v1/runs/${runsA}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });
});
