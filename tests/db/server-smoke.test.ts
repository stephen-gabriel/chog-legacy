import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { secp256k1 } from '@noble/curves/secp256k1';
import { startServer, type RunningServer } from '../../server/main';
import { personalMessageHash } from '../../server/auth/crypto';
import { createCleanPool, gateDb } from './helpers';

const gate = gateDb();

const WALLET = '0x4a62316623ad457f02cdc5d997ded67a383ec569';
const PRIV = new Uint8Array(32).fill(7);
const ORIGIN = 'http://localhost:5173';
const TOKEN_URI = `data:application/json;base64,${Buffer.from(
  JSON.stringify({ name: 'CHOG #5', image: 'ipfs://bafysmoke/5.png', attributes: [{ trait_type: 'Type', value: 'Ember' }] }),
).toString('base64')}`;

function encodeAbiString(s: string): string {
  const bytes = Array.from(Buffer.from(s, 'utf8'));
  let dataHex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  while (dataHex.length % 64 !== 0) dataHex += '0';
  return `0x${'0'.repeat(64)}${bytes.length.toString(16).padStart(64, '0')}${dataHex}`;
}

function startRpcStub(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { id: unknown; method: string; params: unknown[] };
      const send = (result: unknown, error?: { code: number; message: string }) => {
        const payload = JSON.stringify(error ? { jsonrpc: '2.0', id: body.id, error } : { jsonrpc: '2.0', id: body.id, result });
        res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
        res.end(payload);
      };
      switch (body.method) {
        case 'eth_chainId':
          return send('0x8f');
        case 'eth_blockNumber':
          return send('0x10');
        case 'eth_call': {
          const data = (body.params[0] as { data?: string }).data ?? '0x';
          if (data.startsWith('0x06fdde03')) return send(encodeAbiString('Chog Smoke'));
          if (data.startsWith('0x6352211e')) return send(`0x${WALLET.slice(2).padStart(64, '0')}`);
          if (data.startsWith('0xc87b56dd')) {
            const id = BigInt('0x' + data.slice(10)).toString();
            if (id === '888') return send(encodeAbiString('ftp://bad.example/888.json'));
            return send(encodeAbiString(TOKEN_URI));
          }
          return send(undefined, { code: 3, message: 'execution reverted: unknown selector' });
        }
        case 'eth_getLogs':
          return send([]);
        default:
          return send(undefined, { code: -32601, message: `method not found: ${body.method}` });
      }
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

function signPersonal(message: string): string {
  const sig = secp256k1.sign(personalMessageHash(message), PRIV);
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  return `0x${r}${s}${(27 + (sig.recovery ?? 0)).toString(16)}`;
}

interface HttpResult {
  status: number;
  json: Record<string, unknown>;
  setCookie: string | null;
}

describe.runIf(gate.ok)('HTTP server smoke test on an ephemeral port (real database, stub RPC)', () => {
  let rpc: { server: Server; url: string };
  let running: RunningServer;
  let base: string;

  async function call(
    method: string,
    path: string,
    body?: unknown,
    opts: { origin?: string | null; cookie?: string } = {},
  ): Promise<HttpResult> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (opts.origin) headers.origin = opts.origin;
    if (opts.cookie) headers.cookie = opts.cookie;
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json, setCookie: res.headers.get('set-cookie') };
  }

  beforeAll(async () => {
    const bootstrap = await createCleanPool(gate.url!);
    await bootstrap.end();
    rpc = await startRpcStub();
    running = await startServer({
      DATABASE_URL: gate.url!,
      API_PORT: '0',
      MAINNET_RPC_URL: rpc.url,
      APP_ORIGIN: ORIGIN,
      SESSION_SECRET: 'smoke-session-secret-16-plus',
      HISTORY_START_BLOCK: '1',
      IDENTITY_NAMESPACE: 'chog-smoke',
      METADATA_TTL_MS: '60000',
    });
    base = `http://127.0.0.1:${running.port}`;
    expect(running.port).toBeGreaterThan(0);
  }, 30_000);

  afterAll(async () => {
    if (running) await running.close();
    if (rpc) await new Promise<void>(resolve => rpc.server.close(() => resolve()));
  });

  it('GET /api/health reports db, chain and contract name', async () => {
    const out = await call('GET', '/api/health');
    expect(out.status).toBe(200);
    expect(out.json.db).toBe(true);
    expect(out.json.chainId).toBe(143);
    expect(out.json.contractName).toBe('Chog Smoke');
    expect((out.json.chain as { ok: boolean }).ok).toBe(true);
  });

  it('auth and validation failures map to the documented status envelopes', async () => {
    const noSession = await call('POST', '/api/play', { tokenId: '5' }, { origin: ORIGIN });
    expect(noSession.status).toBe(401);
    expect(noSession.json.error).toEqual({ code: 'SIGN_IN_REQUIRED', message: expect.any(String) });

    const badToken = await call('GET', '/api/profile?tokenId=abc');
    expect(badToken.status).toBe(400);
    expect((badToken.json.error as { code: string }).code).toBe('INVALID_INPUT');

    const unknownRoute = await call('GET', '/api/nope');
    expect(unknownRoute.status).toBe(400);
    expect((unknownRoute.json.error as { code: string }).code).toBe('INVALID_INPUT');

    const noOrigin = await call('POST', '/api/play', { tokenId: '5' });
    expect(noOrigin.status).toBe(401);

    const evilOrigin = await call('POST', '/api/play', { tokenId: '5' }, { origin: 'https://evil.example' });
    expect(evilOrigin.status).toBe(401);
  });

  it('CORS preflight allows app origins and rejects unknown ones', async () => {
    const allowed = await call('OPTIONS', '/api/play', undefined, { origin: ORIGIN });
    expect(allowed.status).toBe(204);
    const res = await fetch(`${base}/api/play`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const denied = await fetch(`${base}/api/play`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    expect(denied.status).toBe(403);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('runs the full SIWE sign-in, activation, play, idempotent action and logout over HTTP', async () => {
    const nonce = await call('POST', '/api/auth/nonce', { wallet: WALLET, uri: ORIGIN }, { origin: ORIGIN });
    expect(nonce.status).toBe(200);
    const message = nonce.json.message as string;
    expect(message.startsWith('localhost:')).toBe(true);
    expect(message).toContain(`Nonce: ${nonce.json.nonce}`);

    const verify = await call('POST', '/api/auth/verify', { message, signature: signPersonal(message) }, { origin: ORIGIN });
    expect(verify.status).toBe(200);
    expect(verify.json).toMatchObject({ authenticated: true, wallet: WALLET });
    expect(verify.setCookie).toBeTruthy();
    expect(verify.setCookie).toContain('chog_session=');
    expect(verify.setCookie).toContain('HttpOnly');
    expect(verify.setCookie).toContain('SameSite=Lax');
    const cookie = verify.setCookie!.split(';')[0];

    const session = await call('GET', '/api/auth/session', undefined, { cookie });
    expect(session.json).toMatchObject({ authenticated: true, wallet: WALLET, expired: false });

    const replay = await call('POST', '/api/auth/verify', { message, signature: signPersonal(message) }, { origin: ORIGIN });
    expect(replay.status).toBe(401);
    expect((replay.json.error as { code: string }).code).toBe('SIGN_IN_REQUIRED');

    const activate = await call('POST', '/api/activation', { tokenId: '5' }, { origin: ORIGIN, cookie });
    expect(activate.status).toBe(200);
    expect(activate.json.created).toBe(true);

    const play = await call('POST', '/api/play', { tokenId: '5' }, { origin: ORIGIN, cookie });
    expect(play.status).toBe(200);
    const playState = play.json as { encounter: { instanceId: string; choices: Array<{ id: string; eligible: boolean }> } | null; version: number; actionsUsed: number };
    expect(playState.encounter).not.toBeNull();
    const choice = playState.encounter!.choices.find(c => c.eligible)!;

    const actionBody = {
      tokenId: '5',
      instanceId: playState.encounter!.instanceId,
      choiceId: choice.id,
      expectedVersion: playState.version,
      idempotencyKey: `act:${playState.encounter!.instanceId}:${choice.id}`,
    };
    const action = await call('POST', '/api/action', actionBody, { origin: ORIGIN, cookie });
    expect(action.status).toBe(200);
    expect(action.json.actionsUsed).toBe(1);
    expect(action.json.duplicate).toBeFalsy();

    const dup = await call('POST', '/api/action', actionBody, { origin: ORIGIN, cookie });
    expect(dup.status).toBe(200);
    expect(dup.json.duplicate).toBe(true);
    expect(dup.json.eventId).toBe(action.json.eventId);

    const refresh = await call('POST', '/api/profile/refresh', { tokenId: '5' }, { origin: ORIGIN });
    expect(refresh.status).toBe(200);
    expect((refresh.json.ownership as { owner: string }).owner.toLowerCase()).toBe(WALLET);
    expect((refresh.json.metadata as { name: string }).name).toBe('CHOG #5');

    const logout = await call('POST', '/api/auth/logout', {}, { origin: ORIGIN, cookie });
    expect(logout.status).toBe(200);
    expect(logout.json.authenticated).toBe(false);
    expect(logout.setCookie).toContain('Max-Age=0');

    const afterLogout = await call('POST', '/api/play', { tokenId: '5' }, { origin: ORIGIN, cookie });
    expect(afterLogout.status).toBe(401);
    expect((afterLogout.json.error as { code: string }).code).toBe('SIGN_IN_REQUIRED');
  });

  it('rejects refresh from a foreign Origin with ORIGIN_DENIED and keeps the read path open', async () => {
    const denied = await call('POST', '/api/profile/refresh', { tokenId: '5' }, { origin: 'https://evil.example' });
    expect(denied.status).toBe(403);
    expect((denied.json.error as { code: string }).code).toBe('ORIGIN_DENIED');
    expect((denied.json.error as { message: string }).message).toContain('app origin');

    const loopback = await call('POST', '/api/profile/refresh', { tokenId: '5' }, { origin: 'http://127.0.0.1:9' });
    expect(loopback.status).toBe(403);
    expect((loopback.json.error as { code: string }).code).toBe('ORIGIN_DENIED');

    const read = await call('GET', '/api/profile?tokenId=5');
    expect(read.status).toBe(200);
  });

  it('first-time lookup of an uncached token fetches ownership and metadata without a POST', async () => {
    const res = await call('GET', '/api/profile?tokenId=777');
    expect(res.status).toBe(200);
    const profile = res.json as {
      ownership: { owner: string | null; status: string };
      metadata: { name: string | null; error: string | null } | null;
    };
    expect(profile.ownership.owner?.toLowerCase()).toBe(WALLET);
    expect(profile.ownership.status).toBe('fresh');
    expect(profile.metadata?.name).toBe('CHOG #5');
    expect(profile.metadata?.error).toBeNull();
  });

  it('first-time lookup keeps ownership results when metadata resolution fails', async () => {
    const res = await call('GET', '/api/profile?tokenId=888');
    expect(res.status).toBe(200);
    const profile = res.json as {
      ownership: { owner: string | null };
      metadata: { name: string | null; error: string | null } | null;
    };
    expect(profile.ownership.owner?.toLowerCase()).toBe(WALLET);
    expect(profile.metadata).not.toBeNull();
    expect(profile.metadata!.name).toBeNull();
    expect(profile.metadata!.error).toContain('unsupported');
  });
});
