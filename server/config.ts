import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

let dotEnvLoaded = false;

export function loadDotEnv(): void {
  if (dotEnvLoaded) return;
  dotEnvLoaded = true;
  const p = resolve(process.cwd(), '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

export interface Config {
  databaseUrl: string;
  databaseUrlTest: string | null;
  mainnetRpcUrl: string;
  mainnetChainId: number;
  chogContract: string;
  historyStartBlock: number;
  appOrigin: string;
  apiPort: number;
  metadataTtlMs: number;
  metadataRetryCooldownMs: number;
  maxLogRange: number;
  identityNamespace: string;
  sessionSecret: string;
  sessionTtlMs: number;
  nonceTtlMs: number;
  host: string;
  trustProxy: boolean;
  dbSsl: boolean;
  staticDir: string;
  production: boolean;
}

let generatedSessionSecret: string | null = null;

function resolveSessionSecret(raw: string | undefined): { secret: string; generated: boolean } {
  if (raw && raw.length >= 16) return { secret: raw, generated: false };
  if (!generatedSessionSecret) {
    generatedSessionSecret = randomBytes(32).toString('hex');
  }
  return { secret: generatedSessionSecret, generated: true };
}

export class ConfigError extends Error {}

export function loadConfig(overrides?: Record<string, string | undefined>): Config {
  loadDotEnv();
  const env = (k: string): string | undefined => overrides?.[k] ?? process.env[k];
  const databaseUrl = env('DATABASE_URL');
  if (!databaseUrl) throw new ConfigError('DATABASE_URL is required');
  const mainnetRpcUrl = env('MAINNET_RPC_URL') ?? 'https://rpc.monad.xyz';
  const mainnetChainId = Number(env('MAINNET_CHAIN_ID') ?? 143);
  const chogContract = (env('CHOG_CONTRACT_ADDRESS') ?? '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763').toLowerCase();
  const historyStartBlock = Number(env('HISTORY_START_BLOCK') ?? 101997010);
  const apiPort = Number(env('API_PORT') ?? env('PORT') ?? 8420);
  const metadataTtlMs = Number(env('METADATA_TTL_MS') ?? 3600_000);
  const metadataRetryCooldownMs = Number(env('METADATA_RETRY_COOLDOWN_MS') ?? 15_000);
  const sessionTtlMs = Number(env('SESSION_TTL_MS') ?? 86_400_000);
  const nonceTtlMs = Number(env('NONCE_TTL_MS') ?? 300_000);
  const identityNamespace = (env('IDENTITY_NAMESPACE') ?? 'chog-mainnet').toLowerCase();
  if (!Number.isFinite(mainnetChainId) || !Number.isFinite(historyStartBlock) || !Number.isFinite(apiPort)) {
    throw new ConfigError('MAINNET_CHAIN_ID, HISTORY_START_BLOCK and API_PORT must be numbers');
  }
  if (!Number.isFinite(metadataTtlMs) || !Number.isFinite(sessionTtlMs) || !Number.isFinite(nonceTtlMs)) {
    throw new ConfigError('METADATA_TTL_MS, SESSION_TTL_MS and NONCE_TTL_MS must be numbers');
  }
  if (!Number.isFinite(metadataRetryCooldownMs) || metadataRetryCooldownMs < 0) {
    throw new ConfigError('METADATA_RETRY_COOLDOWN_MS must be a non-negative number');
  }
  if (sessionTtlMs <= 0 || nonceTtlMs <= 0) throw new ConfigError('SESSION_TTL_MS and NONCE_TTL_MS must be positive');
  if (!/^[a-z0-9-]{1,64}$/.test(identityNamespace)) {
    throw new ConfigError('IDENTITY_NAMESPACE must be lowercase letters, digits or dashes');
  }
  const session = resolveSessionSecret(env('SESSION_SECRET'));
  if (session.generated && process.env.NODE_ENV === 'production') {
    throw new ConfigError('SESSION_SECRET is required in production');
  }
  if (session.generated) {
    console.warn('[chog-api] SESSION_SECRET is not set; using a random per-process secret (sessions reset on restart)');
  }
  const truthy = (v: string | undefined): boolean => v === '1' || (v ?? '').toLowerCase() === 'true';
  return {
    databaseUrl,
    databaseUrlTest: env('DATABASE_URL_TEST') ?? null,
    mainnetRpcUrl,
    mainnetChainId,
    chogContract,
    historyStartBlock,
    appOrigin: env('APP_ORIGIN') ?? `http://localhost:5173`,
    apiPort,
    metadataTtlMs,
    metadataRetryCooldownMs,
    maxLogRange: 100,
    identityNamespace,
    sessionSecret: session.secret,
    sessionTtlMs,
    nonceTtlMs,
    host: env('HOST') ?? '127.0.0.1',
    trustProxy: truthy(env('TRUST_PROXY')),
    dbSsl: truthy(env('DB_SSL')),
    staticDir: env('STATIC_DIR') ?? 'dist',
    production: (env('NODE_ENV') ?? '').toLowerCase() === 'production',
  };
}
