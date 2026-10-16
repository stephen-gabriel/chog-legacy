import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { secp256k1 } from '@noble/curves/secp256k1';
import { randomBytes } from '@noble/hashes/utils';
import App from '@/App';
import { buildSiweMessage, parseSiweMessage, SIWE_STATEMENT, SIWE_VERSION } from '@/shared/siwe';
import { personalMessageHash, recoverSigner } from '../server/auth/crypto';

const SIGN_ADDRESS = '0x4a62316623ad457f02cdc5d997ded67a383ec569';
const PRIV = new Uint8Array(32).fill(7);
const OTHER_ACCOUNT = '0x2222222222222222222222222222222222222222';
const ALLOWED_WALLET_METHODS = new Set(['eth_requestAccounts', 'personal_sign', 'eth_chainId']);

function signPersonal(message: string): string {
  const sig = secp256k1.sign(personalMessageHash(message), PRIV);
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  return `0x${r}${s}${(27 + (sig.recovery ?? 0)).toString(16)}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface FakeProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on(event: string, cb: (...args: unknown[]) => void): void;
  removeListener(event: string, cb: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
  methods: string[];
  rejectNextSign: boolean;
  chainHex: string;
}

function makeProvider(): FakeProvider {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const provider: FakeProvider = {
    methods: [],
    rejectNextSign: false,
    chainHex: '0x8f',
    async request({ method, params }) {
      provider.methods.push(method);
      if (method === 'eth_requestAccounts') return [SIGN_ADDRESS];
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

interface SimStats {
  nonce: number;
  verify: number;
  logout: number;
  session: number;
  health: number;
  authCalls: { url: string; credentials: RequestCredentials | undefined }[];
}

function makeServerSim() {
  const nonces = new Map<string, { wallet: string; domain: string; uri: string; used: boolean; exp: number }>();
  const stats: SimStats = { nonce: 0, verify: 0, logout: 0, session: 0, health: 0, authCalls: [] };
  let sessionWallet: string | null = null;

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
      const signer = recoverSigner(body.message, body.signature);
      if (!signer || signer !== address) {
        return jsonResponse({ error: { code: 'SIGN_IN_REQUIRED', message: 'Signature does not match the signing wallet' } }, 401);
      }
      row.used = true;
      sessionWallet = signer;
      return jsonResponse({
        authenticated: true,
        wallet: signer,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        expired: false,
        chainId: 143,
      });
    }
    if (url === '/api/auth/logout' && method === 'POST') {
      stats.logout += 1;
      sessionWallet = null;
      return jsonResponse({ authenticated: false, wallet: null, expiresAt: null, expired: false, chainId: 143 });
    }
    return jsonResponse({ error: { code: 'INVALID_INPUT', message: `Unmocked ${method} ${url}` } }, 404);
  };

  return { fetchImpl, stats };
}

async function openWalletDock(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: /^Wallet/ }));
}

async function reachSignedState(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await openWalletDock(user);
  await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
  await user.click(await screen.findByRole('button', { name: 'Sign in' }));
  await screen.findByText('Signed in. Open a Chog to check ownership.');
}

function storageEntries(): string[] {
  const out: string[] = [];
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i)!;
      out.push(`${key}=${store.getItem(key) ?? ''}`);
    }
  }
  return out;
}

describe('SIWE sign-in flow with a mocked wallet', () => {
  let provider: FakeProvider;
  let sim: ReturnType<typeof makeServerSim>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    window.history.pushState({}, '', '/');
    provider = makeProvider();
    sim = makeServerSim();
    fetchMock.mockReset();
    fetchMock.mockImplementation(sim.fetchImpl);
    vi.stubGlobal('fetch', fetchMock);
    (window as unknown as { ethereum?: unknown }).ethereum = provider;
  });

  afterEach(() => {
    delete (window as unknown as { ethereum?: unknown }).ethereum;
    vi.unstubAllGlobals();
  });

  it('signs in end to end using only allowlisted wallet methods and stores no credentials client-side', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachSignedState(user);

    expect((await screen.findAllByText('Signed in')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();

    for (const method of provider.methods) {
      expect(ALLOWED_WALLET_METHODS.has(method)).toBe(true);
    }
    expect(provider.methods).toContain('eth_requestAccounts');
    expect(provider.methods).toContain('personal_sign');
    expect(provider.methods).toContain('eth_chainId');
    expect(provider.methods).not.toContain('eth_sendTransaction');
    expect(provider.methods).not.toContain('eth_sign');
    expect(provider.methods).not.toContain('eth_signTypedData_v4');
    expect(provider.methods).not.toContain('wallet_watchAsset');
    expect(provider.methods).not.toContain('wallet_addEthereumChain');

    expect(sim.stats.nonce).toBe(1);
    expect(sim.stats.verify).toBe(1);
    expect(sim.stats.authCalls.every(c => c.credentials === 'include')).toBe(true);

    expect(storageEntries()).toHaveLength(0);
  });

  it('the signed message is a gasless SIWE message bound to this app, chain and wallet', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachSignedState(user);

    const verifyCall = fetchMock.mock.calls.find(([u]) => u === '/api/auth/verify') as [string, RequestInit] | undefined;
    expect(verifyCall).toBeDefined();
    const body = JSON.parse(String(verifyCall![1].body)) as { message: string; signature: string };
    const parsed = parseSiweMessage(body.message)!;
    expect(parsed.chainId).toBe(143);
    expect(parsed.address.toLowerCase()).toBe(SIGN_ADDRESS);
    expect(parsed.uri).toBe(window.location.origin);
    expect(parsed.domain).toBe(new URL(window.location.origin).host);
    expect(parsed.statement).toBe(SIWE_STATEMENT);
    expect(body.message).toContain('This free message proves wallet ownership for authentication only');
    expect(body.message).toContain('It is not a transaction, approval or transfer.');
    expect(recoverSigner(body.message, body.signature)).toBe(SIGN_ADDRESS);
    const flippedV = body.signature.toLowerCase().endsWith('1b') ? '1c' : '1b';
    expect(recoverSigner(body.message, `${body.signature.slice(0, -2)}${flippedV}`)).not.toBe(SIGN_ADDRESS);
  });

  it('handles wallet rejection without requesting a session or leaving read-only', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    provider.rejectNextSign = true;
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    await screen.findByText('Signature cancelled. You’re viewing read-only.');
    expect(screen.getByText('Signature cancelled. You stay read-only; nothing was signed or sent.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(sim.stats.verify).toBe(0);
    expect(storageEntries()).toHaveLength(0);
  });

  it('refuses to sign in on the wrong chain before requesting a nonce', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    provider.chainHex = '0x1';
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    await screen.findByText(/Your wallet is on chain 1\. Switch it to Monad \(chain 143\)/);
    expect(screen.getByText('Switch your wallet to the app’s network, then retry sign-in.')).toBeInTheDocument();
    expect(sim.stats.nonce).toBe(0);
    expect(sim.stats.verify).toBe(0);
    expect(provider.methods).not.toContain('personal_sign');
  });

  it('treats an account switch as requiring a fresh sign-in', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachSignedState(user);

    provider.emit('accountsChanged', [OTHER_ACCOUNT]);
    await screen.findByText('Your wallet account changed. Sign in again.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(sim.stats.session).toBeGreaterThanOrEqual(1);
  });

  it('logs out by revoking the session server-side', async () => {
    const user = userEvent.setup();
    render(<App />);
    await reachSignedState(user);

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByText('Wallet not connected');
    expect(sim.stats.logout).toBe(1);
    expect(screen.getByRole('button', { name: 'Connect wallet' })).toBeInTheDocument();
  });
});
