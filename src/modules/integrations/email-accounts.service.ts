import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmailAccount, EmailProvider, Prisma } from '@prisma/client';
import { SecretsService } from '../../common/crypto/secrets.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { ConnectSmtpDto, UpdateEmailAccountDto } from './dto/email-accounts.dto';
import { SMTP_TRANSPORT_FACTORY, SmtpCredentials, SmtpTransportFactory } from './smtp';

export interface EmailAccountView {
  id: string;
  address: string;
  provider: EmailProvider;
  status: string;
  dailyCap: number;
  fromName: string | null;
  signature: string | null;
  createdAt: Date;
}

@Injectable()
export class EmailAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    @Inject(SMTP_TRANSPORT_FACTORY) private readonly transportFactory: SmtpTransportFactory,
  ) {}

  /** FR-2.2 — connect a raw-SMTP sending account; the connection is tested before saving. */
  async connectSmtp(dto: ConnectSmtpDto): Promise<EmailAccountView> {
    const creds: SmtpCredentials = {
      host: dto.host,
      port: dto.port,
      user: dto.user,
      pass: dto.pass,
      secure: dto.secure,
    };
    try {
      await this.transportFactory(creds).verify();
    } catch (err) {
      throw new BadRequestException({
        code: 'SMTP_CONNECT_FAILED',
        message: `Could not connect to ${dto.host}:${dto.port} — ${(err as Error).message}`,
      });
    }

    const enc = this.secrets.encrypt(JSON.stringify(creds));
    const account = await this.prisma.client.emailAccount.create({
      data: {
        address: dto.address,
        provider: EmailProvider.SMTP,
        credentialsEnc: enc.ciphertext,
        keyVersion: enc.keyVersion,
        dailyCap: dto.dailyCap ?? 30,
        fromName: dto.fromName,
        signature: dto.signature,
      } satisfies TenantCreateData<Prisma.EmailAccountUncheckedCreateInput> as Prisma.EmailAccountUncheckedCreateInput,
    });
    return this.view(account);
  }

  async list(): Promise<EmailAccountView[]> {
    const accounts = await this.prisma.client.emailAccount.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map((a) => this.view(a));
  }

  async update(id: string, dto: UpdateEmailAccountDto): Promise<EmailAccountView> {
    await this.mustExist(id);
    const account = await this.prisma.client.emailAccount.update({
      where: { id },
      data: { ...dto },
    });
    return this.view(account);
  }

  /** docs/04 — sends a test mail to the account's own address. */
  async sendTest(id: string): Promise<{ sent: true }> {
    const account = await this.mustExist(id);
    const transport = this.transportFactory(this.decryptCreds(account));
    await transport.sendMail({
      from: this.fromHeader(account),
      to: account.address,
      subject: 'SignX Reach test email',
      text: `This is a test email from SignX Reach.\n\nAccount: ${account.address}\n${account.signature ?? ''}`,
    });
    return { sent: true };
  }

  /** For the delivery engine (M3 send.dispatch). */
  decryptCreds(account: EmailAccount): SmtpCredentials {
    return JSON.parse(
      this.secrets.decrypt(account.credentialsEnc, account.keyVersion),
    ) as SmtpCredentials;
  }

  fromHeader(account: EmailAccount): string {
    return account.fromName ? `"${account.fromName}" <${account.address}>` : account.address;
  }

  private async mustExist(id: string): Promise<EmailAccount> {
    const account = await this.prisma.client.emailAccount.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Email account not found' });
    }
    return account;
  }

  /** Credentials never leave the API (rule 3) — the view is cred-free. */
  private view(a: EmailAccount): EmailAccountView {
    return {
      id: a.id,
      address: a.address,
      provider: a.provider,
      status: a.status,
      dailyCap: a.dailyCap,
      fromName: a.fromName,
      signature: a.signature,
      createdAt: a.createdAt,
    };
  }
}
