import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AccountStatus,
  EnrollmentStatus,
  LeadStatus,
  MessageDirection,
  MessageStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
// SystemPrismaService use is BY DESIGN: the batch scan sweeps accounts
// across every tenant (docs/02 §5); per-account work is tenant-scoped.
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { JobQueue, TenantJobData } from '../../common/queues/job-queue';
import { INBOX_POLL_QUEUE } from '../../common/queues/queues.module';
import { EmailAccountsService } from '../integrations/email-accounts.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  classifyInbound,
  hasOptOutIntent,
  InboundMessage,
  threadIds,
} from './inbound-classify';
import { INBOX_FETCHER, InboxFetcher } from './inbox-fetcher';

export interface InboxPollJobData extends TenantJobData {
  accountId?: string;
  batch?: boolean;
}

const REPLY_TEXT_LIMIT = 5_000;

/**
 * inbox.poll (docs/03 §4, FR-8.1–8.4): per-account mailbox sweep with a
 * persisted checkpoint. Genuine replies stop the sequence and alert the
 * tenant (T-6); auto-replies are ignored (T-7); DSN bounces mark the
 * enrollment + lead BOUNCED (T-8); auth failures set the account to
 * ERROR and notify (T-11) — send.plan already skips ERROR accounts.
 */
@Injectable()
export class InboxPollProcessor {
  private readonly logger = new Logger(InboxPollProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly accounts: EmailAccountsService,
    private readonly notifications: NotificationsService,
    @Inject(INBOX_FETCHER) private readonly fetcher: InboxFetcher,
    @Inject(INBOX_POLL_QUEUE) private readonly pollQueue: JobQueue<InboxPollJobData>,
  ) {}

  async process(data: InboxPollJobData): Promise<void> {
    if (data.batch) return this.batchScan();
    if (!data.accountId) return;
    return this.pollAccount(data.accountId);
  }

  /** Enqueues one poll job per watchable account, platform-wide. */
  private async batchScan(): Promise<void> {
    const accounts = await this.system.emailAccount.findMany({
      where: {
        status: { in: [AccountStatus.ACTIVE, AccountStatus.WARMUP] },
        tenant: { status: 'ACTIVE' },
      },
      select: { id: true, tenantId: true },
    });
    for (const account of accounts) {
      await this.pollQueue.add(
        'poll',
        { tenantId: account.tenantId, accountId: account.id },
        { jobId: `inbox:${account.id}` },
      );
    }
  }

  private async pollAccount(accountId: string): Promise<void> {
    const account = await this.prisma.client.emailAccount.findUnique({ where: { id: accountId } });
    if (!account) return;
    if (account.status !== AccountStatus.ACTIVE && account.status !== AccountStatus.WARMUP) return;

    let result;
    try {
      result = await this.fetcher.fetchNew(
        this.accounts.decryptCreds(account),
        account.inboxCheckpoint,
      );
    } catch (err) {
      // T-11 — revoked/invalid credentials: account ERROR + tenant notified;
      // send.plan excludes non-ACTIVE/WARMUP accounts, so sends pause.
      await this.prisma.client.emailAccount.update({
        where: { id: accountId },
        data: { status: AccountStatus.ERROR },
      });
      await this.notifications.notify(
        'account_error',
        `Mailbox access failed for ${account.address} — sending from this account is paused. (${(err as Error).message})`,
        { accountId },
      );
      return;
    }

    for (const mail of result.messages) {
      await this.handleInbound(mail);
    }

    if (result.checkpoint !== account.inboxCheckpoint) {
      await this.prisma.client.emailAccount.update({
        where: { id: accountId },
        data: { inboxCheckpoint: result.checkpoint },
      });
    }
  }

  private async handleInbound(mail: InboundMessage): Promise<void> {
    const kind = classifyInbound(mail);
    if (kind === 'auto') return; // T-7 — OOO/auto-replies are ignored

    const enrollment = await this.matchEnrollment(mail);
    if (!enrollment) return; // unrelated mail in the tenant's inbox

    if (kind === 'bounce') {
      // T-8 / FR-7.4 — hard bounce discovered via DSN.
      await this.prisma.client.$transaction([
        this.prisma.client.message.create({
          data: this.inboundRow(enrollment.id, mail, MessageStatus.BOUNCED),
        }),
        this.prisma.client.enrollment.update({
          where: { id: enrollment.id },
          data: { status: EnrollmentStatus.BOUNCED, nextDueAt: null, claimedAt: null },
        }),
        this.prisma.client.lead.update({
          where: { id: enrollment.leadId },
          data: { status: LeadStatus.BOUNCED },
        }),
      ]);
      return;
    }

    // Genuine reply (T-6): stop the sequence, store the reply, alert.
    const optOut = hasOptOutIntent(mail.text);
    const stillRunning =
      enrollment.status === EnrollmentStatus.QUEUED ||
      enrollment.status === EnrollmentStatus.ACTIVE;

    const writes: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.client.message.create({
        data: this.inboundRow(enrollment.id, mail, MessageStatus.RECEIVED),
      }),
    ];
    if (stillRunning || optOut) {
      writes.push(
        this.prisma.client.enrollment.update({
          where: { id: enrollment.id },
          data: {
            status: optOut ? EnrollmentStatus.STOPPED : EnrollmentStatus.REPLIED,
            replyText: mail.text.slice(0, REPLY_TEXT_LIMIT),
            nextDueAt: null,
            claimedAt: null,
          },
        }),
      );
    }
    if (optOut) {
      // FR-7.6 / rule 5 — permanent, tenant-wide suppression.
      writes.push(
        this.prisma.client.lead.update({
          where: { id: enrollment.leadId },
          data: { status: LeadStatus.DO_NOT_CONTACT },
        }),
      );
    }
    await this.prisma.client.$transaction(writes);

    if (optOut) {
      this.logger.log(`opt-out from ${mail.from} — lead suppressed`);
      return; // no "new reply" celebration for an unsubscribe
    }
    if (stillRunning) {
      // FR-8.4 — within a minute of detection (we alert immediately).
      const lead = await this.prisma.client.lead.findUnique({
        where: { id: enrollment.leadId },
      });
      const preview = mail.text.trim().slice(0, 200);
      await this.notifications.notify(
        'reply',
        `New reply from ${lead?.company ?? mail.from} <${mail.from}>:\n${preview}`,
        { enrollmentId: enrollment.id, leadId: enrollment.leadId },
      );
    }
  }

  /** FR-8.2 — thread headers first, sender-vs-active-enrollments fallback. */
  private async matchEnrollment(mail: InboundMessage) {
    const ids = threadIds(mail);
    if (ids.length > 0) {
      const original = await this.prisma.client.message.findFirst({
        where: { providerMsgId: { in: ids }, direction: MessageDirection.OUTBOUND },
        include: { enrollment: true },
      });
      if (original) return original.enrollment;
    }
    if (mail.from) {
      const enrollment = await this.prisma.client.enrollment.findFirst({
        where: {
          status: { in: [EnrollmentStatus.QUEUED, EnrollmentStatus.ACTIVE] },
          lead: { email: mail.from },
        },
      });
      if (enrollment) return enrollment;
    }
    return null;
  }

  private inboundRow(enrollmentId: string, mail: InboundMessage, status: MessageStatus) {
    return {
      enrollmentId,
      direction: MessageDirection.INBOUND,
      status,
      providerMsgId: mail.messageId,
      subject: mail.subject,
      body: mail.text.slice(0, REPLY_TEXT_LIMIT),
      sentAt: new Date(),
    } satisfies TenantCreateData<Prisma.MessageUncheckedCreateInput> as Prisma.MessageUncheckedCreateInput;
  }
}
