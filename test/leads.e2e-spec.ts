import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { createApp } from './app.factory';

describe('Leads API (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let token: string;
  let tokenB: string;
  let tenantId: string;
  let leadIds: string[] = [];

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@leads.test', password: 'password123', tenantName: 'Leads A' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@leads.test', password: 'password123', tenantName: 'Leads B' })
      .expect(201);
    tokenB = b.body.accessToken;

    const system = app.get(SystemPrismaService);
    await system.lead.createMany({
      data: [
        { tenantId, company: 'Alpha Movers', websiteDomain: 'alpha-movers.com', city: 'Lahore', category: 'Movers', email: 'info@alpha-movers.com', status: 'READY' },
        { tenantId, company: 'Beta Freight', websiteDomain: 'beta-freight.com', city: 'Karachi', category: 'Freight', status: 'NEW' },
        { tenantId, company: 'Gamma Cargo', websiteDomain: 'gamma-cargo.com', city: 'Lahore', category: 'Cargo', status: 'NEW' },
      ],
    });
    const rows = await system.lead.findMany({ where: { tenantId }, orderBy: { company: 'asc' } });
    leadIds = rows.map((r) => r.id);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists with filters and pagination (FR-9.2)', async () => {
    const all = await request(server)
      .get('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(all.body.meta.total).toBe(3);

    const lahore = await request(server)
      .get('/api/v1/leads?city=lahore')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(lahore.body.meta.total).toBe(2);

    const withEmail = await request(server)
      .get('/api/v1/leads?hasEmail=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(withEmail.body.meta.total).toBe(1);
    expect(withEmail.body.data[0].company).toBe('Alpha Movers');

    const search = await request(server)
      .get('/api/v1/leads?q=beta')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(search.body.meta.total).toBe(1);

    const ready = await request(server)
      .get('/api/v1/leads?status=READY')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(ready.body.meta.total).toBe(1);
  });

  it('edits notes, firstLine and status inline', async () => {
    const res = await request(server)
      .patch(`/api/v1/leads/${leadIds[1]}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'called them', firstLine: 'Saw your freight work in Karachi', status: 'READY' })
      .expect(200);
    expect(res.body.notes).toBe('called them');
    expect(res.body.status).toBe('READY');
  });

  it('DO_NOT_CONTACT is permanent (rule 5, FR-7.6)', async () => {
    await request(server)
      .patch(`/api/v1/leads/${leadIds[2]}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DO_NOT_CONTACT' })
      .expect(200);

    const unsuppress = await request(server)
      .patch(`/api/v1/leads/${leadIds[2]}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'READY' })
      .expect(409);
    expect(unsuppress.body.error.code).toBe('SUPPRESSED');

    // Notes stay editable — only the status is frozen.
    await request(server)
      .patch(`/api/v1/leads/${leadIds[2]}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'asked us to never contact them' })
      .expect(200);
  });

  it('bulk archive skips suppressed leads with a reason (rule 5)', async () => {
    const res = await request(server)
      .post('/api/v1/leads/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: leadIds, action: 'archive' })
      .expect(201);
    expect(res.body.updated).toBe(2);
    expect(res.body.skipped).toEqual([{ id: leadIds[2], reason: 'suppressed' }]);
  });

  describe('isolation (T-1)', () => {
    it("B sees an empty list and cannot read or mutate A's leads", async () => {
      const list = await request(server)
        .get('/api/v1/leads')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(list.body.meta.total).toBe(0);

      await request(server)
        .get(`/api/v1/leads/${leadIds[0]}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(server)
        .patch(`/api/v1/leads/${leadIds[0]}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ status: 'ARCHIVED' })
        .expect(404);

      const bulk = await request(server)
        .post('/api/v1/leads/bulk')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ ids: [leadIds[0]], action: 'archive' })
        .expect(201);
      expect(bulk.body.updated).toBe(0);
      expect(bulk.body.skipped).toEqual([{ id: leadIds[0], reason: 'not_found' }]);
    });
  });
});
