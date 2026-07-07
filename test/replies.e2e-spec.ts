import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { createApp } from './app.factory';

describe('Reply inbox (e2e, FR-9.3)', () => {
  let app: INestApplication;
  let server: any;
  let system: SystemPrismaService;
  let token: string;
  let tokenB: string;
  let tenantId: string;
  let enrollmentId: string;
  let leadId: string;

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@replies.test', password: 'password123', tenantName: 'Replies A' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@replies.test', password: 'password123', tenantName: 'Replies B' })
      .expect(201);
    tokenB = b.body.accessToken;

    // A replied enrollment, as the inbox watcher would leave it.
    const campaign = await system.campaign.create({
      data: { tenantId, name: 'R campaign' },
    });
    const lead = await system.lead.create({
      data: {
        tenantId,
        company: 'Replied Freight',
        websiteDomain: 'replied.pk',
        email: 'ceo@replied.pk',
        city: 'Lahore',
        status: 'READY',
      },
    });
    leadId = lead.id;
    const enrollment = await system.enrollment.create({
      data: {
        tenantId,
        campaignId: campaign.id,
        leadId: lead.id,
        currentStep: 1,
        status: 'REPLIED',
        replyText: 'Very interested — can we talk Thursday?',
      },
    });
    enrollmentId = enrollment.id;
    // Noise: an active enrollment that must NOT appear in the inbox.
    const other = await system.lead.create({
      data: { tenantId, company: 'Quiet', websiteDomain: 'quiet.pk', email: 'x@quiet.pk' },
    });
    await system.enrollment.create({
      data: { tenantId, campaignId: campaign.id, leadId: other.id, status: 'ACTIVE' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists REPLIED enrollments with reply text and lead context', async () => {
    const res = await request(server)
      .get('/api/v1/replies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      id: enrollmentId,
      replyText: 'Very interested — can we talk Thursday?',
      lead: { company: 'Replied Freight', email: 'ceo@replied.pk' },
      campaign: { name: 'R campaign' },
      replyOutcome: null,
    });
  });

  it('marks a reply handled with an outcome; the note lands on the lead', async () => {
    const res = await request(server)
      .patch(`/api/v1/replies/${enrollmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'CALL_BOOKED', note: 'Call scheduled Thursday 3pm' })
      .expect(200);
    expect(res.body.replyOutcome).toBe('CALL_BOOKED');
    expect(res.body.replyHandledAt).toBeTruthy();

    const lead = await system.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.notes).toContain('[reply] Call scheduled Thursday 3pm');

    const unhandled = await request(server)
      .get('/api/v1/replies?unhandled=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(unhandled.body.meta.total).toBe(0);
  });

  it('404s on non-replied enrollments and validates outcomes', async () => {
    const active = await system.enrollment.findFirstOrThrow({
      where: { tenantId, status: 'ACTIVE' },
    });
    await request(server)
      .patch(`/api/v1/replies/${active.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'WON' })
      .expect(404);

    const bad = await request(server)
      .patch(`/api/v1/replies/${enrollmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'MAYBE' })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  describe('isolation (T-1)', () => {
    it("B sees an empty inbox and cannot triage A's replies", async () => {
      const list = await request(server)
        .get('/api/v1/replies')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(list.body.meta.total).toBe(0);

      await request(server)
        .patch(`/api/v1/replies/${enrollmentId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ outcome: 'WON' })
        .expect(404);
    });
  });
});
