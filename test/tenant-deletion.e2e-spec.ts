import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { TenantDeletionService } from '../src/modules/tenants/tenant-deletion.service';
import { createApp } from './app.factory';

describe('Tenant deletion (e2e, FR-10.3)', () => {
  let app: INestApplication;
  let server: any;
  let system: SystemPrismaService;
  let token: string;
  let tenantId: string;

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'owner@del.test', password: 'password123', tenantName: 'Deletable Co' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires the correct password (docs/04 conventions)', async () => {
    const res = await request(server)
      .delete('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(
      (await system.tenant.findUniqueOrThrow({ where: { id: tenantId } })).status,
    ).toBe('ACTIVE');
  });

  it('soft-deletes: status DELETED, sending off, sessions revoked, logins blocked', async () => {
    const res = await request(server)
      .delete('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'password123' })
      .expect(200);
    expect(res.body.deleted).toBe(true);

    const tenant = await system.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(tenant.status).toBe('DELETED');
    expect(tenant.sendingEnabled).toBe(false);
    expect(tenant.deletedAt).toBeTruthy();

    // Refresh tokens for the workspace are dead.
    const live = await system.refreshToken.count({
      where: { tenantId, revokedAt: null },
    });
    expect(live).toBe(0);

    // Login can no longer land in the deleted workspace.
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@del.test', password: 'password123' })
      .expect(403);
    expect(login.body.error.code).toBe('NO_WORKSPACE');

    // And switch-tenant refuses it too.
    const other = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'owner2@del.test', password: 'password123', tenantName: 'Other Co' })
      .expect(201);
    await request(server)
      .post('/api/v1/auth/switch-tenant')
      .set('Authorization', `Bearer ${other.body.accessToken}`)
      .send({ tenantId })
      .expect(403);
  });

  it('the 30-day purge removes everything; younger deletions survive', async () => {
    // Give the deleted tenant some rows that exercise the FK order.
    const campaign = await system.campaign.create({ data: { tenantId, name: 'Doomed' } });
    const lead = await system.lead.create({
      data: { tenantId, company: 'Doomed Co', websiteDomain: 'doomed.pk', email: 'x@doomed.pk' },
    });
    const enrollment = await system.enrollment.create({
      data: { tenantId, campaignId: campaign.id, leadId: lead.id, status: 'COMPLETED', currentStep: 1 },
    });
    await system.message.create({
      data: { tenantId, enrollmentId: enrollment.id, direction: 'OUTBOUND', status: 'SENT' },
    });

    const deletion = app.get(TenantDeletionService);

    // Not yet 30 days → survives.
    expect(await deletion.purgeExpired()).toBe(0);

    // Age the deletion 31 days → purged, cascade-clean.
    await system.tenant.update({
      where: { id: tenantId },
      data: { deletedAt: new Date(Date.now() - 31 * 86_400_000) },
    });
    expect(await deletion.purgeExpired()).toBe(1);

    expect(await system.tenant.findUnique({ where: { id: tenantId } })).toBeNull();
    expect(await system.lead.count({ where: { tenantId } })).toBe(0);
    expect(await system.message.count({ where: { tenantId } })).toBe(0);
    expect(await system.membership.count({ where: { tenantId } })).toBe(0);
  });
});
