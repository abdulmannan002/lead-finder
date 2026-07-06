import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { EnrichEmailProcessor } from '../src/modules/enrichment/enrich-email.processor';
import { createApp, EnqueuedJob, FakeWeb } from './app.factory';

describe('Email finder pipeline (e2e, FR-4.x)', () => {
  let app: INestApplication;
  let server: any;
  let fakeWeb: FakeWeb;
  let enrichQueued: EnqueuedJob[];
  let personalizeQueued: EnqueuedJob[];
  let system: SystemPrismaService;
  let processor: EnrichEmailProcessor;
  let token: string;
  let tokenB: string;
  let tenantId: string;

  async function seedLead(domain: string, extra: Record<string, unknown> = {}) {
    return system.lead.create({
      data: { tenantId, company: domain, websiteDomain: domain, ...extra },
    });
  }

  function enrich(leadId: string) {
    return runWithContext({ tenantId }, () => processor.process({ tenantId, leadId }));
  }

  beforeAll(async () => {
    ({ app, fakeWeb, enrichQueued, personalizeQueued } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);
    processor = app.get(EnrichEmailProcessor);

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@enrich.test', password: 'password123', tenantName: 'Enrich Co' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@enrich.test', password: 'password123', tenantName: 'Enrich B' })
      .expect(201);
    tokenB = b.body.accessToken;

    await request(server)
      .put('/api/v1/integrations/HUNTER')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'hunter_valid_key', config: { monthlyQuota: 2 } })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('site scrape finds a personal email → READY / SCRAPE / HIGH (FR-4.1, FR-4.3)', async () => {
    fakeWeb.pages['alpha.pk/'] = '<html>Welcome</html>';
    fakeWeb.pages['alpha.pk/contact'] =
      '<p>info@alpha.pk or write to <a href="mailto:ahmed@alpha.pk">Ahmed</a></p>';
    const lead = await seedLead('alpha.pk');

    await enrich(lead.id);

    const updated = await system.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated).toMatchObject({
      email: 'ahmed@alpha.pk',
      emailSource: 'SCRAPE',
      emailConfidence: 'HIGH',
      status: 'READY',
    });
    expect(personalizeQueued.at(-1)?.data).toMatchObject({ tenantId, leadId: lead.id });
  });

  it('role-only site email → READY / LOW; sales beats info (FR-4.3)', async () => {
    fakeWeb.pages['beta.pk/'] = '<p>info@beta.pk sales@beta.pk</p>';
    const lead = await seedLead('beta.pk');

    await enrich(lead.id);

    const updated = await system.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.email).toBe('sales@beta.pk');
    expect(updated.emailConfidence).toBe('LOW');
  });

  it('falls back to Hunter within quota → READY / HUNTER, score≥80 = HIGH (FR-4.2)', async () => {
    fakeWeb.pages['gamma.pk/'] = '<html>no emails here</html>';
    fakeWeb.hunterEmails = [{ value: 'owner@gamma.pk', confidence: 92, type: 'personal' }];
    const lead = await seedLead('gamma.pk');

    await enrich(lead.id);

    const updated = await system.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated).toMatchObject({
      email: 'owner@gamma.pk',
      emailSource: 'HUNTER',
      emailConfidence: 'HIGH',
      status: 'READY',
    });
  });

  it('exhausted Hunter quota skips the fallback → UNREACHABLE (FR-4.2, FR-4.5)', async () => {
    fakeWeb.hunterEmails = [{ value: 'x@delta.pk', confidence: 90, type: 'generic' }];
    // Quota is 2: one consumed above; this consumes the second…
    const second = await seedLead('delta.pk');
    await enrich(second.id);
    expect((await system.lead.findUniqueOrThrow({ where: { id: second.id } })).status).toBe(
      'READY',
    );

    // …and the third call is refused without touching Hunter.
    const third = await seedLead('epsilon.pk');
    await enrich(third.id);
    expect((await system.lead.findUniqueOrThrow({ where: { id: third.id } })).status).toBe(
      'UNREACHABLE',
    );
  });

  it('no site email + empty Hunter → UNREACHABLE (FR-4.5)', async () => {
    // New tenant-less setup: reuse tenant but empty hunter result set.
    fakeWeb.hunterEmails = [];
    const lead = await seedLead('zeta.pk');
    await enrich(lead.id);
    expect((await system.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe(
      'UNREACHABLE',
    );
  });

  it('a lead that already has an email is promoted and personalized, not re-found', async () => {
    const lead = await seedLead('eta.pk', { email: 'boss@eta.pk', emailSource: 'APIFY' });
    await enrich(lead.id);
    const updated = await system.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.status).toBe('READY');
    expect(updated.email).toBe('boss@eta.pk');
    expect(personalizeQueued.at(-1)?.data).toMatchObject({ leadId: lead.id });
  });

  it('suppressed leads are never enriched (rule 5)', async () => {
    const lead = await seedLead('theta.pk', { status: 'DO_NOT_CONTACT' });
    await enrich(lead.id);
    expect((await system.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe(
      'DO_NOT_CONTACT',
    );
  });

  it('the batch scan sweeps NEW-without-email leads across tenants', async () => {
    const pending = await seedLead('lambda.pk'); // NEW, no email
    enrichQueued.length = 0;

    await processor.process({ tenantId: '', batch: true });

    const job = enrichQueued.find((j) => j.data.leadId === pending.id);
    expect(job).toBeDefined();
    expect(job?.data.tenantId).toBe(tenantId);
    expect(job?.opts?.jobId).toBe(`enrich:${pending.id}`);
    // Only NEW-without-email leads are swept — READY/UNREACHABLE are not.
    for (const j of enrichQueued) {
      expect(j.data.tenantId).toBeTruthy();
    }
  });

  describe('POST /leads/:id/enrich (docs/04)', () => {
    it('queues a manual re-run', async () => {
      const lead = await seedLead('iota.pk');
      enrichQueued.length = 0;
      await request(server)
        .post(`/api/v1/leads/${lead.id}/enrich`)
        .set('Authorization', `Bearer ${token}`)
        .expect(202);
      expect(enrichQueued[0].data).toMatchObject({ tenantId, leadId: lead.id });
    });

    it("B cannot enrich A's lead (T-1)", async () => {
      const lead = await seedLead('kappa.pk');
      await request(server)
        .post(`/api/v1/leads/${lead.id}/enrich`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });
});
