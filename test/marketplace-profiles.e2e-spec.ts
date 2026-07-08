import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, FakeAnthropic, SentMail } from './app.factory';

describe('Marketplace profiles & directory (e2e, MP-1/2/3)', () => {
  let app: INestApplication;
  let server: any;
  let outbox: SentMail[];
  let fakeAnthropic: FakeAnthropic;
  let token: string;
  let tokenB: string;
  let slug: string;

  beforeAll(async () => {
    ({ app, outbox, fakeAnthropic } = await createApp());
    server = app.getHttpServer();

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'owner@mp.test', password: 'password123', tenantName: 'Craft Software House' })
      .expect(201);
    token = a.body.accessToken;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'other@mp.test', password: 'password123', tenantName: 'Other Biz' })
      .expect(201);
    tokenB = b.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates the workspace profile with a generated slug (MP-1)', async () => {
    const res = await request(server)
      .put('/api/v1/business-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Craft Software House',
        category: 'Software Development',
        services: ['POS systems', 'Inventory software', 'Web apps'],
        city: 'Lahore',
        whatsapp: '+92 300 1234567',
      })
      .expect(200);
    slug = res.body.slug;
    expect(slug).toBe('craft-software-house');
    expect(res.body.category).toBe('software development'); // normalized
    expect(res.body.published).toBe(false);
  });

  it('upsert updates in place — still one profile per workspace', async () => {
    const res = await request(server)
      .put('/api/v1/business-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Craft Software House',
        category: 'Software Development',
        services: ['POS systems', 'ERP'],
        city: 'Lahore',
        published: true,
      })
      .expect(200);
    expect(res.body.slug).toBe(slug); // slug is stable
    expect(res.body.published).toBe(true);
    expect(res.body.services).toEqual(['pos systems', 'erp']);
  });

  it('AI description uses the PLATFORM key and saves the result (MP-1)', async () => {
    fakeAnthropic.reply =
      'Craft Software House builds POS and ERP systems for retailers across Lahore, delivering reliable software with local support.';
    const res = await request(server)
      .post('/api/v1/business-profile/generate-description')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.description).toContain('POS and ERP');
    expect(fakeAnthropic.calls.at(-1)?.apiKey).toBe('sk-ant-platform-e2e'); // platform, not tenant
  });

  it('the public directory is unauthenticated and lists PUBLISHED profiles only (MP-2)', async () => {
    // B has no published profile → invisible.
    await request(server)
      .put('/api/v1/business-profile')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ displayName: 'Hidden Biz', category: 'Retail', services: ['x'] })
      .expect(200);

    // Other suites may publish their own profiles into the shared e2e DB —
    // assert on OUR slugs, not absolute totals.
    const res = await request(server).get('/api/v1/public/directory?limit=100').expect(200);
    const slugs = res.body.data.map((e: { slug: string }) => e.slug);
    expect(slugs).toContain(slug);
    expect(slugs).not.toContain('hidden-biz');
    const entry = res.body.data.find((e: { slug: string }) => e.slug === slug);
    expect(entry.verified).toBe(false);
    // Nothing internal leaks on public surfaces.
    expect(JSON.stringify(entry)).not.toMatch(/tenantId|"id"/);

    const filtered = await request(server)
      .get('/api/v1/public/directory?q=pos&city=lahore')
      .expect(200);
    expect(filtered.body.data.map((e: { slug: string }) => e.slug)).toContain(slug);
    const miss = await request(server).get('/api/v1/public/directory?category=plumbing').expect(200);
    expect(miss.body.meta.total).toBe(0);
  });

  it('public profile pages resolve by slug; unpublished 404s (MP-2)', async () => {
    const res = await request(server).get(`/api/v1/public/businesses/${slug}`).expect(200);
    expect(res.body.displayName).toBe('Craft Software House');
    expect(res.body.whatsapp).toBe('+92 300 1234567');

    await request(server).get('/api/v1/public/businesses/hidden-biz').expect(404);
  });

  it('email verification flips the trust badge (MP-3)', async () => {
    await request(server)
      .post('/api/v1/auth/verify-email/request')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const link = outbox.at(-1)!.link;
    const verifyToken = new URL(link).searchParams.get('token')!;

    const confirm = await request(server)
      .post('/api/v1/auth/verify-email/confirm')
      .send({ token: verifyToken })
      .expect(200);
    expect(confirm.body).toMatchObject({ verified: true, email: 'owner@mp.test' });

    // Token is single-use.
    await request(server)
      .post('/api/v1/auth/verify-email/confirm')
      .send({ token: verifyToken })
      .expect(400);

    const dir = await request(server).get('/api/v1/public/directory?limit=100').expect(200);
    const mine = dir.body.data.find((e: { slug: string }) => e.slug === slug);
    expect(mine.verified).toBe(true);
  });

  it("B's profile edits never touch A's (T-1 by construction)", async () => {
    await request(server)
      .put('/api/v1/business-profile')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ displayName: 'Hijack Attempt', category: 'Retail', services: ['x'] })
      .expect(200);

    const mine = await request(server)
      .get('/api/v1/business-profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(mine.body.displayName).toBe('Craft Software House');
  });
});
