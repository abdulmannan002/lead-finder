import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { InboxPollProcessor } from '../src/modules/delivery/inbox-poll.processor';
import { SendDispatchProcessor } from '../src/modules/delivery/send-dispatch.processor';
import { SendPlanProcessor } from '../src/modules/delivery/send-plan.processor';
import { RollupProcessor } from '../src/modules/metrics/rollup.processor';
import { createApp, EnqueuedJob, FakeInbox, FakeTelegram } from './app.factory';

/**
 * M4 exit criterion (docs/05): reply to a test sequence → alert < 1 min,
 * enrollment REPLIED, no further sends. The alert is raised inside the
 * same poll pass that detects the reply, so detection-to-alert latency
 * is bounded by the 5-min poll cadence + 0 (FR-8.1/8.4).
 */
describe('M4 acceptance — reply lifecycle end to end', () => {
  let app: INestApplication;
  let server: any;
  let system: SystemPrismaService;
  let fakeInbox: FakeInbox;
  let fakeTelegram: FakeTelegram;
  let dispatchQueued: EnqueuedJob[];
  let plan: SendPlanProcessor;
  let dispatch: SendDispatchProcessor;
  let inbox: InboxPollProcessor;
  let token: string;
  let tenantId: string;
  let accountId: string;
  let enrollmentId: string;

  const ACCOUNT_USER = 'me@m4accept.pk';

  beforeAll(async () => {
    ({ app, fakeInbox, fakeTelegram, dispatchQueued } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);
    plan = app.get(SendPlanProcessor);
    dispatch = app.get(SendDispatchProcessor);
    inbox = app.get(InboxPollProcessor);

    const session = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'owner@m4.test', password: 'password123', tenantName: 'M4 Accept' })
      .expect(201);
    token = session.body.accessToken;
    tenantId = session.body.tenant.id;

    await request(server)
      .put('/api/v1/integrations/TELEGRAM')
      .set('Authorization', `Bearer ${token}`)
      .send({ botToken: 'valid-m4-bot', chatId: '99' })
      .expect(200);

    const account = await request(server)
      .post('/api/v1/email-accounts/smtp')
      .set('Authorization', `Bearer ${token}`)
      .send({ address: ACCOUNT_USER, host: 'smtp.m4accept.pk', port: 587, user: ACCOUNT_USER, pass: 'p', dailyCap: 50 })
      .expect(201);
    accountId = account.body.id;

    const campaign = await request(server)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'M4 sequence', emailAccountId: accountId })
      .expect(201);
    await request(server)
      .put(`/api/v1/campaigns/${campaign.body.id}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        steps: [
          { subjectTpl: 'Hi {{company}}', bodyTpl: 'Intro.', delayDays: 0 },
          { subjectTpl: 'Bump', bodyTpl: 'Bump.', delayDays: 2 },
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
        company: 'Exit Criterion Co',
        websiteDomain: 'exit.m4.pk',
        email: 'ceo@exit.m4.pk',
        status: 'READY',
      },
    });
    await request(server)
      .post(`/api/v1/campaigns/${campaign.body.id}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [lead.id] })
      .expect(200);
    enrollmentId = (await system.enrollment.findFirstOrThrow({ where: { leadId: lead.id } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('step 1 goes out; the reply flips everything within one poll pass', async () => {
    // Step 1 delivery.
    await plan.process({ tenantId: '', batch: true });
    for (const job of dispatchQueued.splice(0)) {
      await runWithContext({ tenantId }, () => dispatch.process(job.data as never));
    }
    const sent = await system.message.findFirstOrThrow({
      where: { enrollmentId, status: 'SENT' },
    });

    // The prospect replies.
    fakeInbox.pending.set(ACCOUNT_USER, [
      {
        from: 'ceo@exit.m4.pk',
        subject: 'Re: Hi Exit Criterion Co',
        messageId: '<reply-1@exit.m4.pk>',
        inReplyTo: sent.providerMsgId!,
        references: [sent.providerMsgId!],
        headers: {},
        contentType: null,
        text: 'Perfect timing — send me a quote.',
      },
    ]);

    const detectionStart = Date.now();
    await runWithContext({ tenantId }, () => inbox.process({ tenantId, accountId }));
    const detectionMs = Date.now() - detectionStart;

    // Alert on both channels, inside the same pass (« 1 minute).
    expect(detectionMs).toBeLessThan(60_000);
    expect(fakeTelegram.sent.at(-1)?.text).toContain('Exit Criterion Co');
    const notifications = await request(server)
      .get('/api/v1/notifications?unread=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(notifications.body.data[0].type).toBe('reply');

    // Enrollment REPLIED with the reply captured.
    const enrollment = await system.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(enrollment.status).toBe('REPLIED');
    expect(enrollment.replyText).toContain('send me a quote');

    // No further sends — even when step 2 would be due.
    await system.enrollment.update({
      where: { id: enrollmentId },
      data: { nextDueAt: new Date(Date.now() - 1000) },
    });
    await plan.process({ tenantId: '', batch: true });
    expect(dispatchQueued).toHaveLength(0);
  });

  it('the reply shows up in the inbox and the day rolls up', async () => {
    const replies = await request(server)
      .get('/api/v1/replies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(replies.body.meta.total).toBe(1);
    expect(replies.body.data[0].lead.company).toBe('Exit Criterion Co');

    await request(server)
      .patch(`/api/v1/replies/${enrollmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ outcome: 'CALL_BOOKED', note: 'Quote requested' })
      .expect(200);

    const rollup = app.get(RollupProcessor);
    await rollup.process({ tenantId: '', batch: true });
    const daily = await request(server)
      .get('/api/v1/metrics/daily')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(daily.body[0]).toMatchObject({ sent: 1, replies: 1 });

    const funnel = await request(server)
      .get('/api/v1/metrics/funnel')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(funnel.body).toMatchObject({ enrolled: 1, sent: 1, replied: 1 });
  });
});
