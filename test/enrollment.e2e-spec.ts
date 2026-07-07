import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { createApp } from './app.factory';

describe('Enrollment (e2e, FR-6.3/FR-6.4, T-9)', () => {
  let app: INestApplication;
  let server: any;
  let system: SystemPrismaService;
  let token: string;
  let tokenB: string;
  let tenantId: string;
  let campaignId: string;
  let campaign2Id: string;

  let readyLead: string;
  let suppressedLead: string;
  let noEmailLead: string;

  const STEPS = [{ subjectTpl: 'Hi {{company}}', bodyTpl: '{{first_line}}\n{{signature}}', delayDays: 0 }];

  async function createCampaign(name: string): Promise<string> {
    const res = await request(server)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ name })
      .expect(201);
    await request(server)
      .put(`/api/v1/campaigns/${res.body.id}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ steps: STEPS })
      .expect(200);
    return res.body.id;
  }

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@enroll.test', password: 'password123', tenantName: 'Enroll A' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@enroll.test', password: 'password123', tenantName: 'Enroll B' })
      .expect(201);
    tokenB = b.body.accessToken;

    campaignId = await createCampaign('Campaign One');
    campaign2Id = await createCampaign('Campaign Two');

    const mk = (domain: string, extra: Record<string, unknown> = {}) =>
      system.lead.create({
        data: { tenantId, company: domain, websiteDomain: domain, city: 'Lahore', ...extra },
      });
    readyLead = (await mk('ready.en.pk', { email: 'x@ready.en.pk', status: 'READY' })).id;
    suppressedLead = (await mk('dnc.en.pk', { email: 'x@dnc.en.pk', status: 'DO_NOT_CONTACT' })).id;
    noEmailLead = (await mk('noemail.en.pk')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('enrolls by ids with per-lead skip reasons (T-9: suppressed never enrolls)', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    const res = await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [readyLead, suppressedLead, noEmailLead, ghost] })
      .expect(200);

    expect(res.body.enrolled).toBe(1);
    expect(res.body.skipped).toEqual(
      expect.arrayContaining([
        { id: suppressedLead, reason: 'suppressed' },
        { id: noEmailLead, reason: 'no_email' },
        { id: ghost, reason: 'not_found' },
      ]),
    );
  });

  it('re-enrolling and cross-campaign enrolling both hit FR-6.4 (one active per lead)', async () => {
    const again = await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [readyLead] })
      .expect(200);
    expect(again.body.skipped).toEqual([{ id: readyLead, reason: 'already_active' }]);

    const other = await request(server)
      .post(`/api/v1/campaigns/${campaign2Id}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [readyLead] })
      .expect(200);
    expect(other.body.skipped).toEqual([{ id: readyLead, reason: 'already_active' }]);
  });

  it('after a manual stop the lead can join another campaign', async () => {
    const list = await request(server)
      .get(`/api/v1/campaigns/${campaignId}/enrollments`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const enrollmentId = list.body.data[0].id;
    expect(list.body.data[0].lead.company).toBe('ready.en.pk');

    await request(server)
      .post(`/api/v1/enrollments/${enrollmentId}/stop`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(server)
      .post(`/api/v1/campaigns/${campaign2Id}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [readyLead] })
      .expect(200);
    expect(res.body.enrolled).toBe(1);

    // Stopping twice is a 409, not a silent no-op.
    await request(server)
      .post(`/api/v1/enrollments/${enrollmentId}/stop`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('enrolls by filter (FR-6.3 rule enrollment)', async () => {
    await system.lead.create({
      data: {
        tenantId,
        company: 'filter.en.pk',
        websiteDomain: 'filter.en.pk',
        email: 'y@filter.en.pk',
        status: 'READY',
        city: 'Karachi',
      },
    });
    const res = await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ filter: { status: 'READY', city: 'Karachi' } })
      .expect(200);
    expect(res.body.enrolled).toBe(1);
  });

  it('bulk action=enroll routes through the same skip logic (docs/04)', async () => {
    const res = await request(server)
      .post('/api/v1/leads/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [suppressedLead], action: 'enroll', campaignId })
      .expect(201);
    expect(res.body.skipped).toEqual([{ id: suppressedLead, reason: 'suppressed' }]);

    await request(server)
      .post('/api/v1/leads/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [suppressedLead], action: 'enroll' })
      .expect(400); // campaignId required
  });

  describe('isolation (T-1)', () => {
    it("B cannot enroll into, list, or stop anything of A's", async () => {
      await request(server)
        .post(`/api/v1/campaigns/${campaignId}/enroll`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ leadIds: [readyLead] })
        .expect(404);

      await request(server)
        .get(`/api/v1/campaigns/${campaignId}/enrollments`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      const enrollment = await system.enrollment.findFirst({ where: { tenantId } });
      await request(server)
        .post(`/api/v1/enrollments/${enrollment!.id}/stop`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });
});
