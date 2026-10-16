import { ConfigError, loadConfig } from '../config';
import { createPool } from './pool';
import { runMigrations } from './migrate';

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    const pool = createPool(config);
    try {
      const applied = await runMigrations(pool);
      console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Database already up to date.');
    } finally {
      await pool.end();
    }
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`Configuration error: ${e.message}`);
      process.exit(1);
    }
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

void main();
