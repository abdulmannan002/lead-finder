import { readFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = readFileSync(join(__dirname, '.db-url'), 'utf8').trim();
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.JWT_REFRESH_TTL ??= '30d';
process.env.WEB_APP_URL ??= 'http://localhost:3000';
process.env.MASTER_ENCRYPTION_KEY ??= Buffer.from(
  'e2e-master-key-32-bytes-exactly!',
).toString('base64');
process.env.PLATFORM_ANTHROPIC_KEY ??= 'sk-ant-platform-e2e';
