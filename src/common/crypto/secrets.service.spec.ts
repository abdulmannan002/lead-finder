import { randomBytes } from 'node:crypto';
import { SecretsService } from './secrets.service';

describe('SecretsService', () => {
  const service = new SecretsService();

  beforeAll(() => {
    process.env.MASTER_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  it('roundtrips plaintext', () => {
    const secret = service.encrypt('apify_api_abc123XYZ');
    expect(secret.keyVersion).toBe(1);
    expect(service.decrypt(secret.ciphertext, secret.keyVersion)).toBe('apify_api_abc123XYZ');
  });

  it('produces a different ciphertext every call (random IV)', () => {
    const a = service.encrypt('same-input');
    const b = service.encrypt('same-input');
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('never leaks the plaintext in the ciphertext', () => {
    const secret = service.encrypt('super-secret-key');
    expect(secret.ciphertext).not.toContain('super-secret-key');
  });

  it('rejects tampered ciphertext (GCM auth)', () => {
    const secret = service.encrypt('payload');
    const buf = Buffer.from(secret.ciphertext, 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => service.decrypt(buf.toString('base64'), secret.keyVersion)).toThrow();
  });

  it('rejects decryption with the wrong key', () => {
    const secret = service.encrypt('payload');
    process.env.MASTER_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expect(() => service.decrypt(secret.ciphertext, secret.keyVersion)).toThrow();
  });

  it('rejects a malformed master key', () => {
    process.env.MASTER_ENCRYPTION_KEY = 'too-short';
    expect(() => service.encrypt('x')).toThrow(/32 bytes/);
  });

  it('exposes only the last 4 characters', () => {
    expect(service.last4('apify_api_abc123XYZ')).toBe('3XYZ');
  });
});
