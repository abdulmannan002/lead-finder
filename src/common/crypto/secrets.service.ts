import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * App-layer AES-256-GCM for integration keys and SMTP credentials
 * (docs/02 §5, docs/03 §6, non-negotiable rule 3). Ciphertext layout:
 * base64(iv[12] | authTag[16] | data). The key version is stored beside
 * the ciphertext (keyVersion column) so the master key can be rotated:
 * add MASTER_ENCRYPTION_KEY_V<n>, bump CURRENT_VERSION, re-encrypt lazily.
 */
export class EncryptedSecret {
  constructor(
    readonly ciphertext: string,
    readonly keyVersion: number,
  ) {}
}

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const CURRENT_VERSION = 1;

@Injectable()
export class SecretsService {
  private keyFor(version: number): Buffer {
    const envName = version === 1 ? 'MASTER_ENCRYPTION_KEY' : `MASTER_ENCRYPTION_KEY_V${version}`;
    const raw = process.env[envName];
    if (!raw) throw new Error(`${envName} is not set`);
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(`${envName} must be 32 bytes of base64 (got ${key.length})`);
    }
    return key;
  }

  encrypt(plaintext: string): EncryptedSecret {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.keyFor(CURRENT_VERSION), iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return new EncryptedSecret(Buffer.concat([iv, tag, data]).toString('base64'), CURRENT_VERSION);
  }

  decrypt(ciphertext: string, keyVersion: number): string {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const data = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', this.keyFor(keyVersion), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  /** What the API may show after creation (docs/02 §5: last 4 chars only). */
  last4(plaintext: string): string {
    return plaintext.slice(-4);
  }
}
