import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { parseSiweMessage, SIWE_STATEMENT } from '@/shared/siwe';
import { recoverSigner } from '../server/auth/crypto';
import {
  ALLOWED_WALLET_METHODS,
  makeProvider,
  makeServerSim,
  openWalletDock,
  OTHER_ACCOUNT,
  reachSignedState,
  SIGN_ADDRESS,
  storageEntries,
  type FakeProvider,
} from './wallet-harness';

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
    expect(provider.methods).not.toContain('wallet_switchEthereumChain');

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

  it('refuses to sign in on the wrong chain before requesting a nonce and offers the switch flow', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    provider.chainHex = '0x1';
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    await screen.findByText(/Your wallet is on chain 1\. Switch it to Monad \(chain 143\)/);
    expect(screen.getByText('Your wallet is on the wrong network. Switch to Monad to continue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to Monad' })).toBeInTheDocument();
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
