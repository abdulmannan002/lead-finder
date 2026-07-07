import { ImapFlow } from 'imapflow';
import { ParsedMail, simpleParser } from 'mailparser';
import { SmtpCredentials } from '../integrations/smtp';
import { InboundMessage } from './inbound-classify';

/** Injection token so tests can stub the mailbox. */
export const INBOX_FETCHER = 'INBOX_FETCHER';

export interface InboxFetchResult {
  messages: InboundMessage[];
  /** Opaque per-account checkpoint (docs/03 §4) to persist. */
  checkpoint: string | null;
}

export interface InboxFetcher {
  /** Fetches messages newer than the checkpoint. Auth errors must throw. */
  fetchNew(creds: SmtpCredentials, checkpoint: string | null): Promise<InboxFetchResult>;
}

const HEADERS_OF_INTEREST = ['auto-submitted', 'x-autoreply', 'x-autorespond', 'precedence', 'content-type'];

/** IMAP implementation (FR-8.1) — checkpoint format "uidValidity:lastUid". */
export class ImapInboxFetcher implements InboxFetcher {
  async fetchNew(creds: SmtpCredentials, checkpoint: string | null): Promise<InboxFetchResult> {
    const client = new ImapFlow({
      host: creds.imapHost ?? creds.host,
      port: creds.imapPort ?? 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false,
    });

    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const mailbox = client.mailbox;
        if (!mailbox || typeof mailbox === 'boolean') return { messages: [], checkpoint };
        const uidValidity = String(mailbox.uidValidity ?? '0');
        const [checkpointValidity, lastUidRaw] = checkpoint?.split(':') ?? [];
        // Mailbox reset (uidValidity changed) → start over from now.
        const sinceUid = checkpointValidity === uidValidity ? Number(lastUidRaw ?? 0) : 0;

        const messages: InboundMessage[] = [];
        let maxUid = sinceUid;
        for await (const item of client.fetch(
          { uid: `${sinceUid + 1}:*` },
          { uid: true, source: true },
        )) {
          if (item.uid <= sinceUid) continue; // IMAP ranges are inclusive of the last message
          maxUid = Math.max(maxUid, item.uid);
          if (!item.source) continue;
          const parsed: ParsedMail = await simpleParser(item.source);
          const headers: Record<string, string> = {};
          for (const name of HEADERS_OF_INTEREST) {
            const value = parsed.headers.get(name);
            if (value !== undefined) headers[name] = String(value);
          }
          messages.push({
            from: (parsed.from?.value?.[0]?.address ?? '').toLowerCase(),
            subject: parsed.subject ?? '',
            messageId: parsed.messageId ?? null,
            inReplyTo: parsed.inReplyTo ?? null,
            references: Array.isArray(parsed.references)
              ? parsed.references
              : parsed.references
                ? [parsed.references]
                : [],
            headers,
            contentType: headers['content-type'] ?? null,
            text: parsed.text ?? '',
          });
        }
        return { messages, checkpoint: `${uidValidity}:${maxUid}` };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
  }
}
