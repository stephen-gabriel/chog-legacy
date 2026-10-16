import { Pool } from 'pg';
import type { Config } from '../config';

export function createPool(config: Config, databaseUrl = config.databaseUrl): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(config.dbSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

export async function poolHealth(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
