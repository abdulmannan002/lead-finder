import { rmSync } from 'node:fs';
import { join } from 'node:path';

export default async function globalTeardown() {
  const container = (globalThis as Record<string, unknown>).__PG_CONTAINER__ as
    | { stop: () => Promise<void> }
    | undefined;
  if (container) await container.stop();
  rmSync(join(__dirname, '.db-url'), { force: true });
}
