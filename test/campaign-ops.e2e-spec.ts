import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { SendDispatchProcessor } from '../src/modules/delivery/send-dispatch.processor';
import { SendPlanProcessor } from '../src/modules/delivery/send-plan.processor';
import { createApp, EnqueuedJob, FakeSmtp } from './app.factory';

describe('Campaign ops: test-send, messages, stats (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let system: SystemPrismaService;
  let fakeSmtp: FakeSmtp;
  let dispatchQueued: EnqueuedJob[];
  let token: string;
  let tokenB: string;
  let tenantId: string;
  let campaignId: string;

  beforeAll(async () => {
    ({ app, fakeSmtp, dispatchQueued } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@ops.test', password: 'password123', tenantName: 'Ops A' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@ops.test', password: 'password123', tenantName: 'Ops B' })
      .expect(201);
    tokenB = b.body.accessToken;

    const account = await request(server)
      .post('/api/v1/email-accounts/smtp')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: 'me@ops.pk',
        host: 'smtp.ops.pk',
        port: 587,
        user: 'me@ops.pk',
        pass: 'p',
        signature: 'Cheers,\nOps',
        dailyCap: 50,
      })
      .expect(201);

    const campaign = await request(server)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ops campaign', offerText: 'PKR 99k', emailAccountId: account.body.id })
      .expect(201);
    campaignId = campaign.body.id;
    await request(server)
      .put(`/api/v1/campaigns/${campaignId}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        steps: [
          { subjectTpl: 'Intro to {{company}}', bodyTpl: 'Offer: {{offer_price}}\n{{signature}}', delayDays: 0 },
          { subjectTpl: 'Bump', bodyTpl: 'Bump.\n{{signature}}', delayDays: 2 },
        ],
      })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('test-send renders step 1 with a sample lead and mails the account itself', async () => {
    await system.lead.create({
      data: {
        tenantId,
        company: 'Sample Freight',
        websiteDomain: 'sample.ops.pk',
        email: 'x@sample.ops.pk',
        status: 'READY',
        firstLine: 'Great warehouse ops.',
      },
    });

    const res = await request(server)
      .post(`/api/v1/campaigns/${campaignId}/test-send`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.sent).toBe(true);
    expect(res.body.to).toBe('me@ops.pk');

    const mail = fakeSmtp.sent.at(-1)!;
    expect(mail.mail.to).toBe('me@ops.pk');
    expect(mail.mail.subject).toBe('[TEST] Intro to Sample Freight');
    expect(mail.mail.text).toContain('PKR 99k');
    expect(mail.mail.text).toContain('Cheers,\nOps');
    // No message row for test sends.
    expect(await system.message.count({ where: { tenantId } })).toBe(0);
  });

  it('stats + messages reflect real sends', async () => {
    await request(server)
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const lead = await system.lead.create({
      data: {
        tenantId,
        company: 'Statto',
        websiteDomain: 'statto.ops.pk',
        email: 'y@statto.ops.pk',
        status: 'READY',
      },
    });
    await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [lead.id] })
      .expect(200);

    const plan = app.get(SendPlanProcessor);
    const dispatch = app.get(SendDispatchProcessor);
    await plan.process({ tenantId: '', batch: true });
    for (const job of dispatchQueued.splice(0)) {
      await runWithContext({ tenantId }, () => dispatch.process(job.data as never));
    }

    const stats = await request(server)
      .get(`/api/v1/campaigns/${campaignId}/stats`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(stats.body.totals.sent).toBe(1);
    expect(stats.body.steps[0]).toMatchObject({ stepOrder: 1, sent: 1, replies: 0 });
    expect(stats.body.steps[1].sent).toBe(0);

    const messages = await request(server)
      .get(`/api/v1/messages?campaignId=${campaignId}&status=SENT`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(messages.body.meta.total).toBe(1);
    expect(messages.body.data[0].enrollment.lead.company).toBe('Statto');
    expect(messages.body.data[0].providerMsgId).toBeTruthy();
  });

  it('reply attribution shows up in stats (simulated M4 reply)', async () => {
    await system.enrollment.updateMany({
      where: { tenantId },
      data: { status: 'REPLIED' },
    });
    const stats = await request(server)
      .get(`/api/v1/campaigns/${campaignId}/stats`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(stats.body.steps[0].replies).toBe(1);
    expect(stats.body.steps[0].replyRate).toBe(1);
    expect(stats.body.totals.replyRate).toBe(1);
  });

  describe('isolation (T-1)', () => {
    it("B cannot test-send, read stats or see A's messages", async () => {
      await request(server)
        .post(`/api/v1/campaigns/${campaignId}/test-send`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      await request(server)
        .get(`/api/v1/campaigns/${campaignId}/stats`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      const messages = await request(server)
        .get('/api/v1/messages')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(messages.body.meta.total).toBe(0);
    });
  });
});
