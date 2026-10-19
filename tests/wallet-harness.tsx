import { secp256k1 } from '@noble/curves/secp256k1';
import { randomBytes } from '@noble/hashes/utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildSiweMessage, parseSiweMessage, SIWE_STATEMENT, SIWE_VERSION } from '@/shared/siwe';
import { personalMessageHash, recoverSigner } from '../server/auth/crypto';

export const SIGN_ADDRESS = '0x4a62316623ad457f02cdc5d997ded67a383ec569';
export const PRIV = new Uint8Array(32).fill(7);
export const OTHER_ACCOUNT = '0x2222222222222222222222222222222222222222';
export const ALLOWED_WALLET_METHODS = new Set(['eth_requestAccounts', 'personal_sign', 'eth_chainId']);

export function signPersonal(message: string): string {
  const sig = secp256k1.sign(personalMessageHash(message), PRIV);
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  return `0x${r}${s}${(27 + (sig.recovery ?? 0)).toString(16)}`;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export interface FakeProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on(event: string, cb: (...args: unknown[]) => void): void;
  removeListener(event: string, cb: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  methods: string[];
  rejectNextSign: boolean;
  chainHex: string;
  accounts: string[];
  switchBehavior: 'ok' | 'ignore' | 'reject' | 'unknown-chain';
  addBehavior: 'ok' | 'reject';
  switchCalls: { chainId: string }[];
  addCalls: Record<string, unknown>[];
  setRequestAccountsDelay(ms: number): void;
}

export interface MakeProviderOptions {
  accounts?: string[];
  chainHex?: string;
  switchBehavior?: FakeProvider['switchBehavior'];
  addBehavior?: FakeProvider['addBehavior'];
}

export function makeProvider(opts: MakeProviderOptions = {}): FakeProvider {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  let requestAccountsDelay = 0;
  const provider: FakeProvider = {
    methods: [],
    rejectNextSign: false,
    chainHex: opts.chainHex ?? '0x8f',
    accounts: opts.accounts ?? [SIGN_ADDRESS],
    switchBehavior: opts.switchBehavior ?? 'ok',
    addBehavior: opts.addBehavior ?? 'ok',
    switchCalls: [],
    addCalls: [],
    setRequestAccountsDelay(ms: number) {
      requestAccountsDelay = ms;
    },
    async request({ method, params }) {
      provider.methods.push(method);
      if (method === 'eth_requestAccounts') {
        if (requestAccountsDelay > 0) await new Promise(r => setTimeout(r, requestAccountsDelay));
        return provider.accounts;
      }
      if (method === 'eth_chainId') return provider.chainHex;
      if (method === 'personal_sign') {
        if (provider.rejectNextSign) {
          provider.rejectNextSign = false;
          throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        }
        const [hex] = params as [string];
        const message = Buffer.from(hex.slice(2), 'hex').toString('utf8');
        return signPersonal(message);
      }
      if (method === 'wallet_switchEthereumChain') {
        const [{ chainId }] = params as [{ chainId: string }];
        provider.switchCalls.push({ chainId });
        if (provider.switchBehavior === 'reject') {
          throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        }
        if (provider.switchBehavior === 'unknown-chain') {
          throw Object.assign(new Error('Unrecognized chain ID.'), { code: 4902 });
        }
        if (provider.switchBehavior === 'ok') provider.chainHex = chainId.toLowerCase();
        return null;
      }
      if (method === 'wallet_addEthereumChain') {
        const [cfg] = params as [Record<string, unknown>];
        provider.addCalls.push(cfg);
        if (provider.addBehavior === 'reject') {
          throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        }
        provider.chainHex = String(cfg.chainId).toLowerCase();
        return null;
      }
      throw new Error(`Unexpected wallet method ${method}`);
    },
    on(event, cb) {
      const list = listeners.get(event) ?? [];
      list.push(cb);
      listeners.set(event, list);
    },
    removeListener(event, cb) {
      listeners.set(event, (listeners.get(event) ?? []).filter(x => x !== cb));
    },
    emit(event, ...args) {
      for (const cb of listeners.get(event) ?? []) cb(...args);
    },
  };
  return provider;
}

let announceCounter = 0;
export function announceWallet(name: string, provider: FakeProvider): string {
  announceCounter += 1;
  const uuid = `${name.toLowerCase().replace(/\W+/g, '-')}-${announceCounter}`;
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: { info: { uuid, name, icon: '', rdns: `com.example.${uuid}` }, provider },
    }),
  );
  return uuid;
}

export interface SimStats {
  nonce: number;
  verify: number;
  logout: number;
  session: number;
  health: number;
  authCalls: { url: string; credentials: RequestCredentials | undefined }[];
}

export function makeServerSim() {
  const nonces = new Map<string, { wallet: string; domain: string; uri: string; used: boolean; exp: number }>();
  const stats: SimStats = { nonce: 0, verify: 0, logout: 0, session: 0, health: 0, authCalls: [] };
  let sessionWallet: string | null = null;
  let failLogout = false;
  const setFailLogout = (v: boolean) => {
    failLogout = v;
  };

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.startsWith('/api/auth/')) stats.authCalls.push({ url, credentials: init?.credentials });

    if (url.startsWith('/api/health')) {
      stats.health += 1;
      return jsonResponse({
        ok: true,
        db: true,
        chain: { ok: true, blockNumber: 1, error: null },
        contract: '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763',
        contractName: null,
        chainId: 143,
      });
    }
    if (url === '/api/auth/session') {
      stats.session += 1;
      return jsonResponse(
        sessionWallet
          ? {
              authenticated: true,
              wallet: sessionWallet,
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
              expired: false,
              chainId: 143,
            }
          : { authenticated: false, wallet: null, expiresAt: null, expired: false, chainId: 143 },
      );
    }
    if (url === '/api/auth/nonce' && method === 'POST') {
      stats.nonce += 1;
      const body = JSON.parse(String(init?.body)) as { wallet: string; uri: string };
      if (!/^0x[0-9a-f]{40}$/.test(body.wallet)) {
        return jsonResponse({ error: { code: 'INVALID_INPUT', message: 'wallet must be a 0x address' } }, 400);
      }
      const uri = body.uri;
      const domain = new URL(uri).host;
      const nonce = Buffer.from(randomBytes(16)).toString('hex');
      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 300_000).toISOString();
      nonces.set(nonce, { wallet: body.wallet.toLowerCase(), domain, uri, used: false, exp: Date.parse(expiresAt) });
      const message = buildSiweMessage({
        domain,
        address: body.wallet,
        statement: SIWE_STATEMENT,
        uri,
        version: SIWE_VERSION,
        chainId: 143,
        nonce,
        issuedAt,
        expirationTime: expiresAt,
      });
      return jsonResponse({ message, nonce, expiresAt, domain, uri, chainId: 143 });
    }
    if (url === '/api/auth/verify' && method === 'POST') {
      stats.verify += 1;
      const body = JSON.parse(String(init?.body)) as { message: string; signature: string };
      const parsed = parseSiweMessage(body.message);
      if (!parsed) return jsonResponse({ error: { code: 'INVALID_INPUT', message: 'Message is not a valid EIP-4361 sign-in message' } }, 400);
      const row = nonces.get(parsed.nonce);
      const address = parsed.address.toLowerCase();
      if (!row || row.used || row.exp < Date.now() || row.wallet !== address || row.domain !== parsed.domain || row.uri !== parsed.uri) {
        return jsonResponse({ error: { code: 'SIGN_IN_REQUIRED', message: 'Nonce is unknown, expired or already used' } }, 401);
      }
      const recovered = recoverSigner(body.message, body.signature);
      if (!recovered || recovered !== address) {
        return jsonResponse({ error: { code: 'SIGN_IN_REQUIRED', message: 'Signature does not match the signing wallet' } }, 401);
      }
      row.used = true;
      sessionWallet = recovered;
      return jsonResponse({
        authenticated: true,
        wallet: recovered,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        expired: false,
        chainId: 143,
      });
    }
    if (url === '/api/auth/logout' && method === 'POST') {
      stats.logout += 1;
      if (failLogout) {
        return jsonResponse({ error: { code: 'STORAGE_UNAVAILABLE', message: 'Could not reach session storage' } }, 500);
      }
      sessionWallet = null;
      return jsonResponse({ authenticated: false, wallet: null, expiresAt: null, expired: false, chainId: 143 });
    }
    return jsonResponse({ error: { code: 'INVALID_INPUT', message: `Unmocked ${method} ${url}` } }, 404);
  };

  return { fetchImpl, stats, setFailLogout };
}

export async function openWalletDock(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: /^Wallet/ }));
}

export async function reachSignedState(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await openWalletDock(user);
  await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
  await user.click(await screen.findByRole('button', { name: 'Sign in' }));
  await screen.findByText('Signed in. Open a Chog to check ownership.');
}

export function storageEntries(): string[] {
  const out: string[] = [];
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i)!;
      out.push(`${key}=${store.getItem(key) ?? ''}`);
    }
  }
  return out;
}
