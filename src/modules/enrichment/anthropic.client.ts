import Anthropic from '@anthropic-ai/sdk';

/**
 * Factory token: builds an Anthropic client for a TENANT-provided key
 * (FR-5.1 — tenants bring their own key). Tests override this token.
 */
export const ANTHROPIC_CLIENT_FACTORY = 'ANTHROPIC_CLIENT_FACTORY';

/** docs/03 §1 — claude-haiku for openers (cost-efficient personalization). */
export const OPENER_MODEL = 'claude-haiku-4-5';

/** The slice of the SDK the personalizer needs (keeps the fake tiny). */
export interface OpenerModelClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: { role: 'user'; content: string }[];
    }): Promise<{
      content: { type: string; text?: string }[];
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export type AnthropicClientFactory = (apiKey: string) => OpenerModelClient;

export const realAnthropicClientFactory: AnthropicClientFactory = (apiKey) =>
  new Anthropic({ apiKey }) as unknown as OpenerModelClient;
