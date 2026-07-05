import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Platform mail (invites, system notices) — NOT tenant sending accounts;
 * those are the delivery module's job (M3). Local dev points at mailhog.
 * Tests use the JSON transport so no SMTP server is needed.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;

  constructor() {
    this.transporter =
      process.env.NODE_ENV === 'test'
        ? nodemailer.createTransport({ jsonTransport: true })
        : nodemailer.createTransport({
            host: process.env.SMTP_HOST ?? 'localhost',
            port: Number(process.env.SMTP_PORT ?? 1025),
            secure: false,
          });
  }

  async sendInvite(to: string, tenantName: string, role: string, link: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? 'SignX Reach <no-reply@signxreach.local>',
        to,
        subject: `You've been invited to ${tenantName} on SignX Reach`,
        text:
          `You've been invited to join the workspace "${tenantName}" as ${role}.\n\n` +
          `Accept the invitation: ${link}\n\n` +
          `The link expires in 7 days. If you weren't expecting this, ignore this email.`,
      });
    } catch (err) {
      // The invitation row exists and can be re-sent; don't fail the request.
      this.logger.error(`Failed to send invite mail to ${to}: ${(err as Error).message}`);
    }
  }
}
