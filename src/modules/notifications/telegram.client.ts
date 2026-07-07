import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

/** Injection token so tests can stub Telegram's HTTP API. */
export const NOTIFICATIONS_FETCH = 'NOTIFICATIONS_FETCH';

/** FR-2.4 / FR-8.4 — tenant-configured bot pushes alerts to their chat. */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger(TelegramClient.name);
  private readonly fetchImpl: typeof fetch;

  constructor(@Optional() @Inject(NOTIFICATIONS_FETCH) fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** Best-effort: alert failures must never break the pipeline that raised them. */
  async sendMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
    try {
      const res = await this.fetchImpl(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      const body = (await res.json()) as { ok?: boolean };
      if (!res.ok || !body.ok) {
        this.logger.warn(`telegram sendMessage failed (${res.status})`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`telegram unreachable: ${(err as Error).message}`);
      return false;
    }
  }
}
