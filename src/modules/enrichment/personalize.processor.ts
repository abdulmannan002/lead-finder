import { Inject, Injectable, Logger } from '@nestjs/common';
import { IntegrationKind, LeadStatus, Prisma } from '@prisma/client';
import { SecretsService } from '../../common/crypto/secrets.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { ANTHROPIC_CLIENT_FACTORY, AnthropicClientFactory, OPENER_MODEL } from './anthropic.client';
import { buildOpenerPrompt, parseOpener } from './opener';
import { htmlToText, SiteScraper } from './site-scraper';

export interface PersonalizeJobData {
  tenantId: string;
  leadId: string;
  /** Manual re-runs overwrite an existing opener (docs/04 POST /leads/:id/personalize). */
  force?: boolean;
  [key: string]: unknown;
}

/**
 * ai.personalize job (docs/03 §4): generates a ≤25-word opener from the
 * lead's homepage via the TENANT's Anthropic key (FR-5.1); GENERIC/thin
 * sites fall back to a city/category template (FR-5.2). Idempotent: skips
 * when firstLine exists unless forced. Token usage is logged per tenant
 * to the activity log (FR-5.4, M2 ruling).
 */
@Injectable()
export class PersonalizeProcessor {
  private readonly logger = new Logger(PersonalizeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scraper: SiteScraper,
    private readonly secrets: SecretsService,
    @Inject(ANTHROPIC_CLIENT_FACTORY) private readonly anthropicFactory: AnthropicClientFactory,
  ) {}

  async process(data: PersonalizeJobData): Promise<void> {
    const lead = await this.prisma.client.lead.findUnique({ where: { id: data.leadId } });
    if (!lead) return;
    if (lead.status === LeadStatus.DO_NOT_CONTACT || lead.status === LeadStatus.ARCHIVED) return;
    if (lead.firstLine && !data.force) return; // docs/03 §4 idempotency

    // The tenant's own key — no key, no opener (the lead stays READY).
    const integration = await this.prisma.client.integration.findFirst({
      where: { kind: IntegrationKind.ANTHROPIC, status: 'ACTIVE' },
    });
    if (!integration) {
      this.logger.warn(`tenant ${data.tenantId} has no ANTHROPIC key — skipping opener`);
      return;
    }
    const apiKey = this.secrets.decrypt(integration.keyEnc, integration.keyVersion);

    const homepageText = htmlToText(await this.scraper.fetchHomepage(lead.websiteDomain));

    const client = this.anthropicFactory(apiKey);
    const response = await client.messages.create({
      model: OPENER_MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: buildOpenerPrompt({
            company: lead.company,
            city: lead.city,
            category: lead.category,
            homepageText,
          }),
        },
      ],
    });

    const rawText = response.content.find((b) => b.type === 'text')?.text ?? '';
    const { opener, generic } = parseOpener(rawText, {
      category: lead.category,
      city: lead.city,
    });

    await this.prisma.client.lead.update({
      where: { id: lead.id },
      data: { firstLine: opener },
    });

    // FR-5.4 — per-tenant token transparency (M2 ruling: activity log).
    await this.prisma.client.activityLog.create({
      data: {
        action: 'ai.personalize',
        payload: {
          leadId: lead.id,
          model: OPENER_MODEL,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          generic,
        },
      } satisfies TenantCreateData<Prisma.ActivityLogUncheckedCreateInput> as unknown as Prisma.ActivityLogUncheckedCreateInput,
    });
  }
}
