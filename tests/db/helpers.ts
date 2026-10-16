import { Pool } from 'pg';
import { loadDotEnv } from '../../server/config';
import { runMigrations } from '../../server/db/migrate';

export interface DbGate {
  ok: boolean;
  url?: string;
  reason?: string;
}

export function gateDb(env: Record<string, string | undefined> = process.env): DbGate {
  if (env === process.env) loadDotEnv();
  const url = env['DATABASE_URL_TEST'];
  if (!url) return { ok: false, reason: 'DATABASE_URL_TEST is not set (copy .env.example to .env)' };
  let dbName: string;
  try {
    const u = new URL(url);
    if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') {
      return { ok: false, reason: `DATABASE_URL_TEST protocol ${u.protocol} is not postgres` };
    }
    dbName = u.pathname.replace(/^\//, '');
  } catch {
    return { ok: false, reason: 'DATABASE_URL_TEST is not a valid postgres URL' };
  }
  if (!/test/i.test(dbName)) {
    return { ok: false, reason: `Refusing to run: database "${dbName}" does not contain "test". Destructive DB tests never run against a production-looking database.` };
  }
  return { ok: true, url };
}

export async function createCleanPool(url: string): Promise<Pool> {
  const pool = new Pool({ connectionString: url, max: 6, connectionTimeoutMillis: 10_000 });
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await runMigrations(pool);
  return pool;
}
