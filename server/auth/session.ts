import type { Pool } from 'pg';
import type { Config } from '../config';
import { hashSecret, randomHex } from './crypto';

export const SESSION_COOKIE = 'chog_session';

export interface AuthSession {
  wallet: string;
  expiresAt: Date;
}

function secureFlag(uri: string): string {
  return uri.startsWith('https://') ? '; Secure' : '';
}

export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) continue;
    out[key] = part.slice(eq + 1).trim();
  }
  return out;
}

export function buildSessionCookie(token: string, expiresAt: Date, appOrigin: string, now: Date = new Date()): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag(appOrigin)}`;
}

export function buildClearCookie(appOrigin: string): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(appOrigin)}`;
}

export async function createSession(
  pool: Pool,
  config: Config,
  wallet: string,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomHex(32);
  const expiresAt = new Date(now.getTime() + config.sessionTtlMs);
  await pool.query('INSERT INTO sessions (token_hash, wallet, issued_at, expires_at) VALUES ($1,$2,$3,$4)', [
    hashSecret(token, config.sessionSecret),
    wallet.toLowerCase(),
    now.toISOString(),
    expiresAt.toISOString(),
  ]);
  return { token, expiresAt };
}

export async function resolveSession(
  pool: Pool,
  config: Config,
  token: string,
  now: Date,
): Promise<AuthSession | null> {
  if (!token || token.length > 128) return null;
  const { rows } = await pool.query<{ wallet: string; expires_at: Date }>(
    'SELECT wallet, expires_at FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2',
    [hashSecret(token, config.sessionSecret), now.toISOString()],
  );
  const row = rows[0];
  if (!row) return null;
  return { wallet: row.wallet.toLowerCase(), expiresAt: new Date(row.expires_at) };
}

export async function revokeSession(pool: Pool, config: Config, token: string, now: Date): Promise<boolean> {
  if (!token || token.length > 128) return false;
  const { rowCount } = await pool.query(
    'UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashSecret(token, config.sessionSecret), now.toISOString()],
  );
  return (rowCount ?? 0) > 0;
}
