import type { ReadDeps } from '../game/profile';
import { listChronicle, readProfile, refreshProfile } from '../game/profile';
import {
  activateTx,
  commitActionTx,
  findCharacterByIdentity,
  getPlayState,
  setIntentionTx,
  syncOwnershipTx,
  type Identity,
} from '../game/service';
import { AppError, type ErrorCode } from '../../src/server/errors';
import { buildEncounterView } from '../../src/shared/rules';
import type {
  ApiActivationResult,
  ApiHealth,
  ApiIntentionResult,
  ApiNonceResponse,
  ApiPlayState,
  ApiSessionInfo,
} from '../../src/shared/apiTypes';
import { isAllowedAppOrigin } from '../../src/shared/siwe';
import { chainName } from '../chain/adapter';
import { issueNonce, verifySignIn } from '../auth/siwe';
import {
  SESSION_COOKIE,
  buildClearCookie,
  buildSessionCookie,
  createSession,
  resolveSession,
  revokeSession,
  type AuthSession,
} from '../auth/session';

export type ApiDeps = ReadDeps;

export interface ApiRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: { get(name: string): string | null };
  cookies: Record<string, string>;
  ip: string;
}

export interface ApiResponse {
  status: number;
  json: unknown;
  setCookie?: string;
}

export const STATUS_BY_ERROR: Record<ErrorCode, number> = {
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
  ORIGIN_DENIED: 403,
};

const AUTH_WINDOW_MS = 5_000;

let contractNameCache: { name: string | null; at: number } | null = null;

async function ensureContractName(deps: ApiDeps): Promise<string | null> {
  if (contractNameCache && Date.now() - contractNameCache.at < 3_600_000) return contractNameCache.name;
  const name = await chainName(deps.config.mainnetRpcUrl, deps.config.chogContract);
  contractNameCache = { name, at: Date.now() };
  return name;
}

function readTokenId(src: URLSearchParams | Record<string, unknown>): string {
  const raw = src instanceof URLSearchParams ? src.get('tokenId') ?? '' : typeof src.tokenId === 'string' ? src.tokenId : '';
  if (!/^\d{1,10}$/.test(raw)) throw new AppError('INVALID_INPUT', 'tokenId must be an unsigned integer string');
  return raw;
}

function parseIdentity(deps: ApiDeps, src: URLSearchParams | Record<string, unknown>): Identity {
  const get = (k: string): string | undefined =>
    src instanceof URLSearchParams ? src.get(k) ?? undefined : typeof src[k] === 'string' ? (src[k] as string) : undefined;
  const tokenId = readTokenId(src);
  const namespace = get('namespace') ?? deps.config.identityNamespace;
  if (!/^[a-z0-9-]{1,64}$/.test(namespace)) throw new AppError('INVALID_INPUT', 'namespace is malformed');
  const chainRaw = get('chainId');
  let chainId: number;
  if (chainRaw === undefined || chainRaw === '') {
    chainId = deps.config.mainnetChainId;
  } else {
    chainId = Number(chainRaw);
    if (!Number.isInteger(chainId) || chainId <= 0) throw new AppError('INVALID_INPUT', 'chainId must be a positive integer');
  }
  const contractRaw = (get('contract') ?? deps.config.chogContract).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(contractRaw)) throw new AppError('INVALID_INPUT', 'contract must be a 0x address');
  return { namespace, chainId, contract: contractRaw, tokenId };
}

function pinnedIdentity(deps: ApiDeps, tokenId: string): Identity {
  return {
    namespace: deps.config.identityNamespace,
    chainId: deps.config.mainnetChainId,
    contract: deps.config.chogContract,
    tokenId,
  };
}

function requireOrigin(deps: ApiDeps, req: ApiRequest): void {
  const origin = req.headers.get('origin');
  const allowed = origin && isAllowedAppOrigin(origin, deps.config.appOrigin, {
    allowLocalhost: !deps.config.production,
  });
  if (!allowed) {
    throw new AppError(
      'ORIGIN_DENIED',
      `This write must come from the app origin (${deps.config.appOrigin}). Missing or disallowed Origin header.`,
    );
  }
}

function allowOriginIfPresent(deps: ApiDeps, req: ApiRequest): void {
  const origin = req.headers.get('origin');
  if (origin && !isAllowedAppOrigin(origin, deps.config.appOrigin, {
    allowLocalhost: !deps.config.production,
  })) {
    throw new AppError(
      'ORIGIN_DENIED',
      `This write must come from the app origin (${deps.config.appOrigin}). The request Origin is not allowed.`,
    );
  }
}

async function requireSession(deps: ApiDeps, req: ApiRequest): Promise<AuthSession> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) {
    throw new AppError('SIGN_IN_REQUIRED', 'Sign in with your wallet to perform this action. No action was used.');
  }
  const session = await resolveSession(deps.pool, deps.config, token, deps.now());
  if (!session) {
    throw new AppError('SIGN_IN_REQUIRED', 'Your session expired. Sign in again. No action was used.');
  }
  return session;
}

interface OwnerAuth {
  block: number;
  atMs: number;
}

async function authorizeOwner(deps: ApiDeps, identity: Identity, wallet: string): Promise<OwnerAuth> {
  const health = await deps.chain.getHealth();
  if (!health.ok || health.blockNumber === null) {
    throw new AppError('CHAIN_UNAVAILABLE', health.error ?? 'Chain unreachable; ownership cannot be verified');
  }
  const res = await deps.chain.ownerOf(identity.tokenId);
  if (res.owner.toLowerCase() !== wallet.toLowerCase()) throw new AppError('NOT_CURRENT_OWNER');
  return { block: res.blockNumber, atMs: Date.now() };
}

async function reverifyOwner(deps: ApiDeps, identity: Identity, wallet: string, auth: OwnerAuth): Promise<void> {
  if (Date.now() - auth.atMs <= AUTH_WINDOW_MS) return;
  const res = await deps.chain.ownerOf(identity.tokenId);
  if (res.owner.toLowerCase() !== wallet.toLowerCase()) throw new AppError('NOT_CURRENT_OWNER');
  auth.block = res.blockNumber;
  auth.atMs = Date.now();
}

async function syncToVerifiedOwner(
  deps: ApiDeps,
  identity: Identity,
  wallet: string,
  verificationBlock: number | null,
): Promise<string> {
  const character = await findCharacterByIdentity(deps.pool, identity);
  if (!character) {
    throw new AppError('INVALID_INPUT', 'This Chog has not been activated yet. Activate it first.');
  }
  if (!character.active_epoch_id) throw new AppError('STORAGE_UNAVAILABLE', 'Character has no active ownership epoch');
  const { rows } = await deps.pool.query<{ controller_wallet: string }>(
    'SELECT controller_wallet FROM ownership_epochs WHERE id = $1',
    [character.active_epoch_id],
  );
  const controller = rows[0]?.controller_wallet.toLowerCase() ?? '';
  if (controller === wallet.toLowerCase()) return character.id;
  await syncOwnershipTx(deps.pool, identity, wallet, verificationBlock, deps.now());
  return character.id;
}

async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError && e.code === 'CHAIN_UNAVAILABLE') return fn();
    throw e;
  }
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new AppError('INVALID_INPUT', 'JSON object body required');
  return body as Record<string, unknown>;
}

function str(body: Record<string, unknown>, key: string, maxLen = 512): string {
  const v = body[key];
  if (typeof v !== 'string' || v.length === 0 || v.length > maxLen) throw new AppError('INVALID_INPUT', `${key} must be a non-empty string`);
  return v;
}

function enumStr<T extends string>(v: string, allowed: readonly T[], key: string): T {
  if (!(allowed as readonly string[]).includes(v)) {
    throw new AppError('INVALID_INPUT', `${key} must be one of: ${allowed.join(', ')}`);
  }
  return v as T;
}

function nonNegInt(body: Record<string, unknown>, key: string): number {
  const v = body[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new AppError('INVALID_INPUT', `${key} must be a non-negative integer`);
  }
  return v;
}

function sessionJson(deps: ApiDeps, session: AuthSession | null, expired: boolean): ApiSessionInfo {
  return {
    authenticated: session !== null,
    wallet: session ? session.wallet : null,
    expiresAt: session ? session.expiresAt.toISOString() : null,
    expired,
    chainId: deps.config.mainnetChainId,
  };
}

export async function handleApi(deps: ApiDeps, req: ApiRequest): Promise<ApiResponse> {
  const { method, path, query } = req;

  if (method === 'GET' && path === '/api/health') {
    const [dbOk, chain] = await Promise.all([
      deps.pool.query('SELECT 1').then(() => true).catch(() => false),
      deps.chain.getHealth(),
    ]);
    const health: ApiHealth = {
      ok: dbOk && chain.ok,
      db: dbOk,
      chain,
      contract: deps.config.chogContract,
      contractName: await ensureContractName(deps).catch(() => null),
      chainId: deps.config.mainnetChainId,
    };
    return { status: dbOk ? 200 : 503, json: health };
  }

  if (method === 'POST' && path === '/api/auth/nonce') {
    requireOrigin(deps, req);
    const body = asObject(req.body);
    const wallet = str(body, 'wallet', 128).toLowerCase();
    const uri = typeof body.uri === 'string' && body.uri.length > 0 ? str(body, 'uri', 256) : undefined;
    const issued = await issueNonce(deps.pool, deps.config, { wallet, uri, now: deps.now() });
    const json: ApiNonceResponse = issued;
    return { status: 200, json };
  }

  if (method === 'POST' && path === '/api/auth/verify') {
    requireOrigin(deps, req);
    const body = asObject(req.body);
    const message = str(body, 'message', 4096);
    const signature = str(body, 'signature', 132);
    const wallet = await verifySignIn(deps.pool, deps.config, { message, signature }, deps.now());
    const { token, expiresAt } = await createSession(deps.pool, deps.config, wallet, deps.now());
    const json = sessionJson(deps, { wallet, expiresAt }, false);
    return { status: 200, json, setCookie: buildSessionCookie(token, expiresAt, deps.config.appOrigin) };
  }

  if (method === 'GET' && path === '/api/auth/session') {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return { status: 200, json: sessionJson(deps, null, false) };
    const session = await resolveSession(deps.pool, deps.config, token, deps.now());
    return { status: 200, json: session ? sessionJson(deps, session, false) : sessionJson(deps, null, true) };
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) throw new AppError('SIGN_IN_REQUIRED', 'No session to log out of.');
    const session = await resolveSession(deps.pool, deps.config, token, deps.now());
    if (!session) throw new AppError('SIGN_IN_REQUIRED', 'Your session expired. Sign in again.');
    requireOrigin(deps, req);
    await revokeSession(deps.pool, deps.config, token, deps.now());
    return {
      status: 200,
      json: sessionJson(deps, null, false),
      setCookie: buildClearCookie(deps.config.appOrigin),
    };
  }

  if (method === 'GET' && path === '/api/profile') {
    const identity = parseIdentity(deps, query);
    let profile = await readProfile(deps, identity);
    if (profile.metadata === null) {
      try {
        profile = await refreshProfile(deps, identity, {
          metadataTimeoutMs: 5_000,
          metadataCycles: 1,
          syncHistory: false,
        });
      } catch {
        profile = await readProfile(deps, identity);
      }
    }
    return { status: 200, json: profile };
  }

  if (method === 'POST' && path === '/api/profile/refresh') {
    allowOriginIfPresent(deps, req);
    const identity = parseIdentity(deps, asObject(req.body));
    return { status: 200, json: await refreshProfile(deps, identity) };
  }

  if (method === 'GET' && path === '/api/chronicle') {
    const identity = parseIdentity(deps, query);
    const gameCursorRaw = query.get('gameCursor');
    const limitRaw = query.get('limit');
    const page = await listChronicle(deps, identity, {
      gameCursor: gameCursorRaw ? Number(gameCursorRaw) : null,
      provCursor: query.get('provCursor'),
      limit: limitRaw ? Number(limitRaw) : undefined,
    });
    return { status: 200, json: page };
  }

  if (method === 'POST' && path === '/api/activation') {
    const session = await requireSession(deps, req);
    requireOrigin(deps, req);
    const body = asObject(req.body);
    const identity = pinnedIdentity(deps, readTokenId(body));
    const result = await withAuthRetry(async () => {
      const auth = await authorizeOwner(deps, identity, session.wallet);
      await reverifyOwner(deps, identity, session.wallet, auth);
      return activateTx(deps.pool, identity, session.wallet, auth.block, deps.now());
    });
    const json: ApiActivationResult = result;
    return { status: 200, json };
  }

  if (method === 'POST' && path === '/api/intention') {
    const session = await requireSession(deps, req);
    requireOrigin(deps, req);
    const body = asObject(req.body);
    const identity = pinnedIdentity(deps, readTokenId(body));
    const intention = enumStr(str(body, 'intention', 16), ['embrace', 'redeem'] as const, 'intention');
    const json = await withAuthRetry(async () => {
      const auth = await authorizeOwner(deps, identity, session.wallet);
      const characterId = await syncToVerifiedOwner(deps, identity, session.wallet, auth.block);
      await reverifyOwner(deps, identity, session.wallet, auth);
      const result = await setIntentionTx(deps.pool, characterId, session.wallet, intention, auth.block, deps.now());
      const out: ApiIntentionResult = result;
      return out;
    });
    return { status: 200, json };
  }

  if (method === 'POST' && path === '/api/play') {
    const session = await requireSession(deps, req);
    requireOrigin(deps, req);
    const body = asObject(req.body);
    const identity = pinnedIdentity(deps, readTokenId(body));
    const json = await withAuthRetry(async (): Promise<ApiPlayState> => {
      const auth = await authorizeOwner(deps, identity, session.wallet);
      const characterId = await syncToVerifiedOwner(deps, identity, session.wallet, auth.block);
      await reverifyOwner(deps, identity, session.wallet, auth);
      const state = await getPlayState(deps.pool, characterId, session.wallet, deps.now());
      const enc = state.encounter;
      return {
        characterId,
        controller: session.wallet,
        stats: state.stats,
        title: state.title,
        version: state.version,
        actionsUsed: state.actionsUsed,
        nextResetUtc: state.nextResetUtc,
        intention: state.intention,
        epochId: state.epochId,
        encounter: enc ? buildEncounterView(enc.templateId, enc.instanceId, state.stats) : null,
      };
    });
    return { status: 200, json };
  }

  if (method === 'POST' && path === '/api/action') {
    const session = await requireSession(deps, req);
    requireOrigin(deps, req);
    const body = asObject(req.body);
    const identity = pinnedIdentity(deps, readTokenId(body));
    const instanceId = str(body, 'instanceId', 96);
    const choiceId = str(body, 'choiceId', 64);
    const idempotencyKey = str(body, 'idempotencyKey', 128);
    if (idempotencyKey.length < 8) throw new AppError('INVALID_INPUT', 'idempotencyKey must be at least 8 characters');
    const expectedVersion = nonNegInt(body, 'expectedVersion');
    const receipt = await withAuthRetry(async () => {
      const auth = await authorizeOwner(deps, identity, session.wallet);
      const characterId = await syncToVerifiedOwner(deps, identity, session.wallet, auth.block);
      await reverifyOwner(deps, identity, session.wallet, auth);
      return commitActionTx(
        deps.pool,
        {
          characterId,
          controller: session.wallet,
          instanceId,
          choiceId,
          expectedVersion,
          idempotencyKey,
          verificationBlock: auth.block,
          now: deps.now(),
        },
        { onLocked: () => reverifyOwner(deps, identity, session.wallet, auth) },
      );
    });
    return { status: 200, json: receipt };
  }

  throw new AppError('INVALID_INPUT', `No route for ${method} ${path}`);
}
