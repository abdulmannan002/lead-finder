import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './app.factory';

describe('Campaigns & sequence steps (e2e, FR-6.x)', () => {
  let app: INestApplication;
  let server: any;
  let token: string;
  let tokenB: string;
  let accountId: string;
  let campaignId: string;

  const STEPS = [
    {
      subjectTpl: 'Quick question, {{company}}',
      bodyTpl: '{{first_line}}\n\nWe help teams in {{city}} from {{offer_price}}.\n\n{{signature}}',
      delayDays: 0,
      threaded: true,
    },
    {
      subjectTpl: 'Following up',
      bodyTpl: 'Just floating this back up.\n\n{{signature}}',
      delayDays: 3,
      threaded: true,
    },
  ];

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@camp.test', password: 'password123', tenantName: 'Camp A' })
      .expect(201);
    token = a.body.accessToken;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@camp.test', password: 'password123', tenantName: 'Camp B' })
      .expect(201);
    tokenB = b.body.accessToken;

    const account = await request(server)
      .post('/api/v1/email-accounts/smtp')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: 'send@campa.pk',
        host: 'smtp.campa.pk',
        port: 587,
        user: 'send@campa.pk',
        pass: 'pass-123',
      })
      .expect(201);
    accountId = account.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a DRAFT campaign without a sending account (M0 flagged decision)', async () => {
    const res = await request(server)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Logistics outreach',
        offerText: 'PKR 50k/month',
        scheduleWindow: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
      })
      .expect(201);
    campaignId = res.body.id;
    expect(res.body.status).toBe('DRAFT');
  });

  it('cannot activate without an account or steps', async () => {
    const noAccount = await request(server)
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' })
      .expect(400);
    expect(noAccount.body.error.code).toBe('NO_SENDING_ACCOUNT');

    await request(server)
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ emailAccountId: accountId })
      .expect(200);

    const noSteps = await request(server)
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' })
      .expect(400);
    expect(noSteps.body.error.code).toBe('NO_STEPS');
  });

  it('T-12: unknown {{variable}} on step save → 422 naming the variable', async () => {
    const res = await request(server)
      .put(`/api/v1/campaigns/${campaignId}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        steps: [
          { subjectTpl: 'Hey {{first_name}}', bodyTpl: 'Hi {{company}}', delayDays: 0 },
        ],
      })
      .expect(422);
    expect(res.body.error.code).toBe('UNKNOWN_TEMPLATE_VARIABLE');
    expect(res.body.error.message).toContain('first_name');
    expect(res.body.error.details).toMatchObject({ step: 1, variables: ['first_name'] });
  });

  it('saves a valid sequence as a full ordered replacement (FR-6.2)', async () => {
    const res = await request(server)
      .put(`/api/v1/campaigns/${campaignId}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ steps: STEPS })
      .expect(200);
    expect(res.body.steps.map((s: any) => s.stepOrder)).toEqual([1, 2]);
    expect(res.body.steps[1].delayDays).toBe(3);

    // Replacement, not append.
    const replaced = await request(server)
      .put(`/api/v1/campaigns/${campaignId}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ steps: STEPS })
      .expect(200);
    expect(replaced.body.steps).toHaveLength(2);
  });

  it('activates once valid; steps are frozen while ACTIVE; pause unlocks', async () => {
    await request(server)
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const frozen = await request(server)
      .put(`/api/v1/campaigns/${campaignId}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ steps: STEPS })
      .expect(409);
    expect(frozen.body.error.code).toBe('CAMPAIGN_ACTIVE');

    await request(server)
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PAUSED' })
      .expect(200);

    await request(server)
      .put(`/api/v1/campaigns/${campaignId}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ steps: STEPS })
      .expect(200);
  });

  it('rejects invalid transitions and non-draft deletes', async () => {
    const bad = await request(server)
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DRAFT' })
      .expect(409);
    expect(bad.body.error.code).toBe('INVALID_TRANSITION');

    const del = await request(server)
      .delete(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    expect(del.body.error.code).toBe('NOT_DRAFT');
  });

  describe('isolation (T-1)', () => {
    it("B cannot see or mutate A's campaign", async () => {
      const list = await request(server)
        .get('/api/v1/campaigns')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(list.body.meta.total).toBe(0);

      await request(server)
        .get(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(server)
        .put(`/api/v1/campaigns/${campaignId}/steps`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ steps: STEPS })
        .expect(404);

      await request(server)
        .delete(`/api/v1/campaigns/${campaignId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it("B cannot attach A's email account to its own campaign", async () => {
      const own = await request(server)
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'B campaign' })
        .expect(201);
      await request(server)
        .patch(`/api/v1/campaigns/${own.body.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ emailAccountId: accountId })
        .expect(404);
    });
  });
});
