import * as nodemailer from 'nodemailer';

/**
 * Injection token for building SMTP transports from decrypted tenant
 * credentials. Tests override it with a capturing fake; production uses
 * nodemailer against the tenant's real server (mailhog locally).
 */
export const SMTP_TRANSPORT_FACTORY = 'SMTP_TRANSPORT_FACTORY';

export interface SmtpCredentials {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure?: boolean;
  /** M4 — reply detection mailbox (defaults: `host`, 993). */
  imapHost?: string;
  imapPort?: number;
}

export interface OutboundMail {
  from: string;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
}

/** The slice of nodemailer the delivery code needs (keeps fakes tiny). */
export interface SmtpTransport {
  /** Connection + auth test (FR-2.5-style validation for SMTP). */
  verify(): Promise<true>;
  sendMail(mail: OutboundMail): Promise<{ messageId: string }>;
}

export type SmtpTransportFactory = (creds: SmtpCredentials) => SmtpTransport;

export const realSmtpTransportFactory: SmtpTransportFactory = (creds) =>
  nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.secure ?? creds.port === 465,
    // mailhog runs without auth; only pass credentials when present
    ...(creds.user ? { auth: { user: creds.user, pass: creds.pass } } : {}),
  }) as unknown as SmtpTransport;
