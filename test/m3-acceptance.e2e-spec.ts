import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { SendDispatchProcessor } from '../src/modules/delivery/send-dispatch.processor';
import { SendPlanProcessor } from '../src/modules/delivery/send-plan.processor';
import { createApp, EnqueuedJob, FakeSmtp } from './app.factory';

/**
 * M3 exit criterion (docs/05): a 3-step sequence delivers, threads
 * correctly (T-5), respects the cap (T-4, proven in send-engine.e2e)
 * and survives worker restarts without double-send (T-3). This suite
 * walks ONE lead through the entire sequence to COMPLETED, exercising
 * plan → dispatch per step with time travel between steps.
 */
describe('M3 acceptance — full 3-step sequence lifecycle', () => {
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
  let enrollmentId: string;

  const runPlan = () => plan.process({ tenantId: '', batch: true });
  async function drainDispatch() {
    for (const job of dispatchQueued.splice(0)) {
      await runWithContext({ tenantId: job.data.tenantId }, () =>
        dispatch.process(job.data as never),
      );
    }
  }
  async function makeDue() {
    await system.enrollment.update({
      where: { id: enrollmentId },
      data: { nextDueAt: new Date(Date.now() - 1000) },
    });
  }

  beforeAll(async () => {
    ({ app, fakeSmtp, dispatchQueued } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);
    plan = app.get(SendPlanProcessor);
    dispatch = app.get(SendDispatchProcessor);

    const session = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'owner@m3.test', password: 'password123', tenantName: 'M3 Accept Co' })
      .expect(201);
    token = session.body.accessToken;
    tenantId = session.body.tenant.id;

    const account = await request(server)
      .post('/api/v1/email-accounts/smtp')
      .set('Authorization', `Bearer ${token}`)
      .send({
        address: 'inbox@m3accept.pk',
        host: 'smtp.m3accept.pk',
        port: 587,
        user: 'inbox@m3accept.pk',
        pass: 'p',
        fromName: 'M3',
        signature: '— M3',
        dailyCap: 10,
      })
      .expect(201);

    const campaign = await request(server)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '3-step', offerText: 'PKR 75k', emailAccountId: account.body.id })
      .expect(201);
    await request(server)
      .put(`/api/v1/campaigns/${campaign.body.id}/steps`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        steps: [
          { subjectTpl: 'Intro: {{company}}', bodyTpl: '{{first_line}}\n{{signature}}', delayDays: 0, threaded: true },
          { subjectTpl: 'ignored-for-threaded', bodyTpl: 'Bump 1.\n{{signature}}', delayDays: 2, threaded: true },
          { subjectTpl: 'ignored-too', bodyTpl: 'Bump 2.\n{{signature}}', delayDays: 3, threaded: true },
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
        company: 'Lifecycle Freight',
        websiteDomain: 'lifecycle.m3.pk',
        email: 'ceo@lifecycle.m3.pk',
        status: 'READY',
        city: 'Lahore',
        firstLine: 'Your cross-dock setup is impressive.',
      },
    });
    leadId = lead.id;

    await request(server)
      .post(`/api/v1/campaigns/${campaign.body.id}/enroll`)
      .set('Authorization', `Bearer ${token}`)
      .send({ leadIds: [leadId] })
      .expect(200);
    enrollmentId = (await system.enrollment.findFirstOrThrow({ where: { leadId } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('step 1 delivers with rendered variables', async () => {
    await runPlan();
    await drainDispatch();

    expect(fakeSmtp.sent).toHaveLength(1);
    const step1 = fakeSmtp.sent[0].mail;
    expect(step1.to).toBe('ceo@lifecycle.m3.pk');
    expect(step1.subject).toBe('Intro: Lifecycle Freight');
    expect(step1.text).toContain('Your cross-dock setup is impressive.');
    expect(step1.inReplyTo).toBeUndefined();
  });

  it('a worker restart between steps cannot double-send (T-3)', async () => {
    const sent = await system.message.findFirstOrThrow({ where: { tenantId, status: 'SENT' } });
    await runWithContext({ tenantId }, () => dispatch.process({ tenantId, messageId: sent.id }));
    await runWithContext({ tenantId }, () => dispatch.process({ tenantId, messageId: sent.id }));
    expect(fakeSmtp.sent).toHaveLength(1);
  });

  it('steps 2 and 3 thread on step 1 with a growing References chain (T-5)', async () => {
    const msg1 = fakeSmtp.sent[0].messageId;

    await makeDue();
    await runPlan();
    await drainDispatch();
    expect(fakeSmtp.sent).toHaveLength(2);
    const step2 = fakeSmtp.sent[1].mail;
    expect(step2.subject).toBe('Re: Intro: Lifecycle Freight');
    expect(step2.inReplyTo).toBe(msg1);
    expect(step2.references).toEqual([msg1]);

    const msg2 = fakeSmtp.sent[1].messageId;
    await makeDue();
    await runPlan();
    await drainDispatch();
    expect(fakeSmtp.sent).toHaveLength(3);
    const step3 = fakeSmtp.sent[2].mail;
    expect(step3.subject).toBe('Re: Intro: Lifecycle Freight');
    expect(step3.inReplyTo).toBe(msg2); // latest message in the thread
    expect(step3.references).toEqual([msg1, msg2]); // full chain, in order
  });

  it('the enrollment completes and planning goes quiet', async () => {
    const enrollment = await system.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(enrollment.status).toBe('COMPLETED');
    expect(enrollment.currentStep).toBe(3);
    expect(enrollment.nextDueAt).toBeNull();

    await runPlan();
    expect(dispatchQueued).toHaveLength(0);

    // Message log tells the whole story.
    const messages = await request(server)
      .get('/api/v1/messages?direction=OUTBOUND&status=SENT')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(messages.body.meta.total).toBe(3);
  });
});
