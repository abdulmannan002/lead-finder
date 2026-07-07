import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, inviteTokenFrom, SentMail } from './app.factory';

describe('Audit log (e2e, FR-10.1)', () => {
  let app: INestApplication;
  let server: any;
  let outbox: SentMail[];
  let token: string;
  let tokenB: string;
  let userId: string;

  beforeAll(async () => {
    ({ app, outbox } = await createApp());
    server = app.getHttpServer();

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@audit.test', password: 'password123', tenantName: 'Audit A' })
      .expect(201);
    token = a.body.accessToken;
    userId = a.body.user.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@audit.test', password: 'password123', tenantName: 'Audit B' })
      .expect(201);
    tokenB = b.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('mutations are logged with the acting user; secrets are redacted', async () => {
    await request(server)
      .put('/api/v1/integrations/APIFY')
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'apify_api_valid_SECRET' })
      .expect(200);
    await request(server)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Audited campaign' })
      .expect(201);

    const res = await request(server)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const actions = res.body.data.map((r: any) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'PUT /api/v1/integrations/:kind',
        'POST /api/v1/campaigns',
      ]),
    );

    const keyChange = res.body.data.find((r: any) => r.action.includes('integrations'));
    expect(keyChange.user.email).toBe('a@audit.test');
    expect(keyChange.payload.body.key).toBe('[REDACTED]');
    expect(JSON.stringify(res.body)).not.toContain('apify_api_valid_SECRET');

    const campaignRow = res.body.data.find((r: any) => r.action === 'POST /api/v1/campaigns');
    expect(campaignRow.payload.body.name).toBe('Audited campaign'); // non-secrets kept
  });

  it('reads are not logged; unauthenticated requests are not logged', async () => {
    await request(server)
      .get('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const res = await request(server)
      .get('/api/v1/audit?action=GET')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(0);

    // signup/login are public → no user → never logged (and no crash).
    const loginLogs = await request(server)
      .get('/api/v1/audit?action=auth')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(loginLogs.body.meta.total).toBe(0);
  });

  it('filters by userId and action', async () => {
    const byUser = await request(server)
      .get(`/api/v1/audit?userId=${userId}&action=campaigns`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byUser.body.meta.total).toBe(1);
    expect(byUser.body.data[0].action).toBe('POST /api/v1/campaigns');
  });

  it('members cannot read the audit log (role guard)', async () => {
    await request(server)
      .post('/api/v1/auth/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'member@audit.test', role: 'MEMBER' })
      .expect(201);
    const accepted = await request(server)
      .post('/api/v1/auth/accept-invite')
      .send({ token: inviteTokenFrom(outbox.at(-1)!), password: 'member-pass-1' })
      .expect(200);

    const res = await request(server)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${accepted.body.accessToken}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  describe('isolation (T-1)', () => {
    it("B's audit log only contains B's actions", async () => {
      await request(server)
        .post('/api/v1/campaigns')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'B campaign' })
        .expect(201);

      const res = await request(server)
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      const bodies = JSON.stringify(res.body);
      expect(bodies).toContain('B campaign');
      expect(bodies).not.toContain('Audited campaign');
      expect(bodies).not.toContain('a@audit.test');
    });
  });
});
