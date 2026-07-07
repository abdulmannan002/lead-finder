import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { createApp } from './app.factory';

describe('CSV exports (e2e, FR-10.2)', () => {
  let app: INestApplication;
  let server: any;
  let system: SystemPrismaService;
  let token: string;
  let tokenB: string;
  let tenantId: string;

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@export.test', password: 'password123', tenantName: 'Export A' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@export.test', password: 'password123', tenantName: 'Export B' })
      .expect(201);
    tokenB = b.body.accessToken;

    await system.lead.createMany({
      data: [
        {
          tenantId,
          company: 'Plain Co',
          websiteDomain: 'plain.ex.pk',
          email: 'a@plain.ex.pk',
          status: 'READY',
          city: 'Lahore',
        },
        {
          tenantId,
          company: 'Comma, Quotes "Inc"',
          websiteDomain: 'tricky.ex.pk',
          status: 'NEW',
          notes: 'line1\nline2',
        },
      ],
    });

    const campaign = await system.campaign.create({ data: { tenantId, name: 'Exp campaign' } });
    const enrollment = await system.enrollment.create({
      data: {
        tenantId,
        campaignId: campaign.id,
        leadId: (await system.lead.findFirstOrThrow({ where: { tenantId } })).id,
        status: 'ACTIVE',
        currentStep: 1,
      },
    });
    await system.message.create({
      data: {
        tenantId,
        enrollmentId: enrollment.id,
        direction: 'OUTBOUND',
        status: 'SENT',
        subject: 'Hello there',
        sentAt: new Date(),
        providerMsgId: '<x@ex.pk>',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('exports leads as RFC-4180 CSV honoring filters', async () => {
    const res = await request(server)
      .get('/api/v1/leads/export?status=READY')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('leads.csv');
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toContain('company,websiteDomain,email');
    expect(lines).toHaveLength(2); // header + the READY lead only
    expect(lines[1]).toContain('Plain Co');
  });

  it('escapes commas, quotes and newlines correctly', async () => {
    const res = await request(server)
      .get('/api/v1/leads/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.text).toContain('"Comma, Quotes ""Inc"""');
    expect(res.text).toContain('"line1\nline2"');
  });

  it('exports messages with lead context', async () => {
    const res = await request(server)
      .get('/api/v1/messages/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toContain('direction,status,company');
    expect(lines[1]).toContain('OUTBOUND,SENT,Plain Co');
    expect(lines[1]).toContain('Hello there');
  });

  it('exports are audited (FR-10.1)', async () => {
    const res = await request(server)
      .get('/api/v1/audit?action=EXPORT')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const actions = res.body.data.map((r: any) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(['EXPORT /leads', 'EXPORT /messages']),
    );
  });

  describe('isolation (T-1)', () => {
    it("B's exports contain only B's rows", async () => {
      const leads = await request(server)
        .get('/api/v1/leads/export')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(leads.text.trim().split('\r\n')).toHaveLength(1); // header only
      expect(leads.text).not.toContain('Plain Co');

      const messages = await request(server)
        .get('/api/v1/messages/export')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(messages.text).not.toContain('Hello there');
    });
  });
});
