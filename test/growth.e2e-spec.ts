import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { SendDispatchProcessor } from '../src/modules/delivery/send-dispatch.processor';
import { SendPlanProcessor } from '../src/modules/delivery/send-plan.processor';
import { createApp, EnqueuedJob, FakeSmtp } from './app.factory';

/**
 * MP-7 — the growth loop end to end: an invite campaign renders a
 * personalized {{invite_link}}, the recipient signs up with ?ref=,
 * and the funnel shows invited→registered.
 */
describe('Growth invitations (e2e, MP-7)', () => {
  let app: INestApplication;
  let server: any;
  let system: SystemPrismaService;
  let fakeSmtp: FakeSmtp;
  let dispatchQueued: EnqueuedJob[];
  let plan: SendPlanProcessor;
  let dispatch: SendDispatchProcessor;
  let token: string;
  let tenantId: string;
  let leadId: string;
  let inviteToken: string;

  async function drainDispatch() {
    const jobs = dispatchQueued.splice(0);
    for (const job of jobs) {
      await runWithContext({ tenantId: job.data.tenantId }, () =>
        dispatch.process(job.data as never),
      );
    }
  }

  beforeAll(async () => {
    ({ app, fakeSmtp, dispatchQueued } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);
    plan = app.get(SendPlanProcessor);
    dispatch = app.get(SendDispatchProcessor);

    const session = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'growth@signx.test', password: 'password123', tenantName: 'SignX Growth' })
      .expect(201);
    token = session.body.accessToken;
    tenantId = session.body.tenant.id;

    const account = await request(server)
      .post('/api/v1/email-accounts/smtp')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: 'invites@signx.pk',
        host: 'smtp.signx.pk',
        port: 587,
        user: 'invites@signx.pk',
        pass: 'pass-1',
        fromName: 'SignX Market',
        signature: 'SignX Market team',
        dailyCap: 50,
      })
      .expect(201);

    const campaign = await request(server)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Marketplace invites', emailAccountId: account.body.id })
      .expect(201);
    await request(server)
      .put(`/api/v1/campaigns/${campaign.body.id}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        steps: [
          {
            subjectTpl: '{{company}}, your free SignX Market listing',
            bodyTpl: 'Salam {{company}},\nClaim your free profile: {{invite_link}}\n{{signature}}',
            delayDays: 0,
            threaded: false,
          },
        ],
      })
      .expect(200);
    await request(server)
      .patch(`/api/v1/campaigns/${campaign.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const lead = await system.lead.create({
      data: {
        tenantId,
        company: 'Karachi Movers',
        websiteDomain: 'karachimovers.pk',
        email: 'owner@karachimovers.pk',
        status: 'READY',
        city: 'Karachi',
      },
    });
    leadId = lead.id;
    await request(server)
      .post(`/api/v1/campaigns/${campaign.body.id}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [leadId] })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('dispatch mints the token and renders a personalized signup link', async () => {
    await plan.process({ tenantId: '', batch: true });
    await drainDispatch();

    expect(fakeSmtp.sent).toHaveLength(1);
    const mail = fakeSmtp.sent[0].mail;
    const match = /\/signup\?ref=([A-Za-z0-9_-]+)/.exec(mail.text as string);
    expect(match).not.toBeNull();
    inviteToken = match![1];

    const lead = await system.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.inviteToken).toBe(inviteToken);
    expect(lead.invitedAt).not.toBeNull();
    expect(lead.registeredAt).toBeNull();
  });

  it('signup with ?ref= stamps invited→registered on the lead', async () => {
    const res = await request(server)
      .post('/api/v1/auth/signup')
      .send({
        email: 'owner@karachimovers.pk',
        password: 'password123',
        tenantName: 'Karachi Movers',
        ref: inviteToken,
      })
      .expect(201);

    const lead = await system.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.registeredAt).not.toBeNull();
    expect(lead.registeredTenantId).toBe(res.body.tenant.id);
  });

  it('growth stats show the funnel for the inviting tenant only', async () => {
    const stats = await request(server)
      .get('/api/v1/growth/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(stats.body).toEqual({ invited: 1, registered: 1, conversionPct: 100 });

    // The new (registered) tenant's own funnel is empty — isolation.
    const registered = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@karachimovers.pk', password: 'password123' })
      .expect(200);
    const other = await request(server)
      .get('/api/v1/growth/stats')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .expect(200);
    expect(other.body).toEqual({ invited: 0, registered: 0, conversionPct: 0 });
  });

  it('a bogus ref never blocks a signup', async () => {
    await request(server)
      .post('/api/v1/auth/signup')
      .send({
        email: 'bogus@ref.test',
        password: 'password123',
        tenantName: 'Bogus Ref Co',
        ref: 'not-a-real-token',
      })
      .expect(201);
  });
});
