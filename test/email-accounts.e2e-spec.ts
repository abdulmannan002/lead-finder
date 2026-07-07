import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { createApp, FakeSmtp } from './app.factory';

describe('Email accounts (e2e, FR-2.2/FR-2.3)', () => {
  let app: INestApplication;
  let server: any;
  let fakeSmtp: FakeSmtp;
  let system: SystemPrismaService;
  let token: string;
  let tokenB: string;
  let tenantId: string;
  let accountId: string;

  const SMTP_BODY = {
    address: 'outreach@m3co.pk',
    host: 'smtp.m3co.pk',
    port: 587,
    user: 'outreach@m3co.pk',
    pass: 'smtp-secret-pass',
    fromName: 'M3 Outreach',
    signature: 'Best,\nThe M3 team',
    dailyCap: 25,
  };

  beforeAll(async () => {
    ({ app, fakeSmtp } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@acct.test', password: 'password123', tenantName: 'Acct A' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@acct.test', password: 'password123', tenantName: 'Acct B' })
      .expect(201);
    tokenB = b.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unreachable SMTP server before saving anything', async () => {
    const res = await request(server)
      .post('/api/v1/email-accounts/smtp')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...SMTP_BODY, host: 'bad-smtp.m3co.pk' })
      .expect(400);
    expect(res.body.error.code).toBe('SMTP_CONNECT_FAILED');
    expect(await system.emailAccount.count({ where: { tenantId } })).toBe(0);
  });

  it('connects a verified account; credentials are encrypted and never returned (rule 3)', async () => {
    const res = await request(server)
      .post('/api/v1/email-accounts/smtp')
      .set('Authorization', `Bearer ${token}`)
      .send(SMTP_BODY)
      .expect(201);
    accountId = res.body.id;
    expect(res.body).toMatchObject({
      address: 'outreach@m3co.pk',
      provider: 'SMTP',
      status: 'ACTIVE',
      dailyCap: 25,
    });
    expect(JSON.stringify(res.body)).not.toContain('smtp-secret-pass');

    const row = await system.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(row.credentialsEnc).not.toContain('smtp-secret-pass');
  });

  it('lists accounts without credentials', async () => {
    const res = await request(server)
      .get('/api/v1/email-accounts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('smtp-secret-pass');
  });

  it('PATCHes cap, signature and status', async () => {
    const res = await request(server)
      .patch(`/api/v1/email-accounts/${accountId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dailyCap: 40, status: 'WARMUP' })
      .expect(200);
    expect(res.body.dailyCap).toBe(40);
    expect(res.body.status).toBe('WARMUP');
  });

  it('sends a test mail to the account itself with the decrypted creds', async () => {
    await request(server)
      .post(`/api/v1/email-accounts/${accountId}/test`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const sent = fakeSmtp.sent.at(-1)!;
    expect(sent.mail.to).toBe('outreach@m3co.pk');
    expect(sent.mail.from).toContain('M3 Outreach');
    expect(sent.creds.pass).toBe('smtp-secret-pass'); // decrypted for the transport only
  });

  it('Gmail OAuth is stubbed as 501 (M3 ruling)', async () => {
    const res = await request(server)
      .get('/api/v1/email-accounts/gmail/oauth-url')
      .set('Authorization', `Bearer ${token}`)
      .expect(501);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
  });

  describe('isolation (T-1)', () => {
    it("B sees no accounts and cannot touch A's", async () => {
      const list = await request(server)
        .get('/api/v1/email-accounts')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(list.body).toEqual([]);

      await request(server)
        .patch(`/api/v1/email-accounts/${accountId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ dailyCap: 1 })
        .expect(404);

      await request(server)
        .post(`/api/v1/email-accounts/${accountId}/test`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });
});
