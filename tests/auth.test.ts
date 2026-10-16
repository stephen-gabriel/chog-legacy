import { describe, expect, it } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  SIWE_STATEMENT,
  SIWE_VERSION,
  buildSiweMessage,
  canonicalOrigin,
  isAllowedAppOrigin,
  parseSiweMessage,
} from '../src/shared/siwe';
import {
  addressFromPublicKey,
  hashSecret,
  personalMessageHash,
  randomHex,
  recoverSigner,
} from '../server/auth/crypto';
import { buildClearCookie, buildSessionCookie, parseCookieHeader, SESSION_COOKIE } from '../server/auth/session';

const PRIV = new Uint8Array(32).fill(7);
const ADDRESS = '0x4a62316623ad457f02cdc5d997ded67a383ec569';

function signPersonal(message: string, priv: Uint8Array, mode: 'v27' | 'eip2098'): string {
  const digest = personalMessageHash(message);
  const sig = secp256k1.sign(digest, priv);
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  if (mode === 'v27') {
    return `0x${r}${s}${(27 + (sig.recovery ?? 0)).toString(16)}`;
  }
  const sBytes = Buffer.from(s, 'hex');
  if (sig.recovery) sBytes[0] |= 0x80;
  return `0x${r}${sBytes.toString('hex')}`;
}

function sampleMessage(nonce = 'AbCdEfGh1234'): string {
  return buildSiweMessage({
    domain: 'localhost:5173',
    address: ADDRESS,
    statement: SIWE_STATEMENT,
    uri: 'http://localhost:5173',
    version: SIWE_VERSION,
    chainId: 143,
    nonce,
    issuedAt: '2026-10-15T10:00:00.000Z',
    expirationTime: '2026-10-15T10:05:00.000Z',
  });
}

describe('SIWE message build and parse', () => {
  it('round-trips every field including expiration', () => {
    const text = sampleMessage();
    const parsed = parseSiweMessage(text);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      domain: 'localhost:5173',
      address: ADDRESS,
      statement: SIWE_STATEMENT,
      uri: 'http://localhost:5173',
      version: '1',
      chainId: 143,
      nonce: 'AbCdEfGh1234',
      issuedAt: '2026-10-15T10:00:00.000Z',
      expirationTime: '2026-10-15T10:05:00.000Z',
    });
    expect(buildSiweMessage(parsed!)).toBe(text);
  });

  it('parses a message without expiration', () => {
    const text = sampleMessage().split('\n').slice(0, -1).join('\n');
    const parsed = parseSiweMessage(text);
    expect(parsed?.expirationTime).toBeUndefined();
  });

  it('rejects malformed messages', () => {
    expect(parseSiweMessage('')).toBeNull();
    expect(parseSiweMessage('not a siwe message')).toBeNull();
    expect(parseSiweMessage('x'.repeat(5000))).toBeNull();
    const good = sampleMessage();
    expect(parseSiweMessage(good.replace('localhost:5173 wants', 'bad domain wants'))).toBeNull();
    expect(parseSiweMessage(good.replace(ADDRESS, '0x1234'))).toBeNull();
    expect(parseSiweMessage(`${good}\nRequestId: extra`)).toBeNull();
    expect(parseSiweMessage(good.replace('Nonce: AbCdEfGh1234', 'nonce: AbCdEfGh1234'))).toBeNull();
    expect(parseSiweMessage(good.replace('Nonce: AbCdEfGh1234', 'Nonce: AbCdEfGh1234\nNonce: ZzZzZzZz9999'))).toBeNull();
    expect(parseSiweMessage(good.replace('Chain ID: 143', 'Chain ID: -4'))).toBeNull();
    expect(parseSiweMessage(good.replace('Nonce: AbCdEfGh1234', 'Nonce: short'))).toBeNull();
    expect(parseSiweMessage(good.replace('URI: http://localhost:5173', 'URI: javascript:alert(1)'))).toBeNull();
    expect(parseSiweMessage(good.replace('Issued At: 2026-10-15T10:00:00.000Z', 'Issued At: never'))).toBeNull();
  });
});

describe('origin allowlisting', () => {
  it('accepts the app origin and any localhost port', () => {
    expect(isAllowedAppOrigin('http://localhost:5173', 'http://localhost:5173')).toBe(true);
    expect(isAllowedAppOrigin('http://localhost:9999', 'https://chog.example')).toBe(true);
    expect(isAllowedAppOrigin('http://127.0.0.1:5173', 'http://localhost:5173')).toBe(false);
    expect(isAllowedAppOrigin('https://evil.example', 'http://localhost:5173')).toBe(false);
    expect(isAllowedAppOrigin('http://localhost.evil.com', 'http://localhost:5173')).toBe(false);
    expect(isAllowedAppOrigin('nonsense', 'http://localhost:5173')).toBe(false);
  });

  it('restricts localhost allowances to development when allowLocalhost is false', () => {
    expect(isAllowedAppOrigin('http://localhost:9999', 'https://chog.example', { allowLocalhost: false })).toBe(false);
    expect(isAllowedAppOrigin('http://localhost:5173', 'https://chog.example', { allowLocalhost: false })).toBe(false);
    expect(isAllowedAppOrigin('https://chog.example', 'https://chog.example', { allowLocalhost: false })).toBe(true);
    expect(isAllowedAppOrigin('http://127.0.0.1:8420', 'http://127.0.0.1:8420', { allowLocalhost: false })).toBe(true);
    expect(isAllowedAppOrigin('https://evil.example', 'https://chog.example', { allowLocalhost: false })).toBe(false);
  });

  it('canonicalOrigin falls back to empty string', () => {
    expect(canonicalOrigin('https://a.example/x')).toBe('https://a.example');
    expect(canonicalOrigin('nope')).toBe('');
  });
});

describe('crypto helpers', () => {
  it('matches the empty-string keccak256 vector', () => {
    const digest = personalMessageHash('hello');
    expect(digest).toHaveLength(32);
    expect(Buffer.from(digest).toString('hex')).toBe(
      '50b2c43fd39106bafbba0da34fc430e1f91e3c96ea2acee2bc34119f92b37750',
    );
  });

  it('derives the known address from the sample public key', () => {
    const pub = secp256k1.getPublicKey(PRIV, false);
    expect(addressFromPublicKey(pub)).toBe(ADDRESS);
  });

  it('recovers the signer from a 65-byte v=27/28 signature', () => {
    const message = sampleMessage();
    const sig = signPersonal(message, PRIV, 'v27');
    expect(recoverSigner(message, sig)).toBe(ADDRESS);
    expect(recoverSigner(message, sig.slice(2))).toBe(ADDRESS);
  });

  it('recovers the signer from a 64-byte EIP-2098 signature', () => {
    const message = sampleMessage();
    const sig = signPersonal(message, PRIV, 'eip2098');
    expect(sig).toHaveLength(130);
    expect(recoverSigner(message, sig)).toBe(ADDRESS);
  });

  it('returns null for malformed signatures and fails on tampered messages', () => {
    const message = sampleMessage();
    const sig = signPersonal(message, PRIV, 'v27');
    expect(recoverSigner(message, '')).toBeNull();
    expect(recoverSigner(message, '0x1234')).toBeNull();
    expect(recoverSigner(message, `0x${'zz'.repeat(65)}`)).toBeNull();
    expect(recoverSigner(message, `${sig.slice(0, 130)}1`)).toBeNull();
    expect(recoverSigner(`${message}\n`, sig)).not.toBe(ADDRESS);
    expect(recoverSigner(message, sig)).not.toBe('0x0000000000000000000000000000000000000000');
  });

  it('hashes secrets deterministically and per-secret', () => {
    expect(hashSecret('token', 'secret-a')).toBe(hashSecret('token', 'secret-a'));
    expect(hashSecret('token', 'secret-a')).not.toBe(hashSecret('token', 'secret-b'));
    expect(hashSecret('token', 'secret-a')).not.toBe(hashSecret('other', 'secret-a'));
    expect(hashSecret('token', 'secret-a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates distinct hex tokens', () => {
    const a = randomHex(32);
    const b = randomHex(32);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe('session cookie helpers', () => {
  it('parses cookie headers, ignoring duplicates and malformed parts', () => {
    expect(parseCookieHeader('a=1; b=2')).toEqual({ a: '1', b: '2' });
    expect(parseCookieHeader(' a = 1 ;b=2')).toEqual({ a: '1', b: '2' });
    expect(parseCookieHeader('a=1; a=2')).toEqual({ a: '1' });
    expect(parseCookieHeader('novalue; a=1')).toEqual({ a: '1' });
    expect(parseCookieHeader('')).toEqual({});
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  it('builds an HttpOnly SameSite session cookie with Max-Age', () => {
    const expires = new Date(Date.now() + 3600_000);
    const cookie = buildSessionCookie('tok', expires, 'http://localhost:5173');
    expect(cookie.startsWith(`${SESSION_COOKIE}=tok; `)).toBe(true);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toMatch(/Max-Age=3\d{3}/);
    expect(cookie).not.toContain('Secure');
    const secure = buildSessionCookie('tok', expires, 'https://chog.example');
    expect(secure).toContain('; Secure');
    expect(buildSessionCookie('tok', expires, 'https://chog.example')).toBe(secure);
  });

  it('builds a clearing cookie', () => {
    const cleared = buildClearCookie('http://localhost:5173');
    expect(cleared).toContain(`${SESSION_COOKIE}=;`);
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('HttpOnly');
    expect(buildClearCookie('https://chog.example')).toContain('; Secure');
  });
});
