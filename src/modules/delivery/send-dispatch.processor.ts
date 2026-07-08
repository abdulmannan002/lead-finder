import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AccountStatus,
  CampaignStatus,
  EnrollmentStatus,
  LeadStatus,
  MessageDirection,
  MessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { TenantJobData } from '../../common/queues/job-queue';
import { renderTemplate, TemplateVariables } from '../campaigns/template';
import { EmailAccountsService } from '../integrations/email-accounts.service';
import { SMTP_TRANSPORT_FACTORY, SmtpTransportFactory } from '../integrations/smtp';

export interface SendDispatchJobData extends TenantJobData {
  messageId: string;
}

/** SMTP replies at or above this are permanent failures (FR-7.4). */
const HARD_FAILURE_CODE = 550;

/**
 * send.dispatch (docs/03 §5): loads the QUEUED message; if it is already
 * SENT the job exits — this is the no-double-send guarantee on retry
 * (rule 2, T-3). Renders templates, threads follow-ups (FR-7.3, T-5),
 * sends via the tenant account's SMTP, stores providerMsgId (FR-7.5) and
 * advances the enrollment. Runs inside the tenant context.
 */
@Injectable()
export class SendDispatchProcessor {
  private readonly logger = new Logger(SendDispatchProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: EmailAccountsService,
    @Inject(SMTP_TRANSPORT_FACTORY) private readonly transportFactory: SmtpTransportFactory,
  ) {}

  async process(data: SendDispatchJobData): Promise<void> {
    const message = await this.prisma.client.message.findUnique({
      where: { id: data.messageId },
      include: {
        step: true,
        enrollment: {
          include: {
            lead: true,
            campaign: { include: { emailAccount: true, steps: { orderBy: { stepOrder: 'asc' } } } },
          },
        },
      },
    });
    if (!message) return;
    if (message.status === MessageStatus.SENT) return; // T-3: retry-safe
    if (message.status !== MessageStatus.QUEUED) return;

    const { enrollment, step } = message;
    const { lead, campaign } = enrollment;
    const account = campaign.emailAccount;

    // The enrollment may have been stopped/replied/bounced since planning —
    // by definition it must never receive this send (FR-8.2 semantics).
    if (
      enrollment.status !== EnrollmentStatus.QUEUED &&
      enrollment.status !== EnrollmentStatus.ACTIVE
    ) {
      await this.cancel(message.id, enrollment.id);
      return;
    }

    // Kill switches re-checked at dispatch time (T-10 belt-and-braces).
    const tenant = await this.prisma.client.tenant.findFirst({});
    if (
      !tenant?.sendingEnabled ||
      campaign.status !== CampaignStatus.ACTIVE ||
      !account ||
      (account.status !== AccountStatus.ACTIVE && account.status !== AccountStatus.WARMUP) ||
      !step ||
      !lead.email
    ) {
      await this.cancel(message.id, enrollment.id);
      return;
    }

    const vars: TemplateVariables = {
      company: lead.company,
      first_line: lead.firstLine,
      city: lead.city,
      offer_price: campaign.offerText, // M3 ruling
      signature: account.signature,
      invite_link: await this.inviteLink(lead, step.subjectTpl + step.bodyTpl),
    };
    let subject = renderTemplate(step.subjectTpl, vars);
    const body = renderTemplate(step.bodyTpl, vars);

    // FR-7.3 / T-5 — follow-ups thread on the original message.
    let inReplyTo: string | undefined;
    let references: string[] | undefined;
    if (step.threaded && enrollment.currentStep > 0) {
      const prior = await this.prisma.client.message.findMany({
        where: {
          enrollmentId: enrollment.id,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          providerMsgId: { not: null },
        },
        orderBy: { sentAt: 'asc' },
      });
      if (prior.length > 0) {
        references = prior.map((m) => m.providerMsgId!) ;
        inReplyTo = references[references.length - 1];
        subject = `Re: ${prior[0].subject ?? subject}`;
      }
    }

    try {
      const transport = this.transportFactory(this.accounts.decryptCreds(account));
      const { messageId: providerMsgId } = await transport.sendMail({
        from: this.accounts.fromHeader(account),
        to: lead.email,
        subject,
        text: body,
        inReplyTo,
        references,
      });

      const nextStep = campaign.steps[enrollment.currentStep + 1];
      await this.prisma.client.$transaction([
        this.prisma.client.message.update({
          where: { id: message.id },
          data: {
            status: MessageStatus.SENT,
            sentAt: new Date(),
            providerMsgId,
            subject,
            body,
          },
        }),
        this.prisma.client.enrollment.update({
          where: { id: enrollment.id },
          data: nextStep
            ? {
                currentStep: enrollment.currentStep + 1,
                status: EnrollmentStatus.ACTIVE,
                nextDueAt: new Date(Date.now() + nextStep.delayDays * 86_400_000),
                claimedAt: null,
              }
            : {
                currentStep: enrollment.currentStep + 1,
                status: EnrollmentStatus.COMPLETED,
                nextDueAt: null,
                claimedAt: null,
              },
        }),
      ]);
    } catch (err) {
      const code = (err as { responseCode?: number }).responseCode;
      if (code !== undefined && code >= HARD_FAILURE_CODE) {
        // FR-7.4 — hard bounce: enrollment BOUNCED, lead email flagged.
        await this.prisma.client.$transaction([
          this.prisma.client.message.update({
            where: { id: message.id },
            data: { status: MessageStatus.BOUNCED, subject, body },
          }),
          this.prisma.client.enrollment.update({
            where: { id: enrollment.id },
            data: { status: EnrollmentStatus.BOUNCED, nextDueAt: null, claimedAt: null },
          }),
          this.prisma.client.lead.update({
            where: { id: lead.id },
            data: { status: LeadStatus.BOUNCED },
          }),
        ]);
        this.logger.warn(`hard bounce for ${lead.email} (${code})`);
        return;
      }
      // Soft failure — BullMQ retries with backoff (max 3, FR-7.4); the
      // claim stays until it goes stale, so plan won't double-book.
      throw err;
    }
  }

  /**
   * MP-7 — mints the lead's marketplace invite token on first use and
   * returns the personalized signup link. Only runs when the step
   * actually uses {{invite_link}}, so ordinary outreach never mints.
   */
  private async inviteLink(
    lead: { id: string; inviteToken: string | null },
    templates: string,
  ): Promise<string | null> {
    if (!templates.includes('invite_link')) return null;
    let token = lead.inviteToken;
    if (!token) {
      token = randomBytes(12).toString('base64url');
      await this.prisma.client.lead.update({
        where: { id: lead.id },
        data: { inviteToken: token, invitedAt: new Date() },
      });
    }
    const webApp = process.env.WEB_APP_URL ?? 'http://localhost:3000';
    return `${webApp}/signup?ref=${token}`;
  }

  /** Marks a planned message dead and releases the claim for future planning. */
  private async cancel(messageId: string, enrollmentId: string): Promise<void> {
    await this.prisma.client.$transaction([
      this.prisma.client.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.FAILED },
      }),
      this.prisma.client.enrollment.update({
        where: { id: enrollmentId },
        data: { claimedAt: null },
      }),
    ]);
  }
}
