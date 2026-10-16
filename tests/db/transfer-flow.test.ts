import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { Config } from '../../server/config';
import { createRpcAdapter } from '../../server/chain/adapter';
import {
  SELECTOR_NAME,
  SELECTOR_OWNER_OF,
  SELECTOR_TOKEN_URI,
  TOPIC_TRANSFER,
  ZERO_ADDRESS,
  tokenIdTopic,
} from '../../server/chain/abi';
import { handleApi, type ApiDeps, type ApiRequest } from '../../server/api/handlers';
import { addressFromPublicKey, personalMessageHash } from '../../server/auth/crypto';
import { AppError } from '../../src/server/errors';
import type { ApiActivationResult, ApiCommitReceipt, ApiHealth, ApiPlayState, ApiProfile } from '../../src/shared/apiTypes';
import { createCleanPool, gateDb } from './helpers';

const gate = gateDb();

const RPC_URL = 'http://mock-rpc.internal/';
const MOCK_CONTRACT = '0x2222222222222222222222222222222222222222';
const CHAIN_ID = 31337;
const TOKEN_ID = '777';
const ORIGIN = 'http://localhost:5173';
const NOW = new Date('2026-10-15T10:00:00.000Z');

const PRIV_A = new Uint8Array(32).fill(7);
const PRIV_B = new Uint8Array(32).fill(9);
const WALLET_A = addressFromPublicKey(secp256k1.getPublicKey(PRIV_A, false));
const WALLET_B = addressFromPublicKey(secp256k1.getPublicKey(PRIV_B, false));

const CONFIG: Config = {
  databaseUrl: 'postgres://unused',
  databaseUrlTest: null,
  mainnetRpcUrl: RPC_URL,
  mainnetChainId: CHAIN_ID,
  chogContract: MOCK_CONTRACT,
  historyStartBlock: 1,
  appOrigin: ORIGIN,
  apiPort: 8420,
  metadataTtlMs: 60_000,
  maxLogRange: 100,
  identityNamespace: 'chog-mock',
  sessionSecret: 'test-session-secret-at-least-16-chars',
  sessionTtlMs: 86_400_000,
  nonceTtlMs: 300_000,
  host: '127.0.0.1',
  trustProxy: false,
  dbSsl: false,
  staticDir: 'dist',
  production: false,
};

/* ---------------- minimal RLP ---------------- */

type RlpItem = Uint8Array | bigint | RlpItem[];

function toMinimalBytes(v: bigint): Uint8Array {
  if (v === 0n) return new Uint8Array(0);
  let hex = v.toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;
  return hexToBytes(hex);
}

function concatBytesOf(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function encodeLen(len: number, offset: number): Uint8Array {
  if (len < 56) return new Uint8Array([offset + len]);
  const lenBytes = toMinimalBytes(BigInt(len));
  return concatBytesOf(new Uint8Array([offset + 55 + lenBytes.length]), lenBytes);
}

function rlpEncode(item: RlpItem): Uint8Array {
  if (typeof item === 'bigint') return rlpEncodeBytes(toMinimalBytes(item));
  if (item instanceof Uint8Array) return rlpEncodeBytes(item);
  const payload = concatBytesOf(...item.map(rlpEncode));
  return concatBytesOf(encodeLen(payload.length, 0xc0), payload);
}

function rlpEncodeBytes(b: Uint8Array): Uint8Array {
  if (b.length === 1 && b[0] < 0x80) return b;
  return concatBytesOf(encodeLen(b.length, 0x80), b);
}

function rlpDecode(buf: Uint8Array): RlpItem {
  const readAt = (i: number): { item: RlpItem; next: number } => {
    const prefix = buf[i];
    if (prefix <= 0x7f) return { item: buf.slice(i, i + 1), next: i + 1 };
    if (prefix <= 0xbf) {
      const str = readPayloadLen(i, 0x80);
      return { item: buf.slice(str.start, str.start + str.len), next: str.start + str.len };
    }
    const list = readPayloadLen(i, 0xc0);
    const items: RlpItem[] = [];
    let cursor = list.start;
    const end = list.start + list.len;
    while (cursor < end) {
      const r = readAt(cursor);
      items.push(r.item);
      cursor = r.next;
    }
    return { item: items, next: end };
  };
  const readPayloadLen = (i: number, offset: number): { len: number; start: number } => {
    const p = buf[i];
    if (p < offset + 56) return { len: p - offset, start: i + 1 };
    const size = p - offset - 55;
    const len = Number(BigInt(`0x${bytesToHex(buf.slice(i + 1, i + 1 + size)) || '0'}`));
    return { len, start: i + 1 + size };
  };
  const { item } = readAt(0);
  return item;
}

function bytesToBig(b: Uint8Array): bigint {
  return b.length === 0 ? 0n : BigInt(`0x${bytesToHex(b)}`);
}

/* ---------------- in-process JSON-RPC mock chain ---------------- */

interface MockLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: string;
}

function padAddress(a: string): string {
  return `0x${a.slice(2).padStart(64, '0')}`;
}

function encodeAbiString(s: string): string {
  const bytes = Array.from(Buffer.from(s, 'utf8'));
  let dataHex = bytes.map(b => b.toString(16).padStart(2, '0')).join('');
  while (dataHex.length % 64 !== 0) dataHex += '0';
  return `0x${'0'.repeat(64)}${bytes.length.toString(16).padStart(64, '0')}${dataHex}`;
}

const TOKEN_URI = `data:application/json;base64,${Buffer.from(
  JSON.stringify({
    name: 'CHOG #777',
    image: 'ipfs://bafymock/777.png',
    attributes: [
      { trait_type: 'Type', value: 'Ashen' },
      { trait_type: 'Mood', value: 'Wary' },
    ],
  }),
).toString('base64')}`;

const mockState = {
  block: 50n,
  owners: new Map<string, string>([[TOKEN_ID, WALLET_A.toLowerCase()]]),
  logs: [] as MockLog[],
  lastSender: null as string | null,
};

function seedMintLog(): void {
  mockState.logs = [
    {
      address: MOCK_CONTRACT,
      topics: [TOPIC_TRANSFER, padAddress(ZERO_ADDRESS), padAddress(WALLET_A), tokenIdTopic(TOKEN_ID)],
      data: '0x',
      blockNumber: '0xa',
      blockHash: '0xmockblock0a',
      transactionHash: '0xmockmint',
      logIndex: '0x0',
    },
  ];
}

function jsonRpc(id: unknown, result?: unknown, error?: { code: number; message: string }): Response {
  return new Response(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function handleEthCall(call: { to?: string; data?: string }): Response {
  if ((call.to ?? '').toLowerCase() !== MOCK_CONTRACT.toLowerCase()) {
    return jsonRpc(1, undefined, { code: 3, message: 'execution reverted: wrong contract' });
  }
  const data = call.data ?? '0x';
  const selector = data.slice(0, 10);
  if (selector === SELECTOR_OWNER_OF) {
    const tokenId = BigInt(`0x${data.slice(10)}`).toString();
    const owner = mockState.owners.get(tokenId);
    if (!owner) return jsonRpc(1, undefined, { code: 3, message: 'execution reverted: ERC721: invalid token ID' });
    return jsonRpc(1, padAddress(owner));
  }
  if (selector === SELECTOR_TOKEN_URI) return jsonRpc(1, encodeAbiString(TOKEN_URI));
  if (selector === SELECTOR_NAME) return jsonRpc(1, encodeAbiString('Chog Mock'));
  return jsonRpc(1, undefined, { code: 3, message: 'execution reverted: unknown selector' });
}

function handleGetLogs(filter: { topics?: (string | null)[]; fromBlock?: string; toBlock?: string }): Response {
  const from = Number(BigInt(filter.fromBlock ?? '0x0'));
  const to = Number(BigInt(filter.toBlock ?? '0x0'));
  const out = mockState.logs.filter(log => {
    const bn = Number(BigInt(log.blockNumber));
    if (bn < from || bn > to) return false;
    const topics = filter.topics ?? [];
    for (let i = 0; i < topics.length; i += 1) {
      if (topics[i] !== null && topics[i] !== undefined && (log.topics[i] ?? '').toLowerCase() !== topics[i]!.toLowerCase()) {
        return false;
      }
    }
    return true;
  });
  return jsonRpc(1, out);
}

function handleSendRaw(rawHex: string): Response {
  const decoded = rlpDecode(hexToBytes(rawHex.startsWith('0x') ? rawHex.slice(2) : rawHex));
  if (!Array.isArray(decoded) || decoded.length !== 9 || !decoded.every(x => x instanceof Uint8Array)) {
    return jsonRpc(1, undefined, { code: 3, message: 'execution reverted: malformed legacy transaction' });
  }
  const [nonce, gasPrice, gas, to, value, data, v, r, s] = decoded as Uint8Array[];
  if (`0x${bytesToHex(to)}`.toLowerCase() !== MOCK_CONTRACT.toLowerCase()) {
    return jsonRpc(1, undefined, { code: 3, message: 'execution reverted: wrong target' });
  }
  const signingItems: RlpItem[] = [nonce, gasPrice, gas, to, value, data, BigInt(CHAIN_ID), 0n, 0n];
  const signingHash = keccak_256(rlpEncode(signingItems));
  const vNum = Number(bytesToBig(v));
  const recid = vNum - (CHAIN_ID * 2 + 35);
  if (recid !== 0 && recid !== 1) {
    return jsonRpc(1, undefined, { code: 3, message: 'execution reverted: bad v' });
  }
  const rHex = bytesToBig(r).toString(16).padStart(64, '0');
  const sHex = bytesToBig(s).toString(16).padStart(64, '0');
  let sender: string;
  try {
    const sig = secp256k1.Signature.fromCompact(rHex + sHex).addRecoveryBit(recid).recoverPublicKey(signingHash);
    sender = addressFromPublicKey(sig.toRawBytes(false));
  } catch {
    return jsonRpc(1, undefined, { code: 3, message: 'execution reverted: signature recovery failed' });
  }
  const dataHex = bytesToHex(data);
  if (dataHex.slice(0, 8) !== '23b872dd') {
    return jsonRpc(1, undefined, { code: 3, message: 'execution reverted: expected transferFrom' });
  }
  const fromArg = `0x${dataHex.slice(8 + 24, 8 + 64)}`;
  const toArg = `0x${dataHex.slice(8 + 64 + 24, 8 + 128)}`;
  const tokenIdArg = BigInt(`0x${dataHex.slice(8 + 128, 8 + 192)}`).toString();
  const currentOwner = mockState.owners.get(tokenIdArg);
  if (sender.toLowerCase() !== (currentOwner ?? '').toLowerCase() || fromArg.toLowerCase() !== sender.toLowerCase()) {
    return jsonRpc(1, undefined, { code: 3, message: 'execution reverted: transfer caller is not owner' });
  }
  mockState.owners.set(tokenIdArg, toArg.toLowerCase());
  mockState.block += 1n;
  mockState.lastSender = sender;
  const txHash = `0x${bytesToHex(keccak_256(hexToBytes(rawHex.startsWith('0x') ? rawHex.slice(2) : rawHex)))}`;
  mockState.logs.push({
    address: MOCK_CONTRACT,
    topics: [TOPIC_TRANSFER, padAddress(fromArg), padAddress(toArg), tokenIdTopic(tokenIdArg)],
    data: '0x',
    blockNumber: `0x${mockState.block.toString(16)}`,
    blockHash: `0xmockblock${mockState.block.toString(16)}`,
    transactionHash: txHash,
    logIndex: '0x0',
  });
  return jsonRpc(1, txHash);
}

async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : String(input);
  if (!url.startsWith(RPC_URL)) {
    return new Response(JSON.stringify({ error: `unexpected external fetch: ${url}` }), { status: 500 });
  }
  const req = JSON.parse(String(init?.body)) as { id: unknown; method: string; params: unknown[] };
  switch (req.method) {
    case 'eth_chainId':
      return jsonRpc(req.id, `0x${CHAIN_ID.toString(16)}`);
    case 'eth_blockNumber':
      return jsonRpc(req.id, `0x${mockState.block.toString(16)}`);
    case 'eth_call':
      return handleEthCall(req.params[0] as { to?: string; data?: string });
    case 'eth_getLogs':
      return handleGetLogs(req.params[0] as { topics?: (string | null)[]; fromBlock?: string; toBlock?: string });
    case 'eth_sendRawTransaction':
      return handleSendRaw(req.params[0] as string);
    default:
      return jsonRpc(req.id, undefined, { code: -32601, message: `method not found: ${req.method}` });
  }
}

/* ---------------- signing + API helpers ---------------- */

function signPersonal(message: string, priv: Uint8Array): string {
  const digest = personalMessageHash(message);
  const sig = secp256k1.sign(digest, priv);
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  return `0x${r}${s}${(27 + (sig.recovery ?? 0)).toString(16)}`;
}

function buildTransferFromTx(): { raw: string; hash: string } {
  const contractBytes = hexToBytes(MOCK_CONTRACT.slice(2));
  const data = `0x23b872dd${padAddress(WALLET_A).slice(2)}${padAddress(WALLET_B).slice(2)}${BigInt(TOKEN_ID).toString(16).padStart(64, '0')}`;
  const unsigned: RlpItem[] = [0n, 0n, 0n, contractBytes, 0n, hexToBytes(data.slice(2)), BigInt(CHAIN_ID), 0n, 0n];
  const signingHash = keccak_256(rlpEncode(unsigned));
  const sig = secp256k1.sign(signingHash, PRIV_A);
  const v = BigInt(CHAIN_ID * 2 + 35 + (sig.recovery ?? 0));
  const signed: RlpItem[] = [0n, 0n, 0n, contractBytes, 0n, hexToBytes(data.slice(2)), v, sig.r, sig.s];
  const rawBytes = rlpEncode(signed);
  return { raw: `0x${bytesToHex(rawBytes)}`, hash: `0x${bytesToHex(keccak_256(rawBytes))}` };
}

function apiReq(
  method: string,
  path: string,
  body?: unknown,
  opts: { query?: Record<string, string>; cookies?: Record<string, string>; origin?: string | null } = {},
): ApiRequest {
  const origin = opts.origin === undefined ? null : opts.origin;
  return {
    method,
    path,
    query: new URLSearchParams(opts.query ?? {}),
    body,
    headers: { get: (name: string) => (name.toLowerCase() === 'origin' ? origin : null) },
    cookies: opts.cookies ?? {},
    ip: '10.0.0.1',
  };
}

async function codeOf(deps: ApiDeps, req: ApiRequest): Promise<string> {
  try {
    await handleApi(deps, req);
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof AppError ? e.code : `NOT_APP_ERROR:${String(e)}`;
  }
}

describe.runIf(gate.ok)('owner transfer flow through a mock JSON-RPC chain (real database)', () => {
  let pool: Pool;
  let deps: ApiDeps;
  let cookiesA: Record<string, string>;
  let cookiesB: Record<string, string>;
  let characterId = '';
  let playA: ApiPlayState;
  let statsAfterFirstAction: ApiCommitReceipt['after'];

  async function siweSignIn(wallet: string, priv: Uint8Array): Promise<Record<string, string>> {
    const nonceOut = await handleApi(deps, apiReq('POST', '/api/auth/nonce', { wallet, uri: ORIGIN }, { origin: ORIGIN }));
    const { message } = nonceOut.json as { message: string };
    const verify = await handleApi(
      deps,
      apiReq('POST', '/api/auth/verify', { message, signature: signPersonal(message, priv) }, { origin: ORIGIN }),
    );
    const cookie = verify.setCookie;
    expect(cookie).toBeTruthy();
    const token = cookie!.split(';')[0].split('=')[1];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    return { chog_session: token };
  }

  beforeAll(async () => {
    vi.stubGlobal('fetch', mockFetch);
    seedMintLog();
    pool = await createCleanPool(gate.url!);
    deps = { pool, chain: createRpcAdapter(CONFIG), config: CONFIG, now: () => NOW };
    cookiesA = await siweSignIn(WALLET_A, PRIV_A);
    cookiesB = await siweSignIn(WALLET_B, PRIV_B);
  }, 30_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (pool) await pool.end();
  });

  it('health reports the mock chain id and contract name', async () => {
    const out = await handleApi(deps, apiReq('GET', '/api/health'));
    const health = out.json as ApiHealth;
    expect(out.status).toBe(200);
    expect(health.chainId).toBe(CHAIN_ID);
    expect(health.chain.ok).toBe(true);
    expect(health.contractName).toBe('Chog Mock');
  });

  it('owner A activates the Chog and plays one daily decision', async () => {
    const act = await handleApi(deps, apiReq('POST', '/api/activation', { tokenId: TOKEN_ID }, { origin: ORIGIN, cookies: cookiesA }));
    const activation = act.json as ApiActivationResult;
    expect(activation.created).toBe(true);
    expect(activation.controller.toLowerCase()).toBe(WALLET_A);
    characterId = activation.characterId;
    expect(characterId).toBeTruthy();

    const play = await handleApi(deps, apiReq('POST', '/api/play', { tokenId: TOKEN_ID }, { origin: ORIGIN, cookies: cookiesA }));
    playA = play.json as ApiPlayState;
    expect(playA.characterId).toBe(characterId);
    expect(playA.actionsUsed).toBe(0);
    expect(playA.version).toBe(0);
    expect(playA.encounter).not.toBeNull();
    expect(playA.controller.toLowerCase()).toBe(WALLET_A);
  });

  it('commits the decision exactly once and a duplicate retry is a no-op', async () => {
    const choice = playA.encounter!.choices.find(c => c.eligible)!;
    const body = {
      tokenId: TOKEN_ID,
      instanceId: playA.encounter!.instanceId,
      choiceId: choice.id,
      expectedVersion: playA.version,
      idempotencyKey: `act:${playA.encounter!.instanceId}:${choice.id}`,
    };
    const first = await handleApi(deps, apiReq('POST', '/api/action', body, { origin: ORIGIN, cookies: cookiesA }));
    const receipt = first.json as ApiCommitReceipt;
    expect(receipt.duplicate).toBeFalsy();
    expect(receipt.actionsUsed).toBe(1);
    expect(receipt.left).toBe(2);
    expect(receipt.after).not.toEqual(receipt.before);
    statsAfterFirstAction = receipt.after;

    const retry = await handleApi(deps, apiReq('POST', '/api/action', body, { origin: ORIGIN, cookies: cookiesA }));
    const dup = retry.json as ApiCommitReceipt;
    expect(dup.duplicate).toBe(true);
    expect(dup.eventId).toBe(receipt.eventId);
    expect(dup.after).toEqual(receipt.after);
    expect(dup.actionsUsed).toBe(1);
  });

  it('profile refresh observes owner A and indexes the mint before the transfer', async () => {
    const out = await handleApi(deps, apiReq('POST', '/api/profile/refresh', { tokenId: TOKEN_ID }, { origin: ORIGIN }));
    const profile = out.json as ApiProfile;
    expect(profile.ownership.owner?.toLowerCase()).toBe(WALLET_A);
    expect(profile.provenance).toHaveLength(1);
    expect(profile.provenance[0].kind).toBe('mint');
    expect(profile.metadata?.name).toBe('CHOG #777');
    expect(profile.metadata?.traits?.map(t => t.trait_type)).toEqual(['Type', 'Mood']);
  });

  it('a mined signed transferFrom moves ownership to B on the mock chain', async () => {
    const tx = buildTransferFromTx();
    const send = await mockFetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [tx.raw] }),
    });
    const body = (await send.json()) as { result?: string; error?: { message: string } };
    expect(body.error).toBeUndefined();
    expect(body.result).toBe(tx.hash);
    expect(mockState.lastSender?.toLowerCase()).toBe(WALLET_A);
    expect(mockState.owners.get(TOKEN_ID)).toBe(WALLET_B.toLowerCase());
  });

  it('A is rejected with NOT_CURRENT_OWNER for every mutation after the transfer', async () => {
    expect(await codeOf(deps, apiReq('POST', '/api/play', { tokenId: TOKEN_ID }, { origin: ORIGIN, cookies: cookiesA }))).toBe('NOT_CURRENT_OWNER');
    expect(
      await codeOf(
        deps,
        apiReq(
          'POST',
          '/api/action',
          { tokenId: TOKEN_ID, instanceId: 'whatever', choiceId: 'pass', idempotencyKey: 'after-transfer', expectedVersion: 1 },
          { origin: ORIGIN, cookies: cookiesA },
        ),
      ),
    ).toBe('NOT_CURRENT_OWNER');
    expect(
      await codeOf(deps, apiReq('POST', '/api/activation', { tokenId: TOKEN_ID }, { origin: ORIGIN, cookies: cookiesA })),
    ).toBe('NOT_CURRENT_OWNER');
  });

  it('B takes over the same chapter with stats and quota preserved, and can act', async () => {
    const act = await handleApi(deps, apiReq('POST', '/api/activation', { tokenId: TOKEN_ID }, { origin: ORIGIN, cookies: cookiesB }));
    const takeover = act.json as ApiActivationResult;
    expect(takeover.created).toBe(false);
    expect(takeover.changed).toBe(true);
    expect(takeover.characterId).toBe(characterId);
    expect(takeover.controller.toLowerCase()).toBe(WALLET_B);

    const play = await handleApi(deps, apiReq('POST', '/api/play', { tokenId: TOKEN_ID }, { origin: ORIGIN, cookies: cookiesB }));
    const playB = play.json as ApiPlayState;
    expect(playB.characterId).toBe(characterId);
    expect(playB.actionsUsed).toBe(1);
    expect(playB.version).toBe(2);
    expect(playB.stats).toEqual(statsAfterFirstAction);

    const choice = playB.encounter!.choices.find(c => c.eligible)!;
    const second = await handleApi(
      deps,
      apiReq(
        'POST',
        '/api/action',
        {
          tokenId: TOKEN_ID,
          instanceId: playB.encounter!.instanceId,
          choiceId: choice.id,
          expectedVersion: playB.version,
          idempotencyKey: `act:${playB.encounter!.instanceId}:${choice.id}`,
        },
        { origin: ORIGIN, cookies: cookiesB },
      ),
    );
    const receipt = second.json as ApiCommitReceipt;
    expect(receipt.duplicate).toBeFalsy();
    expect(receipt.actionsUsed).toBe(2);
    expect(receipt.left).toBe(1);
  });

  it('the public profile reflects B as owner, provenance shows the transfer and the quota is 2 of 3', async () => {
    const out = await handleApi(deps, apiReq('POST', '/api/profile/refresh', { tokenId: TOKEN_ID }, { origin: ORIGIN }));
    const profile = out.json as ApiProfile;
    expect(profile.ownership.owner?.toLowerCase()).toBe(WALLET_B);
    expect(profile.game?.actionsUsedToday).toBe(2);
    expect(profile.game?.controller.toLowerCase()).toBe(WALLET_B);
    expect(profile.provenance.map(p => p.kind)).toEqual(['transfer', 'mint']);
    const transfer = profile.provenance[0];
    expect(transfer.from.toLowerCase()).toBe(WALLET_A);
    expect(transfer.to.toLowerCase()).toBe(WALLET_B);
    expect(transfer.blockNumber).toBe(51);

    const read = await handleApi(deps, apiReq('GET', '/api/profile', undefined, { query: { tokenId: TOKEN_ID } }));
    const reread = read.json as ApiProfile;
    expect(reread.ownership.owner?.toLowerCase()).toBe(WALLET_B);
    expect(reread.game?.gameEventCount).toBe(2);
    expect(reread.chronicle.length).toBeGreaterThanOrEqual(3);
    expect(reread.chronicle.filter(c => c.type === 'game')).toHaveLength(2);
  });
});
