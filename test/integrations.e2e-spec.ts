import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './app.factory';

describe('Integrations vault (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@integ.test', password: 'password123', tenantName: 'Integ A' })
      .expect(201);
    tokenA = a.body.accessToken;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@integ.test', password: 'password123', tenantName: 'Integ B' })
      .expect(201);
    tokenB = b.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('stores a validated key and returns only last4 (FR-2.1, FR-2.5)', async () => {
    const res = await request(server)
      .put('/api/v1/integrations/APIFY')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'apify_api_valid_ABCD' })
      .expect(200);
    expect(res.body.kind).toBe('APIFY');
    expect(res.body.keyLast4).toBe('ABCD');
    expect(JSON.stringify(res.body)).not.toContain('apify_api_valid');
  });

  it('rejects an invalid key with a clear error (FR-2.5)', async () => {
    const res = await request(server)
      .put('/api/v1/integrations/APIFY')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'apify_api_bad_key' })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_KEY');
  });

  it('accepts the docs/04 Telegram shape { botToken, chatId }', async () => {
    const res = await request(server)
      .put('/api/v1/integrations/TELEGRAM')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ botToken: 'valid-telegram-token', chatId: '42' })
      .expect(200);
    expect(res.body.config.chatId).toBe('42');
  });

  it('rejects unknown kinds', async () => {
    await request(server)
      .put('/api/v1/integrations/SLACK')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'anything-valid' })
      .expect(400);
  });

  it('lists only the caller tenant integrations (T-1)', async () => {
    const b = await request(server)
      .get('/api/v1/integrations')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(b.body).toEqual([]);

    const a = await request(server)
      .get('/api/v1/integrations')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(a.body.map((i: any) => i.kind).sort()).toEqual(['APIFY', 'TELEGRAM']);
  });

  it("B cannot delete A's integration (T-1)", async () => {
    await request(server)
      .delete('/api/v1/integrations/APIFY')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    const a = await request(server)
      .get('/api/v1/integrations')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(a.body.map((i: any) => i.kind)).toContain('APIFY');
  });

  it('re-PUT replaces the key in place', async () => {
    const res = await request(server)
      .put('/api/v1/integrations/APIFY')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ key: 'apify_api_valid_WXYZ' })
      .expect(200);
    expect(res.body.keyLast4).toBe('WXYZ');

    const list = await request(server)
      .get('/api/v1/integrations')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(list.body.filter((i: any) => i.kind === 'APIFY')).toHaveLength(1);
  });

  it('DELETE removes it', async () => {
    await request(server)
      .delete('/api/v1/integrations/TELEGRAM')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  });
});
