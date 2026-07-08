import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './app.factory';

/**
 * MP-4/5/6 — the full marketplace loop:
 * buyer posts a request → matched provider is notified → provider
 * responds → buyer compares offers with contact revealed → close.
 */
describe('Marketplace requests / RFQ (e2e, MP-4/5/6)', () => {
  let app: INestApplication;
  let server: any;
  let buyerToken: string; // retailer posting the request
  let providerToken: string; // matching software house
  let bystanderToken: string; // published but unrelated category
  let requestId: string;

  const signup = async (email: string, tenantName: string) => {
    const res = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'password123', tenantName })
      .expect(201);
    return res.body.accessToken as string;
  };

  const putProfile = (token: string, body: Record<string, unknown>) =>
    request(server)
      .put('/api/v1/business-profile')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200);

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();

    buyerToken = await signup('buyer@rfq.test', 'Retail Store PK');
    providerToken = await signup('provider@rfq.test', 'DevHouse Lahore');
    bystanderToken = await signup('bystander@rfq.test', 'Caterers United');

    // Categories deliberately unique to this suite — published profiles
    // from other suites must never match this request (runInBand shares
    // one database across suites).
    await putProfile(providerToken, {
      displayName: 'DevHouse Lahore',
      category: 'Solar Installation',
      services: ['solar panels', 'net metering'],
      city: 'Lahore',
      phone: '+92 42 1234567',
      whatsapp: '+92 300 7654321',
      published: true,
    });
    await putProfile(bystanderToken, {
      displayName: 'Caterers United',
      category: 'Event Catering',
      services: ['wedding catering'],
      city: 'Karachi',
      published: true,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('buyer posts a request; only matching published providers are notified (MP-4/MP-5)', async () => {
    const res = await request(server)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        title: 'Need solar panels for my retail store',
        description: 'Retail store in Lahore wants solar panels installed with net metering support.',
        category: 'Solar Installation',
        city: 'Lahore',
        remoteOk: true,
        budget: 'PKR 200k',
      })
      .expect(201);
    requestId = res.body.id;
    expect(res.body.status).toBe('OPEN');
    expect(res.body.category).toBe('solar installation'); // normalized
    expect(res.body.notifiedProviders).toBe(1); // DevHouse only, not the caterer

    // The alert landed in the PROVIDER's in-app feed…
    const providerFeed = await request(server)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    expect(JSON.stringify(providerFeed.body.data)).toContain('Need solar panels');

    // …and NOT in the bystander's.
    const bystanderFeed = await request(server)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${bystanderToken}`)
      .expect(200);
    expect(JSON.stringify(bystanderFeed.body.data)).not.toContain('Need solar panels');
  });

  it("the provider's matched-lead feed ranks the request; responded=false (MP-5)", async () => {
    const res = await request(server)
      .get('/api/v1/requests/matched')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      id: requestId,
      responded: false,
    });
    expect(res.body.data[0].score).toBeGreaterThan(0);

    // A provider without a published profile has no feed.
    await request(server)
      .get('/api/v1/requests/matched')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(400);
  });

  it('provider responds once; duplicates 409; own request rejected (MP-6)', async () => {
    await request(server)
      .post(`/api/v1/requests/${requestId}/respond`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ pitch: 'We install solar systems for retailers — live in 2 weeks, local support included.' })
      .expect(201);

    await request(server)
      .post(`/api/v1/requests/${requestId}/respond`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ pitch: 'Second attempt should be rejected by the unique constraint.' })
      .expect(409);

    // Responding to your own request is rejected outright.
    await request(server)
      .post(`/api/v1/requests/${requestId}/respond`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ pitch: 'Trying to answer my own request should never be allowed.' })
      .expect(400);

    // Feed now shows responded=true.
    const feed = await request(server)
      .get('/api/v1/requests/matched')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    expect(feed.body.data[0].responded).toBe(true);

    // The buyer was alerted about the offer.
    const buyerFeed = await request(server)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);
    expect(JSON.stringify(buyerFeed.body.data)).toContain('New offer');
  });

  it('buyer compares offers with provider contact revealed (MP-6 contact reveal)', async () => {
    const res = await request(server)
      .get(`/api/v1/requests/${requestId}/responses`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);
    expect(res.body.offers).toHaveLength(1);
    const offer = res.body.offers[0];
    expect(offer.pitch).toContain('live in 2 weeks');
    expect(offer.provider).toMatchObject({
      slug: 'devhouse-lahore',
      displayName: 'DevHouse Lahore',
      phone: '+92 42 1234567',
      whatsapp: '+92 300 7654321',
      verified: false,
    });
  });

  it("offers are buyer-only — another tenant gets 404 on the same request (isolation)", async () => {
    await request(server)
      .get(`/api/v1/requests/${requestId}/responses`)
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(404);
    await request(server)
      .post(`/api/v1/requests/${requestId}/close`)
      .set('Authorization', `Bearer ${bystanderToken}`)
      .expect(404);
  });

  it('closing stops new offers and empties matched feeds', async () => {
    const mine = await request(server)
      .get('/api/v1/requests/mine')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);
    expect(mine.body.meta.total).toBe(1);
    expect(mine.body.data[0]._count.responses).toBe(1);

    await request(server)
      .post(`/api/v1/requests/${requestId}/close`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);

    await request(server)
      .post(`/api/v1/requests/${requestId}/respond`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ pitch: 'Too late — the request is closed, this must be rejected.' })
      .expect(404);

    const feed = await request(server)
      .get('/api/v1/requests/matched')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(200);
    expect(feed.body.meta.total).toBe(0);
  });
});
