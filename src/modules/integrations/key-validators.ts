import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { IntegrationKind } from '@prisma/client';

/** Injection token so tests can stub outbound HTTP. */
export const INTEGRATIONS_FETCH = 'INTEGRATIONS_FETCH';

const TIMEOUT_MS = 10_000;

function invalidKey(kind: IntegrationKind, detail: string): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_KEY',
    message: `${kind} key rejected: ${detail}`,
  });
}

/**
 * FR-2.5 — every key is validated with a real test call before storage.
 * Cheap read-only endpoints only; no state is created at the provider.
 */
@Injectable()
export class KeyValidators {
  private readonly fetchImpl: typeof fetch;

  constructor(@Optional() @Inject(INTEGRATIONS_FETCH) fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async validate(
    kind: IntegrationKind,
    key: string,
    config?: Record<string, unknown>,
  ): Promise<void> {
    try {
      switch (kind) {
        case IntegrationKind.APIFY: {
          const res = await this.get(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(key)}`);
          if (!res.ok) throw invalidKey(kind, `Apify answered ${res.status}`);
          return;
        }
        case IntegrationKind.HUNTER: {
          const res = await this.get(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(key)}`);
          if (!res.ok) throw invalidKey(kind, `Hunter answered ${res.status}`);
          return;
        }
        case IntegrationKind.ANTHROPIC: {
          const res = await this.get('https://api.anthropic.com/v1/models', {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          });
          if (!res.ok) throw invalidKey(kind, `Anthropic answered ${res.status}`);
          return;
        }
        case IntegrationKind.TELEGRAM: {
          if (!config || typeof config.chatId !== 'string' || config.chatId.length === 0) {
            throw new BadRequestException({
              code: 'CHAT_ID_REQUIRED',
              message: 'Telegram integration needs a chatId in config',
            });
          }
          const res = await this.get(`https://api.telegram.org/bot${key}/getMe`);
          const body = res.ok ? ((await res.json()) as { ok?: boolean }) : { ok: false };
          if (!body.ok) throw invalidKey(kind, 'getMe failed — check the bot token');
          return;
        }
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw invalidKey(kind, `test call failed (${(err as Error).message})`);
    }
  }

  private get(url: string, headers?: Record<string, string>) {
    return this.fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  }
}
