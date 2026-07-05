import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './app.factory';

/**
 * T-1 foundation (docs/05 §3): a tenant-B token against tenant-A ids must
 * yield 404/403 with zero data leakage, on every endpoint that exists in
 * M0 — plus B.5: scoping follows the token's ACTIVE tenant, never the
 * caller's membership list.
 */
describe('Tenant isolation — T-1 foundation (e2e)', () => {
  let app: INestApplication;
  let server: any;

  let tokenA: string;
  let tokenB: string;
  let tenantAId: string;
  let tenantBId: string;
  let membershipAId: string;

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@iso.test', password: 'password123', tenantName: 'Tenant A' })
      .expect(201);
    tokenA = a.body.accessToken;
    tenantAId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@iso.test', password: 'password123', tenantName: 'Tenant B' })
      .expect(201);
    tokenB = b.body.accessToken;
    tenantBId = b.body.tenant.id;

    const membersA = await request(server)
      .get('/api/v1/tenant/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    membershipAId = membersA.body[0].membershipId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('two tenants sign up and each sees only its own workspace (M0 exit)', async () => {
    const a = await request(server)
      .get('/api/v1/tenant')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const b = await request(server)
      .get('/api/v1/tenant')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(a.body.id).toBe(tenantAId);
    expect(b.body.id).toBe(tenantBId);
    expect(a.body.id).not.toBe(b.body.id);
  });

  it('unauthenticated requests are rejected', async () => {
    await request(server).get('/api/v1/tenant').expect(401);
    await request(server).get('/api/v1/tenant/users').expect(401);
    await request(server).get('/api/v1/me/tenants').expect(401);
  });

  it('member lists never leak across tenants', async () => {
    const membersB = await request(server)
      .get('/api/v1/tenant/users')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(membersB.body).toHaveLength(1);
    expect(membersB.body[0].email).toBe('b@iso.test');
    expect(membersB.body.map((m: any) => m.membershipId)).not.toContain(membershipAId);
  });

  it("B cannot read or mutate A's memberships → 404", async () => {
    const patch = await request(server)
      .patch(`/api/v1/tenant/users/${membershipAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ role: 'MEMBER' })
      .expect(404);
    expect(patch.body.error.code).toBe('NOT_FOUND');

    await request(server)
      .delete(`/api/v1/tenant/users/${membershipAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    // And A is untouched.
    const membersA = await request(server)
      .get('/api/v1/tenant/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(membersA.body[0].role).toBe('OWNER');
  });

  it("B's tenant PATCH cannot touch A's settings", async () => {
    await request(server)
      .patch('/api/v1/tenant')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'B renamed', sendingEnabled: false })
      .expect(200);

    const a = await request(server)
      .get('/api/v1/tenant')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(a.body.name).toBe('Tenant A');
    expect(a.body.sendingEnabled).toBe(true);
  });

  it("B cannot switch into A's tenant → 403 NOT_A_MEMBER", async () => {
    const res = await request(server)
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ tenantId: tenantAId })
      .expect(403);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  describe('B.5 — scoping follows the ACTIVE tenant, not the membership list', () => {
    let tenantA2Id: string;
    let tokenA2: string;
    let membershipA2Id: string;

    beforeAll(async () => {
      // User A creates a second workspace but keeps the tenant-A1 token.
      const created = await request(server)
        .post('/api/v1/tenants')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Tenant A2' })
        .expect(201);
      tenantA2Id = created.body.id;

      const switched = await request(server)
        .post('/api/v1/auth/switch-tenant')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ tenantId: tenantA2Id })
        .expect(200);
      tokenA2 = switched.body.accessToken;

      const membersA2 = await request(server)
        .get('/api/v1/tenant/users')
        .set('Authorization', `Bearer ${tokenA2}`)
        .expect(200);
      membershipA2Id = membersA2.body[0].membershipId;
    });

    it('lists both memberships for the switcher', async () => {
      const res = await request(server)
        .get('/api/v1/me/tenants')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const ids = res.body.map((w: any) => w.tenantId);
      expect(ids).toEqual(expect.arrayContaining([tenantAId, tenantA2Id]));
    });

    it('an A1 token cannot read or mutate A2 data despite the membership', async () => {
      // Active tenant stays A1…
      const tenant = await request(server)
        .get('/api/v1/tenant')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(tenant.body.id).toBe(tenantAId);

      // …and A2's rows are invisible to it.
      await request(server)
        .patch(`/api/v1/tenant/users/${membershipA2Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ role: 'MEMBER' })
        .expect(404);
      await request(server)
        .delete(`/api/v1/tenant/users/${membershipA2Id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('after switching, the new token sees A2 and loses A1', async () => {
      const tenant = await request(server)
        .get('/api/v1/tenant')
        .set('Authorization', `Bearer ${tokenA2}`)
        .expect(200);
      expect(tenant.body.id).toBe(tenantA2Id);

      await request(server)
        .patch(`/api/v1/tenant/users/${membershipAId}`)
        .set('Authorization', `Bearer ${tokenA2}`)
        .send({ role: 'MEMBER' })
        .expect(404);
    });
  });
});
