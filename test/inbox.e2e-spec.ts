import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { InboundMessage } from '../src/modules/delivery/inbound-classify';
import { InboxPollProcessor } from '../src/modules/delivery/inbox-poll.processor';
import { SendDispatchProcessor } from '../src/modules/delivery/send-dispatch.processor';
import { SendPlanProcessor } from '../src/modules/delivery/send-plan.processor';
import { createApp, EnqueuedJob, FakeInbox, FakeSmtp, FakeTelegram } from './app.factory';

/**
 * Reply detection end-to-end (FR-8.x): T-6 reply stops the sequence,
 * T-7 auto-replies ignored, T-8 DSN bounces, T-11 revoked credentials,
 * plus FR-7.6 opt-out suppression and sender-fallback matching.
 */
describe('Inbox watcher (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let system: SystemPrismaService;
  let fakeSmtp: FakeSmtp;
  let fakeInbox: FakeInbox;
  let fakeTelegram: FakeTelegram;
  let dispatchQueued: EnqueuedJob[];
  let plan: SendPlanProcessor;
  let dispatch: SendDispatchProcessor;
  let inbox: InboxPollProcessor;
  let token: string;
  let tenantId: string;
  let accountId: string;
  let campaignId: string;

  const ACCOUNT_USER = 'outreach@inbox.pk';

  function inbound(overrides: Partial<InboundMessage>): InboundMessage {
    return {
      from: 'someone@lead.pk',
      subject: 'Re: hello',
      messageId: `<in-${Math.floor(Math.random() * 1e9)}@lead.pk>`,
      inReplyTo: null,
      references: [],
      headers: {},
      contentType: null,
      text: 'Interested — send details.',
      ...overrides,
    };
  }

  function deliverToInbox(mail: InboundMessage) {
    const queue = fakeInbox.pending.get(ACCOUNT_USER) ?? [];
    queue.push(mail);
    fakeInbox.pending.set(ACCOUNT_USER, queue);
  }

  const poll = () =>
    runWithContext({ tenantId }, () => inbox.process({ tenantId, accountId }));

  async function sendStepOneTo(domain: string, company: string): Promise<{
    leadId: string;
    enrollmentId: string;
    providerMsgId: string;
    leadEmail: string;
  }> {
    const lead = await system.lead.create({
      data: {
        tenantId,
        company,
        websiteDomain: domain,
        email: `ceo@${domain}`,
        status: 'READY',
        firstLine: 'Nice fleet.',
      },
    });
    await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [lead.id] })
      .expect(200);
    await plan.process({ tenantId: '', batch: true });
    for (const job of dispatchQueued.splice(0)) {
      await runWithContext({ tenantId }, () => dispatch.process(job.data as never));
    }
    const enrollment = await system.enrollment.findFirstOrThrow({ where: { leadId: lead.id } });
    const message = await system.message.findFirstOrThrow({
      where: { enrollmentId: enrollment.id, status: 'SENT' },
    });
    return {
      leadId: lead.id,
      enrollmentId: enrollment.id,
      providerMsgId: message.providerMsgId!,
      leadEmail: `ceo@${domain}`,
    };
  }

  beforeAll(async () => {
    ({ app, fakeSmtp, fakeInbox, fakeTelegram, dispatchQueued } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);
    plan = app.get(SendPlanProcessor);
    dispatch = app.get(SendDispatchProcessor);
    inbox = app.get(InboxPollProcessor);

    const session = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'owner@inbox.test', password: 'password123', tenantName: 'Inbox Co' })
      .expect(201);
    token = session.body.accessToken;
    tenantId = session.body.tenant.id;

    await request(server)
      .put('/api/v1/integrations/TELEGRAM')
      .set('Authorization', `Bearer ${token}`)
      .send({ botToken: 'valid-inbox-bot', chatId: '777' })
      .expect(200);

    const account = await request(server)
      .post('/api/v1/email-accounts/smtp')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: ACCOUNT_USER,
        host: 'smtp.inbox.pk',
        port: 587,
        user: ACCOUNT_USER,
        pass: 'p',
        imapHost: 'imap.inbox.pk',
        dailyCap: 100,
      })
      .expect(201);
    accountId = account.body.id;

    const campaign = await request(server)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Inbox campaign', emailAccountId: accountId })
      .expect(201);
    campaignId = campaign.body.id;
    await request(server)
      .put(`/api/v1/campaigns/${campaignId}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        steps: [
          { subjectTpl: 'Hello {{company}}', bodyTpl: 'Hi.\n{{signature}}', delayDays: 0 },
          { subjectTpl: 'Bump', bodyTpl: 'Bump.', delayDays: 2 },
        ],
      })
      .expect(200);
    await request(server)
      .patch(`/api/v1/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('T-6: a threaded reply stops the sequence — step 2 never sends', async () => {
    const ctx = await sendStepOneTo('t6.pk', 'T6 Freight');

    deliverToInbox(
      inbound({
        from: ctx.leadEmail,
        inReplyTo: ctx.providerMsgId,
        references: [ctx.providerMsgId],
        text: 'Interested! What are next steps?',
      }),
    );
    await poll();

    const enrollment = await system.enrollment.findUniqueOrThrow({
      where: { id: ctx.enrollmentId },
    });
    expect(enrollment.status).toBe('REPLIED');
    expect(enrollment.replyText).toContain('Interested!');
    expect(enrollment.nextDueAt).toBeNull();

    // The inbound message is stored (FR-8.2).
    const stored = await system.message.findFirst({
      where: { enrollmentId: ctx.enrollmentId, direction: 'INBOUND' },
    });
    expect(stored?.status).toBe('RECEIVED');

    // FR-8.4 — alert on both channels, immediately.
    expect(fakeTelegram.sent.at(-1)?.text).toContain('T6 Freight');
    const notifications = await request(server)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(notifications.body.data[0].type).toBe('reply');

    // Step 2 never sends: time-travel + plan → nothing for this enrollment.
    await system.enrollment.update({
      where: { id: ctx.enrollmentId },
      data: { nextDueAt: new Date(Date.now() - 1000) },
    });
    await plan.process({ tenantId: '', batch: true });
    expect(
      dispatchQueued.filter((j) => j.data.messageId).length,
    ).toBe(0);
  });

  it('T-7: an out-of-office auto-reply changes nothing and alerts nobody', async () => {
    const ctx = await sendStepOneTo('t7.pk', 'T7 Cargo');
    const alertsBefore = fakeTelegram.sent.length;

    deliverToInbox(
      inbound({
        from: ctx.leadEmail,
        inReplyTo: ctx.providerMsgId,
        subject: 'Automatic reply: Hello T7 Cargo',
        headers: { 'auto-submitted': 'auto-replied' },
        text: 'I am out of office until Monday.',
      }),
    );
    await poll();

    const enrollment = await system.enrollment.findUniqueOrThrow({
      where: { id: ctx.enrollmentId },
    });
    expect(enrollment.status).toBe('ACTIVE'); // sequence continues
    expect(enrollment.replyText).toBeNull();
    expect(fakeTelegram.sent).toHaveLength(alertsBefore);
  });

  it('T-8: a DSN bounce marks enrollment + lead BOUNCED', async () => {
    const ctx = await sendStepOneTo('t8.pk', 'T8 Movers');

    deliverToInbox(
      inbound({
        from: 'mailer-daemon@mx.inbox.pk',
        subject: 'Undeliverable: Hello T8 Movers',
        references: [ctx.providerMsgId],
        contentType: 'multipart/report; report-type=delivery-status',
        text: '550 5.1.1 unknown recipient',
      }),
    );
    await poll();

    expect(
      (await system.enrollment.findUniqueOrThrow({ where: { id: ctx.enrollmentId } })).status,
    ).toBe('BOUNCED');
    expect((await system.lead.findUniqueOrThrow({ where: { id: ctx.leadId } })).status).toBe(
      'BOUNCED',
    );
  });

  it('FR-8.2 fallback: an unthreaded reply matches by sender address', async () => {
    const ctx = await sendStepOneTo('fallback.pk', 'Fallback Ltd');

    deliverToInbox(
      inbound({
        from: ctx.leadEmail,
        subject: 'hey', // no thread headers at all
        text: 'Got your note — call me.',
      }),
    );
    await poll();

    expect(
      (await system.enrollment.findUniqueOrThrow({ where: { id: ctx.enrollmentId } })).status,
    ).toBe('REPLIED');
  });

  it('FR-7.6: opt-out intent suppresses the lead permanently', async () => {
    const ctx = await sendStepOneTo('optout.pk', 'OptOut Inc');
    const alertsBefore = fakeTelegram.sent.length;

    deliverToInbox(
      inbound({
        from: ctx.leadEmail,
        inReplyTo: ctx.providerMsgId,
        text: 'Please remove me from your list. Unsubscribe.',
      }),
    );
    await poll();

    expect((await system.lead.findUniqueOrThrow({ where: { id: ctx.leadId } })).status).toBe(
      'DO_NOT_CONTACT',
    );
    expect(
      (await system.enrollment.findUniqueOrThrow({ where: { id: ctx.enrollmentId } })).status,
    ).toBe('STOPPED');
    expect(fakeTelegram.sent).toHaveLength(alertsBefore); // no celebration

    // T-9 backstop: the suppressed lead can never be enrolled again.
    const res = await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [ctx.leadId] })
      .expect(200);
    expect(res.body.skipped).toEqual([{ id: ctx.leadId, reason: 'suppressed' }]);
  });

  it('T-11: an auth failure sets the account to ERROR, notifies, and pauses sends', async () => {
    fakeInbox.failAuthFor.add(ACCOUNT_USER);
    await poll();

    const account = await system.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.status).toBe('ERROR');

    const notifications = await request(server)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(notifications.body.data[0].type).toBe('account_error');

    // Sends for that account pause: due enrollments exist, plan books none.
    const lead = await system.lead.create({
      data: {
        tenantId,
        company: 'Paused Co',
        websiteDomain: 'paused.pk',
        email: 'x@paused.pk',
        status: 'READY',
      },
    });
    await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [lead.id] })
      .expect(200);
    await plan.process({ tenantId: '', batch: true });
    expect(dispatchQueued).toHaveLength(0);
  });
});
