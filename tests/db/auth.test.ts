import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { secp256k1 } from '@noble/curves/secp256k1';
import type { Config } from '../../server/config';
import { issueNonce, verifySignIn } from '../../server/auth/siwe';
import { createSession, resolveSession, revokeSession } from '../../server/auth/session';
import { personalMessageHash } from '../../server/auth/crypto';
import { AppError } from '../../src/server/errors';
import { createCleanPool, gateDb } from './helpers';

const gate = gateDb();

const WALLET = '0x601634f3d0746b550e68439286c1ad022a5f2b88';
const OTHER = '0x1111111111111111111111111111111111111111';
const PRIV = new Uint8Array(32).fill(7);
const SIGN_ADDRESS = '0x4a62316623ad457f02cdc5d997ded67a383ec569';
const T0 = new Date('2026-10-15T10:00:00.000Z');

function signMessage(message: string, priv: Uint8Array): string {
  const digest = personalMessageHash(message);
  const sig = secp256k1.sign(digest, priv);
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  return `0x${r}${s}${(27 + (sig.recovery ?? 0)).toString(16)}`;
}

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    databaseUrl: 'postgres://unused',
    databaseUrlTest: null,
    mainnetRpcUrl: 'http://unused',
    mainnetChainId: 143,
    chogContract: '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763',
    historyStartBlock: 101_997_010,
    appOrigin: 'http://localhost:5173',
    apiPort: 8787,
    metadataTtlMs: 60_000,
    maxLogRange: 100,
    identityNamespace: 'chog-mainnet',
    sessionSecret: 'test-session-secret-at-least-16-chars',
    sessionTtlMs: 86_400_000,
    nonceTtlMs: 300_000,
    host: '127.0.0.1',
    trustProxy: false,
    dbSsl: false,
    staticDir: 'dist',
    ...overrides,
  };
}

async function expectAppError(p: Promise<unknown>, code: string, includes?: string): Promise<void> {
  try {
    await p;
    throw new Error(`expected AppError ${code} but the call resolved`);
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(code);
    if (includes) expect((e as Error).message).toContain(includes);
  }
}

describe.runIf(gate.ok)('postgres auth: SIWE nonces and sessions (real database)', () => {
  let pool: Pool;
  let config: Config;

  beforeAll(async () => {
    pool = await createCleanPool(gate.url!);
    config = testConfig();
  }, 30_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('issues a nonce bound to domain, uri, chain and wallet', async () => {
    const issued = await issueNonce(pool, config, { wallet: WALLET, now: T0 });
    expect(issued.message).toContain('localhost:5173 wants you to sign in with your Ethereum account:');
    expect(issued.message).toContain(WALLET);
    expect(issued.message).toContain('Chain ID: 143');
    expect(issued.message).toContain(`Nonce: ${issued.nonce}`);
    expect(issued.message).toContain(`URI: ${issued.uri}`);
    expect(issued.message).toContain('This free message proves wallet ownership for authentication only');
    expect(issued.domain).toBe('localhost:5173');
    expect(issued.chainId).toBe(143);
    expect(issued.nonce).toMatch(/^[0-9a-f]{32}$/);
    const { rows } = await pool.query('SELECT wallet, consumed_at FROM auth_nonces WHERE nonce_hash IS NOT NULL');
    expect(rows.length).toBe(1);
    expect(rows[0].consumed_at).toBeNull();
  });

  it('rejects invalid wallet and disallowed uri at issue time', async () => {
    await expectAppError(issueNonce(pool, config, { wallet: 'nope', now: T0 }), 'INVALID_INPUT');
    await expectAppError(
      issueNonce(pool, config, { wallet: WALLET, uri: 'https://evil.example', now: T0 }),
      'INVALID_INPUT',
      'origin',
    );
  });

  it('verifies a correctly signed message and consumes the nonce', async () => {
    const issued = await issueNonce(pool, config, { wallet: SIGN_ADDRESS, now: T0 });
    const wallet = await verifySignIn(pool, config, { message: issued.message, signature: signMessage(issued.message, PRIV) }, T0);
    expect(wallet).toBe(SIGN_ADDRESS);
    await expectAppError(
      verifySignIn(pool, config, { message: issued.message, signature: signMessage(issued.message, PRIV) }, T0),
      'SIGN_IN_REQUIRED',
      'unknown, expired or already used',
    );
  });

  it('rejects tampered messages, mismatched wallets, wrong chains and bad signatures', async () => {
    const issued = await issueNonce(pool, config, { wallet: SIGN_ADDRESS, now: T0 });
    const goodSig = signMessage(issued.message, PRIV);

    await expectAppError(
      verifySignIn(pool, config, { message: 'garbage', signature: goodSig }, T0),
      'INVALID_INPUT',
      'EIP-4361',
    );
    await expectAppError(
      verifySignIn(pool, config, { message: issued.message.replace('Chain ID: 143', 'Chain ID: 1'), signature: goodSig }, T0),
      'SIGN_IN_REQUIRED',
      'wrong chain',
    );
    await expectAppError(
      verifySignIn(pool, config, { message: issued.message.replace(`Nonce: ${issued.nonce}`, 'Nonce: ZzZzZzZz9999'), signature: goodSig }, T0),
      'SIGN_IN_REQUIRED',
      'unknown, expired or already used',
    );

    const forOther = await issueNonce(pool, config, { wallet: OTHER, now: T0 });
    await expectAppError(
      verifySignIn(pool, config, { message: issued.message.replace(SIGN_ADDRESS, OTHER), signature: goodSig }, T0),
      'SIGN_IN_REQUIRED',
      'wallet does not match the issued nonce',
    );
    await expectAppError(
      verifySignIn(pool, config, { message: forOther.message, signature: signMessage(issued.message, PRIV) }, T0),
      'SIGN_IN_REQUIRED',
      'does not match the signing wallet',
    );

    const wrongKey = new Uint8Array(32).fill(9);
    await expectAppError(
      verifySignIn(pool, config, { message: issued.message, signature: signMessage(issued.message, wrongKey) }, T0),
      'SIGN_IN_REQUIRED',
      'does not match the signing wallet',
    );
    await expectAppError(
      verifySignIn(pool, config, { message: issued.message, signature: '0x00' }, T0),
      'SIGN_IN_REQUIRED',
      'malformed signature',
    );
  });

  it('rejects an expired message and a nonce expired only at the database layer', async () => {
    const issued = await issueNonce(pool, config, { wallet: SIGN_ADDRESS, now: T0 });
    const late = new Date(T0.getTime() + config.nonceTtlMs + 1000);
    await expectAppError(
      verifySignIn(pool, config, { message: issued.message, signature: signMessage(issued.message, PRIV) }, late),
      'SIGN_IN_REQUIRED',
      'expired',
    );

    const issued2 = await issueNonce(pool, config, { wallet: SIGN_ADDRESS, now: T0 });
    const dbExpiry = new Date(T0.getTime() + 10_000);
    await pool.query('UPDATE auth_nonces SET expires_at = $2 WHERE nonce_hash IS NOT NULL AND consumed_at IS NULL AND wallet = $1', [
      SIGN_ADDRESS,
      dbExpiry.toISOString(),
    ]);
    const mid = new Date(T0.getTime() + 20_000);
    await expectAppError(
      verifySignIn(pool, config, { message: issued2.message, signature: signMessage(issued2.message, PRIV) }, mid),
      'SIGN_IN_REQUIRED',
      'unknown, expired or already used',
    );
  });

  it('allows exactly one winner under concurrent verification of one nonce', async () => {
    const issued = await issueNonce(pool, config, { wallet: SIGN_ADDRESS, now: T0 });
    const signature = signMessage(issued.message, PRIV);
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () => verifySignIn(pool, config, { message: issued.message, signature }, T0)),
    );
    const ok = attempts.filter(a => a.status === 'fulfilled');
    const rejected = attempts.filter(a => a.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(3);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(AppError);
      expect((r as PromiseRejectedResult).reason.code).toBe('SIGN_IN_REQUIRED');
    }
  });

  it('creates, resolves and revokes sessions; expiry and tampered tokens fail', async () => {
    const { token, expiresAt } = await createSession(pool, config, WALLET, T0);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const resolved = await resolveSession(pool, config, token, T0);
    expect(resolved).not.toBeNull();
    expect(resolved!.wallet).toBe(WALLET);
    expect(resolved!.expiresAt.getTime()).toBe(expiresAt.getTime());

    expect(await resolveSession(pool, config, `${token.slice(0, -1)}0`, T0)).toBeNull();
    expect(await resolveSession(pool, config, '', T0)).toBeNull();
    expect(await resolveSession(pool, config, 'x'.repeat(200), T0)).toBeNull();

    const past = new Date(T0.getTime() + config.sessionTtlMs + 1000);
    expect(await resolveSession(pool, config, token, past)).toBeNull();

    const { token: token2 } = await createSession(pool, config, WALLET, T0);
    expect(await revokeSession(pool, config, token2, T0)).toBe(true);
    expect(await resolveSession(pool, config, token2, T0)).toBeNull();
    expect(await revokeSession(pool, config, token2, T0)).toBe(false);

    const { token: token3 } = await createSession(pool, config, WALLET, T0);
    await pool.query('UPDATE sessions SET expires_at = $1 WHERE token_hash IS NOT NULL AND revoked_at IS NULL', [
      new Date(T0.getTime() - 1000).toISOString(),
    ]);
    expect(await resolveSession(pool, config, token3, T0)).toBeNull();
  });

  it('uses a distinct secret so identical tokens hash differently', async () => {
    const other = testConfig({ sessionSecret: 'another-secret-also-16-chars' });
    const { token } = await createSession(pool, config, WALLET, T0);
    expect(await resolveSession(pool, config, token, T0)).not.toBeNull();
    expect(await resolveSession(pool, other, token, T0)).toBeNull();
  });
});
