import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { resetWalletDiscoveryForTests } from '@/wallet/discovery';
import {
  announceWallet,
  makeProvider,
  makeServerSim,
  openWalletDock,
  SIGN_ADDRESS,
} from './wallet-harness';

describe('wallet discovery, network switching and disconnect (simulated EIP-6963 providers — not a real wallet extension)', () => {
  let sim: ReturnType<typeof makeServerSim>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    window.history.pushState({}, '', '/');
    resetWalletDiscoveryForTests();
    sim = makeServerSim();
    fetchMock.mockReset();
    fetchMock.mockImplementation(sim.fetchImpl);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    delete (window as unknown as { ethereum?: unknown }).ethereum;
    vi.unstubAllGlobals();
  });

  it('shows a picker when several wallets are installed and connects only the chosen one', async () => {
    const alpha = makeProvider();
    const beta = makeProvider({ accounts: ['0x2222222222222222222222222222222222222222'] });
    (window as unknown as { ethereum?: unknown }).ethereum = beta;
    const user = userEvent.setup();
    render(<App />);
    announceWallet('Alpha Wallet', alpha);
    announceWallet('Beta Wallet', beta);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));

    await screen.findByRole('button', { name: 'Alpha Wallet' });
    expect(screen.getAllByRole('button', { name: 'Beta Wallet' })).toHaveLength(1);
    expect(alpha.methods).not.toContain('eth_requestAccounts');
    expect(beta.methods).not.toContain('eth_requestAccounts');

    await user.click(screen.getByRole('button', { name: 'Alpha Wallet' }));
    await screen.findByText('Wallet connected. Sign in to continue.');
    expect(alpha.methods).toContain('eth_requestAccounts');
    expect(beta.methods).not.toContain('eth_requestAccounts');
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('connects immediately when only one wallet is available, without showing a picker', async () => {
    const alpha = makeProvider();
    const user = userEvent.setup();
    render(<App />);
    announceWallet('Alpha Wallet', alpha);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));

    await screen.findByText('Wallet connected. Sign in to continue.');
    expect(screen.queryByRole('button', { name: 'Alpha Wallet' })).toBeNull();
    expect(alpha.methods).toContain('eth_requestAccounts');
  });

  it('disconnect after a wrong-network error clears the error, chain state and action buttons honestly', async () => {
    const p = makeProvider({ chainHex: '0x1' });
    (window as unknown as { ethereum?: unknown }).ethereum = p;
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));

    await screen.findByText('Your wallet is on the wrong network. Switch to Monad to continue.');
    expect(screen.getByRole('button', { name: 'Switch to Monad' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    await screen.findByText('Wallet not connected');
    expect(sim.stats.logout).toBe(0);
    expect(screen.queryByText('Your wallet is on the wrong network. Switch to Monad to continue.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Switch to Monad' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Connect wallet' })).toBeInTheDocument();

    p.chainHex = '0x8f';
    await user.click(screen.getByRole('button', { name: 'Connect wallet' }));
    await screen.findByText('Wallet connected. Sign in to continue.');
  });

  it('switches to Monad on request and then completes sign-in without a separate retry', async () => {
    const p = makeProvider({ chainHex: '0x1' });
    (window as unknown as { ethereum?: unknown }).ethereum = p;
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await screen.findByText('Your wallet is on the wrong network. Switch to Monad to continue.');

    await user.click(screen.getByRole('button', { name: 'Switch to Monad' }));
    await screen.findByText('Signed in. Open a Chog to check ownership.');

    expect(p.switchCalls).toEqual([{ chainId: '0x8f' }]);
    expect(sim.stats.nonce).toBe(1);
    expect(sim.stats.verify).toBe(1);
    const switchIdx = p.methods.indexOf('wallet_switchEthereumChain');
    const signIdx = p.methods.indexOf('personal_sign');
    expect(switchIdx).toBeGreaterThanOrEqual(0);
    expect(signIdx).toBeGreaterThan(switchIdx);
  });

  it('never requests a nonce when the user rejects the network switch', async () => {
    const p = makeProvider({ chainHex: '0x1', switchBehavior: 'reject' });
    (window as unknown as { ethereum?: unknown }).ethereum = p;
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await screen.findByText('Your wallet is on the wrong network. Switch to Monad to continue.');

    await user.click(screen.getByRole('button', { name: 'Switch to Monad' }));
    await screen.findByText('Network switch was cancelled. Your wallet stays on its current network.');

    expect(sim.stats.nonce).toBe(0);
    expect(sim.stats.verify).toBe(0);
    expect(screen.getByRole('button', { name: 'Switch to Monad' })).toBeInTheDocument();
  });

  it('adds Monad mainnet through wallet_addEthereumChain when the wallet does not know the chain yet', async () => {
    const p = makeProvider({ chainHex: '0x1', switchBehavior: 'unknown-chain' });
    (window as unknown as { ethereum?: unknown }).ethereum = p;
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await screen.findByText('Your wallet is on the wrong network. Switch to Monad to continue.');

    await user.click(screen.getByRole('button', { name: 'Switch to Monad' }));
    await screen.findByText('Signed in. Open a Chog to check ownership.');

    expect(p.switchCalls).toEqual([{ chainId: '0x8f' }]);
    expect(p.addCalls).toHaveLength(1);
    expect(p.addCalls[0]).toMatchObject({
      chainId: '0x8f',
      chainName: 'Monad Mainnet',
      rpcUrls: ['https://rpc.monad.xyz'],
      blockExplorerUrls: ['https://monadvision.com'],
      nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
    });
    expect(sim.stats.nonce).toBe(1);
    expect(sim.stats.verify).toBe(1);
  });

  it('falls back to manual instructions when the wallet claims success but stays on the old chain', async () => {
    const p = makeProvider({ chainHex: '0x1', switchBehavior: 'ignore' });
    (window as unknown as { ethereum?: unknown }).ethereum = p;
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await screen.findByText('Your wallet is on the wrong network. Switch to Monad to continue.');

    await user.click(screen.getByRole('button', { name: 'Switch to Monad' }));
    await screen.findByText(/Your wallet is still on chain 1\. Switch it to Monad \(chain 143\)/);

    expect(sim.stats.nonce).toBe(0);
    expect(sim.stats.verify).toBe(0);
    expect(screen.getByRole('button', { name: 'Switch to Monad' })).toBeInTheDocument();
  });

  it('aborts sign-in if the wallet network changes after the nonce is issued', async () => {
    const p = makeProvider();
    (window as unknown as { ethereum?: unknown }).ethereum = p;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await sim.fetchImpl(input, init);
      if (String(input).startsWith('/api/auth/nonce')) p.chainHex = '0x1';
      return res;
    });
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    await screen.findByText(/Your wallet switched networks while signing in \(now chain 1\)/);
    expect(p.methods).not.toContain('personal_sign');
    expect(sim.stats.nonce).toBe(1);
    expect(sim.stats.verify).toBe(0);
  });

  it('a signature that resolves after Cancel cannot create a session', async () => {
    const p = makeProvider();
    (window as unknown as { ethereum?: unknown }).ethereum = p;
    const orig = p.request.bind(p);
    let releaseSign: ((sig: string) => void) | undefined;
    p.request = (args: { method: string; params?: unknown[] | object }) => {
      if (args.method === 'personal_sign') {
        return new Promise(resolve => {
          releaseSign = (sig: string) => resolve(sig);
        });
      }
      return orig(args);
    };
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    await screen.findByText('Waiting for your signature…');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByText('Signature cancelled. You’re viewing read-only.');

    act(() => {
      releaseSign?.(`0x${'ab'.repeat(65)}`);
    });
    await new Promise(r => setTimeout(r, 0));

    expect(sim.stats.verify).toBe(0);
    expect(screen.queryByText('Signed in. Open a Chog to check ownership.')).toBeNull();
    expect(screen.getByText('Signature cancelled. You’re viewing read-only.')).toBeInTheDocument();
  });

  it('after disconnect, wallet events cannot silently reconnect the app', async () => {
    const p = makeProvider();
    (window as unknown as { ethereum?: unknown }).ethereum = p;
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    await screen.findByText('Signed in. Open a Chog to check ownership.');

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByText('Wallet not connected');

    act(() => {
      p.emit('accountsChanged', [SIGN_ADDRESS]);
      p.emit('chainChanged', '0x8f');
    });
    await new Promise(r => setTimeout(r, 0));

    expect(screen.getByText('Wallet not connected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Connect wallet' }));
    await screen.findByText('Wallet connected. Sign in to continue.');
  });

  it('reports honestly when the server session cannot be cleared on logout', async () => {
    const p = makeProvider();
    (window as unknown as { ethereum?: unknown }).ethereum = p;
    const user = userEvent.setup();
    render(<App />);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    await screen.findByText('Signed in. Open a Chog to check ownership.');

    sim.setFailLogout(true);
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await screen.findByText('Signed out on this device, but the server session could not be cleared. It expires on its own.');
    expect(screen.getByText('Wallet not connected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('reconnecting after disconnect lets the user choose a different wallet', async () => {
    const alpha = makeProvider();
    const beta = makeProvider({ accounts: ['0x2222222222222222222222222222222222222222'] });
    const user = userEvent.setup();
    render(<App />);
    announceWallet('Alpha Wallet', alpha);
    announceWallet('Beta Wallet', beta);
    await openWalletDock(user);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Alpha Wallet' }));
    await screen.findByText('Wallet connected. Sign in to continue.');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Signed in. Open a Chog to check ownership.');
    const alphaConnectsBeforeDisconnect = alpha.methods.filter(m => m === 'eth_requestAccounts').length;

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByText('Wallet not connected');

    await user.click(screen.getByRole('button', { name: 'Connect wallet' }));
    await user.click(await screen.findByRole('button', { name: 'Beta Wallet' }));
    await screen.findByText('Wallet connected. Sign in to continue.');

    expect(beta.methods).toContain('eth_requestAccounts');
    expect(alpha.methods.filter(m => m === 'eth_requestAccounts')).toHaveLength(alphaConnectsBeforeDisconnect);
  });
});
