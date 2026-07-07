import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { RollupProcessor } from '../src/modules/metrics/rollup.processor';
import { createApp } from './app.factory';

describe('Metrics & rollups (e2e, FR-9.1/FR-9.5)', () => {
  let app: INestApplication;
  let server: any;
  let system: SystemPrismaService;
  let rollup: RollupProcessor;
  let token: string;
  let tokenB: string;
  let tenantId: string;

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);
    rollup = app.get(RollupProcessor);

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@metrics.test', password: 'password123', tenantName: 'Metrics A' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@metrics.test', password: 'password123', tenantName: 'Metrics B' })
      .expect(201);
    tokenB = b.body.accessToken;

    // Seed a realistic day: campaign, leads, enrollments, messages.
    const campaign = await system.campaign.create({
      data: { tenantId, name: 'M campaign', status: 'ACTIVE' },
    });
    const query = await system.scrapeQuery.create({
      data: { tenantId, searchString: 'x', city: 'Lahore' },
    });
    const run = await system.scrapeRun.create({
      data: { tenantId, queryId: query.id, status: 'SUCCESS' },
    });
    const mkLead = (i: number, extra: Record<string, unknown> = {}) =>
      system.lead.create({
        data: {
          tenantId,
          company: `M${i}`,
          websiteDomain: `m${i}.metrics.pk`,
          scrapeRunId: run.id,
          ...extra,
        },
      });

    const l1 = await mkLead(1, { email: 'a@m1.pk', emailSource: 'SCRAPE', status: 'READY' });
    const l2 = await mkLead(2, { email: 'b@m2.pk', emailSource: 'HUNTER', status: 'READY' });
    const l3 = await mkLead(3); // scraped, no email
    void l3;

    const e1 = await system.enrollment.create({
      data: { tenantId, campaignId: campaign.id, leadId: l1.id, currentStep: 1, status: 'REPLIED', replyOutcome: 'WON', replyText: 'yes' },
    });
    const e2 = await system.enrollment.create({
      data: { tenantId, campaignId: campaign.id, leadId: l2.id, currentStep: 1, status: 'ACTIVE' },
    });

    await system.message.createMany({
      data: [
        { tenantId, enrollmentId: e1.id, direction: 'OUTBOUND', status: 'SENT', sentAt: new Date() },
        { tenantId, enrollmentId: e2.id, direction: 'OUTBOUND', status: 'SENT', sentAt: new Date() },
        { tenantId, enrollmentId: e1.id, direction: 'INBOUND', status: 'RECEIVED', sentAt: new Date() },
        { tenantId, enrollmentId: e2.id, direction: 'OUTBOUND', status: 'BOUNCED' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('the rollup upserts today and re-running is idempotent (FR-9.5)', async () => {
    await rollup.process({ tenantId: '', batch: true });
    await rollup.process({ tenantId: '', batch: true }); // idempotent upsert

    const rows = await system.dailyMetric.findMany({ where: { tenantId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      leadsScraped: 3,
      emailsFound: 2,
      sent: 2,
      replies: 1,
      bounces: 1,
    });
  });

  it('GET /metrics/daily returns the rollup rows', async () => {
    const res = await request(server)
      .get('/api/v1/metrics/daily')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].sent).toBe(2);
  });

  it('GET /metrics/overview returns pipeline + 30-day reply rate', async () => {
    const res = await request(server)
      .get('/api/v1/metrics/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.pipeline.READY).toBe(2);
    expect(res.body.pipeline.NEW).toBe(1);
    expect(res.body.activeCampaigns).toBe(1);
    expect(res.body.last30d).toMatchObject({ sent: 2, replies: 1, replyRate: 0.5 });
  });

  it('GET /metrics/funnel returns lead → enrolled → sent → replied → won', async () => {
    const res = await request(server)
      .get('/api/v1/metrics/funnel')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ leads: 3, enrolled: 2, sent: 2, replied: 1, won: 1 });
  });

  describe('isolation (T-1)', () => {
    it("B's metrics are empty", async () => {
      const daily = await request(server)
        .get('/api/v1/metrics/daily')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(daily.body).toEqual([]);

      const funnel = await request(server)
        .get('/api/v1/metrics/funnel')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(funnel.body.leads).toBe(0);
    });
  });
});
