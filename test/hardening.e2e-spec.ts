import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './app.factory';

/**
 * NFR-2 / docs/03 §6 rate limits. The limiter is skipped for the rest of
 * the e2e suite (they hammer endpoints by design); THROTTLE_IN_TEST=1
 * opts this spec back in.
 */
describe('Rate limits (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let token: string;

  beforeAll(async () => {
    process.env.THROTTLE_IN_TEST = '1';
    ({ app } = await createApp());
    server = app.getHttpServer();

    const session = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@limits.test', password: 'password123', tenantName: 'Limits Co' })
      .expect(201);
    token = session.body.accessToken;
  });

  afterAll(async () => {
    delete process.env.THROTTLE_IN_TEST;
    await app.close();
  });

  it('auth endpoints: 5/min per IP per endpoint, envelope code RATE_LIMITED', async () => {
    // Counters are per-endpoint: five login attempts exhaust the login budget.
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'a@limits.test', password: 'wrong-password' })
        .expect(401);
    }
    const limited = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'a@limits.test', password: 'password123' })
      .expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');

    // Even the right password is refused while limited — and other auth
    // endpoints (own counters) keep working.
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401); // 401, not 429 — separate bucket
  });

  it('API endpoints: 100/min per tenant', async () => {
    for (let i = 0; i < 100; i++) {
      const res = await request(server)
        .get('/api/v1/tenant')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 429]).toContain(res.status);
      if (res.status === 429) {
        expect(i).toBeGreaterThanOrEqual(90); // budget roughly honored
        return;
      }
    }
    const limited = await request(server)
      .get('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});
