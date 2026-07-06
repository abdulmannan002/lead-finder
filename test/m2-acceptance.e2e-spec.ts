import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { SystemPrismaService } from '../src/common/prisma/system-prisma.service';
import { EnrichEmailProcessor } from '../src/modules/enrichment/enrich-email.processor';
import { PersonalizeProcessor } from '../src/modules/enrichment/personalize.processor';
import { createApp, EnqueuedJob, FakeAnthropic, FakeWeb } from './app.factory';

/**
 * M2 exit criterion (docs/05): a batch of 20 NEW leads → ≥60% READY with
 * emails AND openers. The whole pipeline runs — enrich.email finds
 * addresses (site scrape or Hunter), chains ai.personalize, which writes
 * the opener — with all external services faked.
 */
describe('M2 acceptance — 20 NEW leads through the pipeline', () => {
  let app: INestApplication;
  let server: any;
  let fakeWeb: FakeWeb;
  let fakeAnthropic: FakeAnthropic;
  let personalizeQueued: EnqueuedJob[];
  let system: SystemPrismaService;
  let enricher: EnrichEmailProcessor;
  let personalizer: PersonalizeProcessor;
  let token: string;
  let tenantId: string;

  beforeAll(async () => {
    ({ app, fakeWeb, fakeAnthropic, personalizeQueued } = await createApp());
    server = app.getHttpServer();
    system = app.get(SystemPrismaService);
    enricher = app.get(EnrichEmailProcessor);
    personalizer = app.get(PersonalizeProcessor);

    const session = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'owner@m2.test', password: 'password123', tenantName: 'M2 Co' })
      .expect(201);
    token = session.body.accessToken;
    tenantId = session.body.tenant.id;

    for (const kind of [
      { kind: 'HUNTER', key: 'hunter_valid_m2' },
      { kind: 'ANTHROPIC', key: 'sk-ant-valid-m2' },
    ]) {
      await request(server)
        .put(`/api/v1/integrations/${kind.kind}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ key: kind.key })
        .expect(200);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('lands ≥60% READY with email + opener', async () => {
    // 20 NEW leads: 12 with emails on their sites, 3 recoverable via
    // Hunter, 5 dead ends.
    const siteLeads = Array.from({ length: 12 }, (_, i) => `site${i + 1}.m2.pk`);
    const hunterLeads = Array.from({ length: 3 }, (_, i) => `hunter${i + 1}.m2.pk`);
    const deadLeads = Array.from({ length: 5 }, (_, i) => `dead${i + 1}.m2.pk`);

    for (const domain of [...siteLeads, ...hunterLeads, ...deadLeads]) {
      await system.lead.create({
        data: {
          tenantId,
          company: `Biz ${domain}`,
          websiteDomain: domain,
          city: 'Lahore',
          category: 'Logistics service',
        },
      });
      // Homepage exists for everyone (the personalizer reads it) …
      fakeWeb.pages[`${domain}/`] = `<html><p>We are ${domain}, moving freight daily.</p></html>`;
    }
    // …but only site leads expose a contact address.
    for (const domain of siteLeads) {
      fakeWeb.pages[`${domain}/contact`] = `<p>Reach ahmed@${domain} or info@${domain}</p>`;
    }

    const leads = await system.lead.findMany({ where: { tenantId } });
    const idByDomain = new Map(leads.map((l) => [l.websiteDomain, l.id]));

    // enrich.email for every lead, exactly as the worker would run it.
    const enrich = (domain: string) =>
      runWithContext({ tenantId }, () =>
        enricher.process({ tenantId, leadId: idByDomain.get(domain)! }),
      );

    for (const domain of siteLeads) await enrich(domain);

    fakeWeb.hunterEmails = [{ value: 'owner@recovered.pk', confidence: 85, type: 'personal' }];
    for (const domain of hunterLeads) await enrich(domain);

    fakeWeb.hunterEmails = [];
    for (const domain of deadLeads) await enrich(domain);

    // The finder chained ai.personalize for every found email — drain it.
    fakeAnthropic.reply = 'Noticed you move freight daily out of Lahore — impressive operation.';
    expect(personalizeQueued.length).toBe(15);
    for (const job of personalizeQueued) {
      await runWithContext({ tenantId: job.data.tenantId }, () =>
        personalizer.process(job.data as never),
      );
    }

    // Exit criterion: ≥60% of the batch is READY with email + opener.
    const ready = await request(server)
      .get('/api/v1/leads?status=READY&limit=50')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(ready.body.meta.total).toBe(15); // 75% ≥ 60%
    for (const lead of ready.body.data) {
      expect(lead.email).toBeTruthy();
      expect(lead.firstLine).toBeTruthy();
      expect(lead.emailSource).toMatch(/SCRAPE|HUNTER/);
    }

    const unreachable = await request(server)
      .get('/api/v1/leads?status=UNREACHABLE&limit=50')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(unreachable.body.meta.total).toBe(5);

    // FR-5.4 — one token-usage log per opener.
    const usageLogs = await system.activityLog.count({
      where: { tenantId, action: 'ai.personalize' },
    });
    expect(usageLogs).toBe(15);
  });
});
