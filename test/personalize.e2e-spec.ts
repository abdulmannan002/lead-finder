import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { PersonalizeProcessor } from '../src/modules/enrichment/personalize.processor';
import { createApp, EnqueuedJob, FakeAnthropic, FakeWeb } from './app.factory';

describe('AI personalizer (e2e, FR-5.x)', () => {
  let app: INestApplication;
  let server: any;
  let fakeWeb: FakeWeb;
  let fakeAnthropic: FakeAnthropic;
  let personalizeQueued: EnqueuedJob[];
  let system: SystemPrismaService;
  let processor: PersonalizeProcessor;
  let token: string;
  let tokenB: string;
  let tenantId: string;

  async function seedReadyLead(domain: string, extra: Record<string, unknown> = {}) {
    return system.lead.create({
      data: {
        tenantId,
        company: `Co ${domain}`,
        websiteDomain: domain,
        email: `info@${domain}`,
        emailSource: 'SCRAPE',
        status: 'READY',
        city: 'Lahore',
        category: 'Logistics service',
        ...extra,
      },
    });
  }

  function personalize(leadId: string, force = false) {
    return runWithContext({ tenantId }, () =>
      processor.process({ tenantId, leadId, force }),
    );
  }

  beforeAll(async () => {
    ({ app, fakeWeb, fakeAnthropic, personalizeQueued } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);
    processor = app.get(PersonalizeProcessor);

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@ai.test', password: 'password123', tenantName: 'AI Co' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@ai.test', password: 'password123', tenantName: 'AI B' })
      .expect(201);
    tokenB = b.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('skips quietly when the tenant has no Anthropic key', async () => {
    const lead = await seedReadyLead('nokey.pk');
    await personalize(lead.id);
    const updated = await system.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.firstLine).toBeNull();
    expect(fakeAnthropic.calls).toHaveLength(0);
  });

  describe('with a tenant key', () => {
    beforeAll(async () => {
      await request(server)
        .put('/api/v1/integrations/ANTHROPIC')
        .set('Authorization', `Bearer ${token}`)
        .send({ key: 'sk-ant-tenant-key-valid' })
        .expect(200);
    });

    it('generates an opener from homepage text with the TENANT key (FR-5.1)', async () => {
      fakeWeb.pages['alpha-ai.pk/'] =
        '<html><body><h1>Alpha Movers</h1><p>Cold-chain trucking across Punjab since 1995.</p></body></html>';
      fakeAnthropic.reply = 'Impressed by your 25 years of cold-chain trucking across Punjab.';
      const lead = await seedReadyLead('alpha-ai.pk');

      await personalize(lead.id);

      const updated = await system.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(updated.firstLine).toBe(
        'Impressed by your 25 years of cold-chain trucking across Punjab.',
      );
      const call = fakeAnthropic.calls.at(-1)!;
      expect(call.apiKey).toBe('sk-ant-tenant-key-valid'); // decrypted tenant key
      expect(call.prompt).toContain('Cold-chain trucking across Punjab');
      expect(call.prompt).not.toContain('<html>'); // html stripped for the prompt
    });

    it('logs token usage per tenant (FR-5.4 ruling)', async () => {
      const log = await system.activityLog.findFirst({
        where: { tenantId, action: 'ai.personalize' },
        orderBy: { at: 'desc' },
      });
      expect(log).toBeTruthy();
      expect(log!.payload).toMatchObject({
        model: 'claude-haiku-4-5',
        inputTokens: 420,
        outputTokens: 17,
        generic: false,
      });
    });

    it('GENERIC reply → city/category template fallback (FR-5.2)', async () => {
      fakeAnthropic.reply = 'GENERIC';
      const lead = await seedReadyLead('thin-site.pk');

      await personalize(lead.id);

      const updated = await system.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(updated.firstLine).toContain('logistics service');
      expect(updated.firstLine).toContain('Lahore');
    });

    it('skips when firstLine exists; force overwrites (docs/03 §4, FR-5.3)', async () => {
      fakeAnthropic.reply = 'A brand new opener that should only land when forced.';
      const lead = await seedReadyLead('existing.pk', { firstLine: 'Hand-written opener' });

      await personalize(lead.id);
      let updated = await system.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(updated.firstLine).toBe('Hand-written opener');

      await personalize(lead.id, true);
      updated = await system.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(updated.firstLine).toBe('A brand new opener that should only land when forced.');
    });

    it('never touches suppressed leads (rule 5)', async () => {
      const lead = await seedReadyLead('dnc-ai.pk', { status: 'DO_NOT_CONTACT' });
      await personalize(lead.id, true);
      const updated = await system.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(updated.firstLine).toBeNull();
    });

    describe('POST /leads/:id/personalize (docs/04)', () => {
      it('queues a forced re-run', async () => {
        const lead = await seedReadyLead('manual-ai.pk');
        personalizeQueued.length = 0;
        await request(server)
          .post(`/api/v1/leads/${lead.id}/personalize`)
          .set('Authorization', `Bearer ${token}`)
          .expect(202);
        expect(personalizeQueued[0].data).toMatchObject({
          tenantId,
          leadId: lead.id,
          force: true,
        });
      });

      it("B cannot personalize A's lead (T-1)", async () => {
        const lead = await seedReadyLead('iso-ai.pk');
        await request(server)
          .post(`/api/v1/leads/${lead.id}/personalize`)
          .set('Authorization', `Bearer ${tokenB}`)
          .expect(404);
      });
    });
  });
});
