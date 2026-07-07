import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { SendDispatchProcessor } from '../src/modules/delivery/send-dispatch.processor';
import { SendPlanProcessor } from '../src/modules/delivery/send-plan.processor';
import { createApp, EnqueuedJob, FakeSmtp } from './app.factory';

/**
 * The M3 core: send.plan + send.dispatch against fakes.
 * Covers T-3 (no double-send), T-4 (cap), T-5 (threading), T-10 (kill
 * switch) and FR-7.4 (hard bounce). Tests run in order and share state.
 */
describe('Send engine (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let system: SystemPrismaService;
  let fakeSmtp: FakeSmtp;
  let dispatchQueued: EnqueuedJob[];
  let plan: SendPlanProcessor;
  let dispatch: SendDispatchProcessor;
  let token: string;
  let tenantId: string;
  let accountId: string;
  let campaignId: string;

  const STEPS = [
    { subjectTpl: 'Quick question, {{company}}', bodyTpl: '{{first_line}}\n{{signature}}', delayDays: 0, threaded: true },
    { subjectTpl: 'Following up with {{company}}', bodyTpl: 'Bumping this.\n{{signature}}', delayDays: 2, threaded: true },
    { subjectTpl: 'Last note', bodyTpl: 'Closing the loop.\n{{signature}}', delayDays: 3, threaded: true },
  ];

  async function seedLead(domain: string, company: string) {
    return system.lead.create({
      data: {
        tenantId,
        company,
        websiteDomain: domain,
        email: `boss@${domain}`,
        status: 'READY',
        city: 'Lahore',
        firstLine: 'Nice work on the fleet.',
      },
    });
  }

  const runPlan = () => plan.process({ tenantId: '', batch: true });

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
      .send({ email: 'owner@send.test', password: 'password123', tenantName: 'Send Co' })
      .expect(201);
    token = session.body.accessToken;
    tenantId = session.body.tenant.id;

    const account = await request(server)
      .post('/api/v1/email-accounts/smtp')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: 'outreach@send.pk',
        host: 'smtp.send.pk',
        port: 587,
        user: 'outreach@send.pk',
        pass: 'pass-1',
        fromName: 'Send Co',
        signature: 'Best,\nSend Co',
        dailyCap: 5, // T-4
      })
      .expect(201);
    accountId = account.body.id;

    const campaign = await request(server)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Send test', offerText: 'PKR 50k', emailAccountId: accountId })
      .expect(201);
    campaignId = campaign.body.id;
    await request(server)
      .put(`/api/v1/campaigns/${campaignId}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({ steps: STEPS })
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

  it('T-4: cap=5 with 20 due enrollments → exactly 5 sends, 15 stay due', async () => {
    const leadIds: string[] = [];
    for (let i = 1; i <= 20; i++) {
      leadIds.push((await seedLead(`cap${i}.send.pk`, `cap ${i}`)).id);
    }
    const res = await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds })
      .expect(200);
    expect(res.body.enrolled).toBe(20);

    await runPlan();
    expect(dispatchQueued).toHaveLength(5);

    // FR-7.2 — jitter: successive gaps within 3–7 minutes.
    const delays = dispatchQueued.map((j) => j.opts?.delay ?? 0);
    for (let i = 0; i < delays.length; i++) {
      const gap = delays[i] - (i === 0 ? 0 : delays[i - 1]);
      expect(gap).toBeGreaterThanOrEqual(180_000);
      expect(gap).toBeLessThanOrEqual(420_000);
    }

    await drainDispatch();
    expect(fakeSmtp.sent).toHaveLength(5);

    // Re-planning the same day adds nothing — the budget is server-side.
    await runPlan();
    expect(dispatchQueued).toHaveLength(0);

    const remaining = await system.enrollment.count({
      where: { tenantId, status: 'QUEUED', nextDueAt: { lte: new Date() } },
    });
    expect(remaining).toBe(15);
  });

  it('renders variables into subject, body and from header', () => {
    const first = fakeSmtp.sent[0];
    expect(first.mail.subject).toBe('Quick question, cap 1');
    expect(first.mail.text).toContain('Nice work on the fleet.');
    expect(first.mail.text).toContain('Best,\nSend Co');
    expect(first.mail.from).toContain('Send Co');
  });

  it('T-3: a re-delivered dispatch job never double-sends', async () => {
    const sent = await system.message.findFirstOrThrow({
      where: { tenantId, status: 'SENT' },
    });
    const before = fakeSmtp.sent.length;

    // Worker restarted and BullMQ re-delivered the job:
    await runWithContext({ tenantId }, () =>
      dispatch.process({ tenantId, messageId: sent.id }),
    );
    expect(fakeSmtp.sent).toHaveLength(before);

    const unchanged = await system.message.findUniqueOrThrow({ where: { id: sent.id } });
    expect(unchanged.status).toBe('SENT');
  });

  it('T-10: the tenant kill switch stops planning; re-enable resumes', async () => {
    // Lift the cap so only the switch gates sending from here on.
    await request(server)
      .patch(`/api/v1/email-accounts/${accountId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dailyCap: 100 })
      .expect(200);

    await request(server)
      .patch('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ sendingEnabled: false })
      .expect(200);
    await runPlan();
    expect(dispatchQueued).toHaveLength(0);

    await request(server)
      .patch('/api/v1/tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ sendingEnabled: true })
      .expect(200);
    await runPlan();
    expect(dispatchQueued).toHaveLength(15); // the leads the cap deferred
    await drainDispatch();
    expect(fakeSmtp.sent).toHaveLength(20);
  });

  it('T-5: follow-ups thread on the original message (In-Reply-To/References/Re:)', async () => {
    const enrollment = await system.enrollment.findFirstOrThrow({
      where: { tenantId, currentStep: 1, status: 'ACTIVE' },
      include: { messages: { where: { status: 'SENT' }, orderBy: { sentAt: 'asc' } } },
    });
    const firstMsg = enrollment.messages[0];

    // Time-travel past the step-2 delay.
    await system.enrollment.update({
      where: { id: enrollment.id },
      data: { nextDueAt: new Date(Date.now() - 1000) },
    });

    await runPlan();
    expect(dispatchQueued).toHaveLength(1); // only the follow-up is due
    await drainDispatch();

    const followUp = fakeSmtp.sent.at(-1)!;
    expect(followUp.mail.inReplyTo).toBe(firstMsg.providerMsgId);
    expect(followUp.mail.references).toEqual([firstMsg.providerMsgId]);
    expect(followUp.mail.subject).toBe(`Re: ${firstMsg.subject}`);

    const advanced = await system.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(advanced.currentStep).toBe(2);
    expect(advanced.status).toBe('ACTIVE');
  });

  it('a REPLIED enrollment never receives its planned message', async () => {
    const lead = await seedLead('replied.send.pk', 'Replier');
    await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [lead.id] })
      .expect(200);

    await runPlan();
    expect(dispatchQueued).toHaveLength(1);
    const enrollment = await system.enrollment.findFirstOrThrow({ where: { leadId: lead.id } });
    // The reply lands between planning and dispatch:
    await system.enrollment.update({
      where: { id: enrollment.id },
      data: { status: 'REPLIED' },
    });

    const before = fakeSmtp.sent.length;
    await drainDispatch();
    expect(fakeSmtp.sent).toHaveLength(before);

    const message = await system.message.findFirstOrThrow({
      where: { enrollmentId: enrollment.id },
    });
    expect(message.status).toBe('FAILED');
  });

  it('FR-7.4: a hard SMTP failure bounces the enrollment and flags the lead', async () => {
    const lead = await seedLead('bouncer.send.pk', 'Bouncer');
    await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [lead.id] })
      .expect(200);

    await runPlan();
    const err = new Error('550 5.1.1 user unknown') as Error & { responseCode?: number };
    err.responseCode = 550;
    fakeSmtp.failNextSendWith = err;
    await drainDispatch();

    expect((await system.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe(
      'BOUNCED',
    );
    const enrollment = await system.enrollment.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(enrollment.status).toBe('BOUNCED');
    const message = await system.message.findFirstOrThrow({
      where: { enrollmentId: enrollment.id },
    });
    expect(message.status).toBe('BOUNCED');
  });

  it('a soft failure rethrows for the retry policy and stays QUEUED', async () => {
    const lead = await seedLead('soft.send.pk', 'Softy');
    await request(server)
      .post(`/api/v1/campaigns/${campaignId}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [lead.id] })
      .expect(200);

    await runPlan();
    const job = dispatchQueued.splice(0)[0];
    fakeSmtp.failNextSendWith = new Error('421 4.7.0 try again later');
    await expect(
      runWithContext({ tenantId }, () => dispatch.process(job.data as never)),
    ).rejects.toThrow(/421/);

    const message = await system.message.findFirstOrThrow({
      where: { enrollment: { leadId: lead.id } },
    });
    expect(message.status).toBe('QUEUED'); // BullMQ retry will pick it up

    // And the retry succeeds without double-sending anything.
    const before = fakeSmtp.sent.length;
    await runWithContext({ tenantId }, () => dispatch.process(job.data as never));
    expect(fakeSmtp.sent).toHaveLength(before + 1);
  });
});
