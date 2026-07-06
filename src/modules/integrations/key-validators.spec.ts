import { BadRequestException } from '@nestjs/common';
import { IntegrationKind } from '@prisma/client';
import { KeyValidators } from './key-validators';

function fakeFetch(handler: (url: string) => { ok: boolean; status?: number; body?: unknown }) {
  return (async (url: any) => {
    const res = handler(String(url));
    return {
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 401),
      json: async () => res.body ?? {},
    } as Response;
  }) as typeof fetch;
}

describe('KeyValidators', () => {
  it('accepts a valid Apify key', async () => {
    const v = new KeyValidators(fakeFetch((url) => ({ ok: url.includes('token=good') })));
    await expect(v.validate(IntegrationKind.APIFY, 'good')).resolves.toBeUndefined();
  });

  it('rejects a bad Apify key with INVALID_KEY', async () => {
    const v = new KeyValidators(fakeFetch(() => ({ ok: false, status: 401 })));
    await expect(v.validate(IntegrationKind.APIFY, 'bad')).rejects.toThrow(BadRequestException);
  });

  it('rejects when the provider is unreachable', async () => {
    const v = new KeyValidators((async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch);
    await expect(v.validate(IntegrationKind.HUNTER, 'any')).rejects.toThrow(/test call failed/);
  });

  it('validates Anthropic with the proper headers', async () => {
    let seenHeaders: Record<string, string> | undefined;
    const v = new KeyValidators((async (_url: any, init: any) => {
      seenHeaders = init?.headers;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as typeof fetch);
    await v.validate(IntegrationKind.ANTHROPIC, 'sk-ant-test');
    expect(seenHeaders?.['x-api-key']).toBe('sk-ant-test');
    expect(seenHeaders?.['anthropic-version']).toBeDefined();
  });

  it('requires chatId for Telegram', async () => {
    const v = new KeyValidators(fakeFetch(() => ({ ok: true, body: { ok: true } })));
    await expect(v.validate(IntegrationKind.TELEGRAM, 'bot-token')).rejects.toThrow(/chatId/);
    await expect(
      v.validate(IntegrationKind.TELEGRAM, 'bot-token', { chatId: '123' }),
    ).resolves.toBeUndefined();
  });

  it('rejects a Telegram token when getMe says not ok', async () => {
    const v = new KeyValidators(fakeFetch(() => ({ ok: true, body: { ok: false } })));
    await expect(
      v.validate(IntegrationKind.TELEGRAM, 'bad-token', { chatId: '123' }),
    ).rejects.toThrow(/getMe/);
  });
});
