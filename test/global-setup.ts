import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Provisions the e2e database. Default: a throwaway postgres:16
 * testcontainer (requires Docker). Machines without Docker can point
 * TEST_DATABASE_URL at any Postgres 16 — the suite migrates and wipes it.
 */
export default async function globalSetup() {
  let url = process.env.TEST_DATABASE_URL;

  if (!url) {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:16').start();
    (globalThis as Record<string, unknown>).__PG_CONTAINER__ = container;
    url = container.getConnectionUri();
  }

  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  // Start from a clean slate — Tenant/User cascades wipe everything else.
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();

  // globalSetup runs in its own process; hand the URL to the workers.
  writeFileSync(join(__dirname, '.db-url'), url);
}
