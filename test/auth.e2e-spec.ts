import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, inviteTokenFrom, SentMail } from './app.factory';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let outbox: SentMail[];
  let server: any;

  beforeAll(async () => {
    ({ app, outbox } = await createApp());
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  const owner = { email: 'owner@auth-e2e.test', password: 'password123', tenantName: 'Auth Co' };

  it('signs up a tenant and returns a session (FR-1.1)', async () => {
    const res = await request(server).post('/api/v1/auth/signup').send(owner).expect(201);
    expect(res.body.user.email).toBe(owner.email);
    expect(res.body.tenant.name).toBe(owner.tenantName);
    expect(res.body.role).toBe('OWNER');
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('rejects a duplicate email with the error envelope (409 EMAIL_EXISTS)', async () => {
    const res = await request(server)
      .post('/api/v1/auth/signup')
      .send({ ...owner, tenantName: 'Other Co' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
    expect(res.body.error.message).toBeDefined();
  });

  it('logs in with valid credentials and rejects bad ones', async () => {
    const ok = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password })
      .expect(200);
    expect(ok.body.tenant.name).toBe(owner.tenantName);

    const bad = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: 'wrong-password' })
      .expect(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rotates refresh tokens and kills all sessions on reuse (FR-1.2)', async () => {
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: owner.email, password: owner.password })
      .expect(200);
    const first = login.body.refreshToken;

    const rotated = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(first);

    // Replaying the rotated-out token is treated as theft.
    const reuse = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first })
      .expect(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');

    // The rotation's replacement died with every other session.
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it('validates DTOs via the envelope (VALIDATION_ERROR)', async () => {
    const res = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'not-an-email', password: 'short', tenantName: '' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  describe('invitations (FR-1.3)', () => {
    let ownerToken: string;

    beforeAll(async () => {
      const login = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password: owner.password });
      ownerToken = login.body.accessToken;
    });

    it('invites a new user who accepts with a password', async () => {
      await request(server)
        .post('/api/v1/auth/invite')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'newbie@auth-e2e.test', role: 'MEMBER' })
        .expect(201);

      const mail = outbox.at(-1)!;
      expect(mail.to).toBe('newbie@auth-e2e.test');

      // Password is required for a brand-new user…
      const missing = await request(server)
        .post('/api/v1/auth/accept-invite')
        .send({ token: inviteTokenFrom(mail) })
        .expect(400);
      expect(missing.body.error.code).toBe('PASSWORD_REQUIRED');

      // …and with one, they land in the workspace with the invited role.
      const accepted = await request(server)
        .post('/api/v1/auth/accept-invite')
        .send({ token: inviteTokenFrom(mail), password: 'newbie-pass-1' })
        .expect(200);
      expect(accepted.body.role).toBe('MEMBER');
      expect(accepted.body.tenant.name).toBe(owner.tenantName);

      // The invitation is single-use.
      const replay = await request(server)
        .post('/api/v1/auth/accept-invite')
        .send({ token: inviteTokenFrom(mail), password: 'whatever-123' })
        .expect(409);
      expect(replay.body.error.code).toBe('INVITE_USED');
    });

    it('an existing user joins without a password step', async () => {
      // A second workspace invites the (now existing) newbie.
      const other = await request(server)
        .post('/api/v1/auth/signup')
        .send({ email: 'owner2@auth-e2e.test', password: 'password123', tenantName: 'Second Co' })
        .expect(201);

      await request(server)
        .post('/api/v1/auth/invite')
        .set('Authorization', `Bearer ${other.body.accessToken}`)
        .send({ email: 'newbie@auth-e2e.test', role: 'ADMIN' })
        .expect(201);

      const accepted = await request(server)
        .post('/api/v1/auth/accept-invite')
        .send({ token: inviteTokenFrom(outbox.at(-1)!) })
        .expect(200);
      expect(accepted.body.tenant.name).toBe('Second Co');
      expect(accepted.body.role).toBe('ADMIN');
    });

    it('members cannot invite (role guard)', async () => {
      const member = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'newbie@auth-e2e.test', password: 'newbie-pass-1' })
        .expect(200);
      const res = await request(server)
        .post('/api/v1/auth/invite')
        .set('Authorization', `Bearer ${member.body.accessToken}`)
        .send({ email: 'x@auth-e2e.test', role: 'MEMBER' })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
