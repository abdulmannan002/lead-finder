import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailAccountsService } from '../integrations/email-accounts.service';
import { SMTP_TRANSPORT_FACTORY, SmtpTransportFactory } from '../integrations/smtp';
import { renderTemplate, TemplateVariables } from './template';

@Injectable()
export class CampaignOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: EmailAccountsService,
    @Inject(SMTP_TRANSPORT_FACTORY) private readonly transportFactory: SmtpTransportFactory,
  ) {}

  /** docs/04 — renders step 1 for a sample lead and sends it to the account itself. */
  async testSend(campaignId: string) {
    const campaign = await this.prisma.client.campaign.findUnique({
      where: { id: campaignId },
      include: { steps: { orderBy: { stepOrder: 'asc' } }, emailAccount: true },
    });
    if (!campaign) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campaign not found' });
    if (campaign.steps.length === 0) {
      throw new BadRequestException({ code: 'NO_STEPS', message: 'Add a sequence step first' });
    }
    if (!campaign.emailAccount) {
      throw new BadRequestException({
        code: 'NO_SENDING_ACCOUNT',
        message: 'Connect a sending account first',
      });
    }

    // A real lead where possible; placeholders otherwise.
    const sample = await this.prisma.client.lead.findFirst({
      where: { email: { not: null }, status: { not: 'DO_NOT_CONTACT' } },
      orderBy: { updatedAt: 'desc' },
    });
    const vars: TemplateVariables = {
      company: sample?.company ?? 'Acme Example Co',
      first_line: sample?.firstLine ?? 'Loved what you are building over at Acme.',
      city: sample?.city ?? 'Lahore',
      offer_price: campaign.offerText,
      signature: campaign.emailAccount.signature,
    };

    const step = campaign.steps[0];
    const account = campaign.emailAccount;
    const transport = this.transportFactory(this.accounts.decryptCreds(account));
    await transport.sendMail({
      from: this.accounts.fromHeader(account),
      to: account.address,
      subject: `[TEST] ${renderTemplate(step.subjectTpl, vars)}`,
      text: renderTemplate(step.bodyTpl, vars),
    });
    return { sent: true, to: account.address, sampleLeadId: sample?.id ?? null };
  }

  /** FR-9.4 — per-step sent counts + reply attribution and rates. */
  async stats(campaignId: string) {
    const campaign = await this.prisma.client.campaign.findUnique({
      where: { id: campaignId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!campaign) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campaign not found' });

    const [byStatus, sentByStep, repliedByStep] = await Promise.all([
      this.prisma.client.enrollment.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { _all: true },
      }),
      this.prisma.client.message.groupBy({
        by: ['stepId'],
        where: {
          status: MessageStatus.SENT,
          enrollment: { campaignId },
        },
        _count: { _all: true },
      }),
      // A reply after step N is attributed to step N (currentStep counts sent steps).
      this.prisma.client.enrollment.groupBy({
        by: ['currentStep'],
        where: { campaignId, status: EnrollmentStatus.REPLIED },
        _count: { _all: true },
      }),
    ]);

    const totals = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
    const steps = campaign.steps.map((step) => {
      const sent = sentByStep.find((s) => s.stepId === step.id)?._count._all ?? 0;
      const replies =
        repliedByStep.find((r) => r.currentStep === step.stepOrder)?._count._all ?? 0;
      return {
        stepOrder: step.stepOrder,
        subjectTpl: step.subjectTpl,
        sent,
        replies,
        replyRate: sent > 0 ? Number((replies / sent).toFixed(3)) : 0,
      };
    });

    const totalSent = steps.reduce((sum, s) => sum + s.sent, 0);
    const totalReplies = totals[EnrollmentStatus.REPLIED] ?? 0;
    return {
      campaignId,
      totals: {
        enrollments: byStatus.reduce((sum, s) => sum + s._count._all, 0),
        ...totals,
        sent: totalSent,
        replyRate: totalSent > 0 ? Number((totalReplies / totalSent).toFixed(3)) : 0,
      },
      steps,
    };
  }
}
