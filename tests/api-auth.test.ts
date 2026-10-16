import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { handleApi, STATUS_BY_ERROR, type ApiDeps, type ApiRequest } from '../server/api/handlers';
import { RateLimiter } from '../server/api/ratelimit';
import { AppError, type ErrorCode } from '../src/server/errors';

const CONFIG_FIELDS = {
  databaseUrl: 'x',
  databaseUrlTest: null,
  mainnetRpcUrl: 'x',
  mainnetChainId: 143,
  chogContract: '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763',
  historyStartBlock: 1,
  appOrigin: 'http://localhost:5173',
  apiPort: 8787,
  metadataTtlMs: 1,
  maxLogRange: 100,
  identityNamespace: 'chog-mainnet',
  sessionSecret: 'test-session-secret-at-least-16-chars',
  sessionTtlMs: 86_400_000,
  nonceTtlMs: 300_000,
  host: '127.0.0.1',
  trustProxy: false,
  dbSsl: false,
  staticDir: 'dist',
} as const;

interface Route {
  match: string;
  rows?: Record<string, unknown>[];
  rowCount?: number;
}

function routedPool(routes: Route[] = []): Pool {
  const query = async (text: string): Promise<{ rows: unknown[]; rowCount: number }> => {
    for (const r of routes) {
      if (text.includes(r.match)) {
        const rows = r.rows ?? [];
        return { rows, rowCount: r.rowCount ?? rows.length };
      }
    }
    throw new Error(`unexpected query: ${text}`);
  };
  return { query } as unknown as Pool;
}

function boom(): never {
  throw new Error('storage/chain must not be reached when auth fails first');
}

function deadDeps(pool: Pool = routedPool()): ApiDeps {
  return {
    pool,
    chain: {
      maxLogRange: 100,
      getHealth: async () => boom(),
      ownerOf: async () => boom(),
      tokenURI: async () => boom(),
      getTransferLogs: async () => boom(),
    },
    config: { ...CONFIG_FIELDS },
    now: () => new Date('2026-10-15T10:00:00Z'),
  };
}

function liveChainDeps(pool: Pool): ApiDeps {
  return {
    pool,
    chain: {
      maxLogRange: 100,
      getHealth: async () => ({ ok: true, blockNumber: 100, error: null }),
      ownerOf: async () => {
        throw new AppError('CHAIN_UNAVAILABLE', 'stub rpc down');
      },
      tokenURI: async () => boom(),
      getTransferLogs: async () => boom(),
    },
    config: { ...CONFIG_FIELDS },
    now: () => new Date('2026-10-15T10:00:00Z'),
  };
}

const VALID_SESSION: Route = {
  match: 'FROM sessions',
  rows: [{ wallet: '0x601634f3d0746b550e68439286c1ad022a5f2b88', expires_at: new Date('2099-01-01T00:00:00Z') }],
};

function post(path: string, body: unknown, opts: { origin?: string | null; cookies?: Record<string, string> } = {}): ApiRequest {
  const origin = opts.origin === undefined ? null : opts.origin;
  return {
    method: 'POST',
    path,
    query: new URLSearchParams(),
    body,
    headers: { get: (name: string) => (name.toLowerCase() === 'origin' ? origin : null) },
    cookies: opts.cookies ?? {},
    ip: '10.0.0.1',
  };
}

async function codeOfCall(req: ApiRequest, deps: ApiDeps = deadDeps()): Promise<string> {
  try {
    await handleApi(deps, req);
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof AppError ? e.code : `NOT_APP_ERROR:${String(e)}`;
  }
}

const MUTATIONS: Array<[string, unknown]> = [
  ['/api/activation', { tokenId: '1425' }],
  ['/api/intention', { tokenId: '1425', intention: 'embrace' }],
  ['/api/play', { tokenId: '1425' }],
  ['/api/action', { tokenId: '1425', instanceId: 'i', choiceId: 'pass', idempotencyKey: 'abcdefgh', expectedVersion: 0 }],
];

describe('API authorization gate (session first, then origin)', () => {
  for (const [path, body] of MUTATIONS) {
    it(`POST ${path} without a session fails closed with SIGN_IN_REQUIRED and never touches storage`, async () => {
      expect(await codeOfCall(post(path, body))).toBe('SIGN_IN_REQUIRED');
    });

    it(`POST ${path} with a session but no Origin is rejected as INVALID_INPUT before any chain read`, async () => {
      const req = post(path, body, { cookies: { chog_session: 'tok' } });
      expect(await codeOfCall(req, deadDeps(routedPool([VALID_SESSION])))).toBe('INVALID_INPUT');
    });

    it(`POST ${path} with a session and a disallowed Origin is rejected as INVALID_INPUT`, async () => {
      const req = post(path, body, { origin: 'https://evil.example', cookies: { chog_session: 'tok' } });
      expect(await codeOfCall(req, deadDeps(routedPool([VALID_SESSION])))).toBe('INVALID_INPUT');
    });

    it(`POST ${path} with a session and an allowed Origin reaches the chain check`, async () => {
      const req = post(path, body, { origin: 'http://localhost:5173', cookies: { chog_session: 'tok' } });
      expect(await codeOfCall(req, liveChainDeps(routedPool([VALID_SESSION])))).toBe('CHAIN_UNAVAILABLE');
    });
  }

  it('treats an expired or unknown session token as SIGN_IN_REQUIRED', async () => {
    const req = post('/api/play', { tokenId: '1425' }, { origin: 'http://localhost:5173', cookies: { chog_session: 'tok' } });
    expect(await codeOfCall(req, deadDeps(routedPool([{ match: 'FROM sessions', rows: [] }])))).toBe('SIGN_IN_REQUIRED');
  });

  it('ignores client-supplied wallet, characterId, namespace, chainId and contract on mutations', async () => {
    const body = {
      tokenId: '1425',
      wallet: '0x00000000000000000000000000000000000000ff',
      characterId: 'forged',
      namespace: 'forged-namespace',
      chainId: 31337,
      contract: '0x00000000000000000000000000000000000000ff',
      intention: 'embrace',
    };
    const sessionWallet = '0x601634f3d0746b550e68439286c1ad022a5f2b88';
    const req = post('/api/intention', body, { origin: 'http://localhost:5173', cookies: { chog_session: 'tok' } });
    const deps: ApiDeps = {
      pool: routedPool([VALID_SESSION, { match: 'FROM characters', rows: [] }]),
      chain: {
        maxLogRange: 100,
        getHealth: async () => ({ ok: true, blockNumber: 100, error: null }),
        ownerOf: async () => ({ owner: sessionWallet, blockNumber: 100 }),
        tokenURI: async () => boom(),
        getTransferLogs: async () => boom(),
      },
      config: { ...CONFIG_FIELDS },
      now: () => new Date('2026-10-15T10:00:00Z'),
    };
    const queries: Array<{ text: string; params: unknown[] }> = [];
    const base = deps.pool.query.bind(deps.pool) as (t: string, p?: unknown[]) => Promise<unknown>;
    (deps.pool as unknown as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query = (t, p) => {
      queries.push({ text: t, params: p ?? [] });
      return base(t, p);
    };
    expect(await codeOfCall(req, deps)).toBe('INVALID_INPUT');
    expect(queries.length).toBeGreaterThan(0);
    const flat = queries.flatMap(q => [q.text, ...q.params.map(v => String(v))]).join('\n');
    expect(flat).not.toContain('forged');
    expect(flat).not.toContain('31337');
    expect(flat).not.toContain('00000000000000000000000000000000000000ff');
    expect(flat).toContain('chog-mainnet');
    expect(flat).toContain('143');
  });

  it('maps every error code to the documented HTTP status', () => {
    const expected: Record<ErrorCode, number> = {
      INVALID_INPUT: 400,
      SIGN_IN_REQUIRED: 401,
      NOT_CURRENT_OWNER: 403,
      TOKEN_NOT_FOUND: 404,
      STATE_CHANGED: 409,
      CHOICE_UNAVAILABLE: 409,
      DAILY_LIMIT: 409,
      RATE_LIMITED: 429,
      CHAIN_UNAVAILABLE: 503,
      STORAGE_UNAVAILABLE: 503,
    };
    expect(STATUS_BY_ERROR).toEqual(expected);
  });

  it('rejects a malformed tokenId before any database access', async () => {
    const req: ApiRequest = {
      method: 'GET',
      path: '/api/profile',
      query: new URLSearchParams({ tokenId: 'abc; DROP TABLE characters' }),
      body: undefined,
      headers: { get: () => null },
      cookies: {},
      ip: '10.0.0.1',
    };
    expect(await codeOfCall(req)).toBe('INVALID_INPUT');
  });

  it('rejects unknown routes', async () => {
    const req: ApiRequest = {
      method: 'GET',
      path: '/api/nope',
      query: new URLSearchParams(),
      body: undefined,
      headers: { get: () => null },
      cookies: {},
      ip: '10.0.0.1',
    };
    expect(await codeOfCall(req)).toBe('INVALID_INPUT');
  });
});

describe('auth endpoints', () => {
  it('rejects POST /api/auth/nonce without an Origin before touching storage', async () => {
    expect(await codeOfCall(post('/api/auth/nonce', { wallet: '0x601634f3d0746b550e68439286c1ad022a5f2b88' }))).toBe('INVALID_INPUT');
  });

  it('rejects POST /api/auth/verify with a disallowed Origin before touching storage', async () => {
    const req = post('/api/auth/verify', { message: 'x', signature: '0xzz' }, { origin: 'https://evil.example' });
    expect(await codeOfCall(req)).toBe('INVALID_INPUT');
  });

  it('issues an EIP-4361 message bound to app domain, wallet, chain and nonce', async () => {
    const wallet = '0x601634f3d0746b550e68439286c1ad022a5f2b88';
    const req = post('/api/auth/nonce', { wallet }, { origin: 'http://localhost:5173' });
    const deps = deadDeps(routedPool([{ match: 'INSERT INTO auth_nonces', rowCount: 1 }]));
    const out = await handleApi(deps, req);
    const json = out.json as { message: string; nonce: string; chainId: number; domain: string; uri: string };
    expect(out.status).toBe(200);
    expect(json.message.startsWith('localhost:5173 wants you to sign in with your Ethereum account:')).toBe(true);
    expect(json.message).toContain(wallet);
    expect(json.message).toContain('Chain ID: 143');
    expect(json.message).toContain(`Nonce: ${json.nonce}`);
    expect(json.message).toContain('Sign in to Chog Legacy');
    expect(json.chainId).toBe(143);
    expect(json.uri).toBe('http://localhost:5173');
  });

  it('rejects a wallet that is not a 0x address', async () => {
    const req = post('/api/auth/nonce', { wallet: 'vitalik' }, { origin: 'http://localhost:5173' });
    expect(await codeOfCall(req)).toBe('INVALID_INPUT');
  });

  it('rejects a nonce uri that is not the app origin', async () => {
    const req = post('/api/auth/nonce', { wallet: '0x601634f3d0746b550e68439286c1ad022a5f2b88', uri: 'https://evil.example' }, { origin: 'http://localhost:5173' });
    expect(await codeOfCall(req)).toBe('INVALID_INPUT');
  });

  it('GET /api/auth/session without a cookie reports authenticated false', async () => {
    const req: ApiRequest = {
      method: 'GET',
      path: '/api/auth/session',
      query: new URLSearchParams(),
      body: undefined,
      headers: { get: () => null },
      cookies: {},
      ip: '10.0.0.1',
    };
    const out = await handleApi(deadDeps(), req);
    expect(out.json).toEqual({ authenticated: false, wallet: null, expiresAt: null, expired: false, chainId: 143 });
  });

  it('GET /api/auth/session with an unknown cookie reports expired true', async () => {
    const req: ApiRequest = {
      method: 'GET',
      path: '/api/auth/session',
      query: new URLSearchParams(),
      body: undefined,
      headers: { get: () => null },
      cookies: { chog_session: 'stale' },
      ip: '10.0.0.1',
    };
    const out = await handleApi(deadDeps(routedPool([{ match: 'FROM sessions', rows: [] }])), req);
    expect(out.json).toEqual({ authenticated: false, wallet: null, expiresAt: null, expired: true, chainId: 143 });
  });

  it('POST /api/auth/logout without a session fails closed with SIGN_IN_REQUIRED', async () => {
    expect(await codeOfCall(post('/api/auth/logout', {}, { origin: 'http://localhost:5173' }))).toBe('SIGN_IN_REQUIRED');
  });

  it('POST /api/profile/refresh keeps a missing Origin allowed for curl but rejects a disallowed one', async () => {
    const body = { tokenId: '1425' };
    const noOrigin = post('/api/profile/refresh', body);
    expect(await codeOfCall(noOrigin, deadDeps())).toBe('NOT_APP_ERROR:Error: storage/chain must not be reached when auth fails first');
    const evil = post('/api/profile/refresh', body, { origin: 'https://evil.example' });
    expect(await codeOfCall(evil, deadDeps())).toBe('INVALID_INPUT');
  });
});

describe('rate limiting', () => {
  it('throws RATE_LIMITED once the window budget is spent', () => {
    let t = 0;
    const limiter = new RateLimiter(1_000, 2, () => t);
    limiter.check('ip1');
    limiter.check('ip1');
    let code = 'NONE';
    try {
      limiter.check('ip1');
    } catch (e) {
      code = e instanceof AppError ? e.code : 'OTHER';
    }
    expect(code).toBe('RATE_LIMITED');
  });

  it('separates buckets per key and refills after the window', () => {
    let t = 0;
    const limiter = new RateLimiter(1_000, 1, () => t);
    limiter.check('a');
    limiter.check('b');
    expect(() => limiter.check('a')).toThrow(AppError);
    t = 1_001;
    expect(() => limiter.check('a')).not.toThrow();
  });
});
