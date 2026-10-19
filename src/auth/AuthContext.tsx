import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ApiSessionInfo } from '@/shared/apiTypes';
import type { Viewer } from '@/ui/types';
import {
  chainIdToHex,
  connectAccounts,
  getWalletChainId,
  isRejection,
  MONAD_MAINNET_ADD_CHAIN_PARAMS,
  MONAD_MAINNET_CHAIN_ID,
  onAccountsChanged,
  onChainChanged,
  personalSign,
  switchChain,
  WalletError,
  type WalletProvider,
} from '@/wallet/ethereum';
import { subscribeWallets, type DiscoveredWallet } from '@/wallet/discovery';
import { ApiCallError, getHealth, getNonce, getSession, postLogout, postVerify } from './authApi';

export type SignInPhase = 'idle' | 'awaiting' | 'cancelled';

export interface WalletChoice {
  uuid: string;
  name: string;
  icon: string;
}

export interface AuthController {
  provider: WalletProvider | null;
  address: string | null;
  session: ApiSessionInfo | null;
  phase: SignInPhase;
  notice: string | null;
  appChainId: number | null;
  wrongNetwork: boolean;
  viewer: Viewer;
  wallets: WalletChoice[];
  pickerOpen: boolean;
  connect(): Promise<void>;
  pickWallet(uuid: string): Promise<void>;
  closePicker(): void;
  signIn(): Promise<void>;
  switchNetwork(): Promise<void>;
  cancelSignIn(): void;
  disconnect(): Promise<void>;
  refresh(): Promise<void>;
  clearNotice(): void;
}

const AuthContext = createContext<AuthController | null>(null);

function hexToNumber(hex: string | null): number | null {
  if (!hex) return null;
  const n = Number(hex);
  return Number.isFinite(n) ? n : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [selected, setSelected] = useState<DiscoveredWallet | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [session, setSession] = useState<ApiSessionInfo | null>(null);
  const [phase, setPhase] = useState<SignInPhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [appChainId, setAppChainId] = useState<number | null>(null);
  const [walletChain, setWalletChain] = useState<string | null>(null);
  const phaseRef = useRef<SignInPhase>('idle');
  const cancelledRef = useRef(false);
  const genRef = useRef(0);

  const setPhaseSafe = useCallback((p: SignInPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  useEffect(() => subscribeWallets(setWallets), []);

  useEffect(() => {
    let alive = true;
    void getSession()
      .then(info => {
        if (alive) setSession(info);
      })
      .catch(() => undefined);
    void getHealth()
      .then(h => {
        if (alive) setAppChainId(h.chainId);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const p = selected?.provider;
    if (!p) return;
    const offAccounts = onAccountsChanged(p, accounts => {
      const next = accounts[0]?.toLowerCase() ?? null;
      setAddress(next);
      if (!next) setWalletChain(null);
      if (phaseRef.current === 'awaiting') cancelledRef.current = true;
    });
    const offChain = onChainChanged(p, chain => setWalletChain(chain));
    return () => {
      offAccounts();
      offChain();
    };
  }, [selected]);

  const refresh = useCallback(async () => {
    try {
      setSession(await getSession());
    } catch {
      setSession(null);
    }
  }, []);

  const connectWallet = useCallback(async (w: DiscoveredWallet, gen: number) => {
    setPickerOpen(false);
    setSelected(w);
    try {
      const accounts = await connectAccounts(w.provider);
      if (gen !== genRef.current) return;
      setAddress(accounts[0]?.toLowerCase() ?? null);
      const chain = await getWalletChainId(w.provider);
      if (gen !== genRef.current) return;
      setWalletChain(chain);
      setNotice(null);
    } catch (e) {
      if (gen !== genRef.current) return;
      if (isRejection(e)) setNotice('Wallet connection was cancelled.');
      else setNotice(e instanceof Error ? e.message : 'The wallet could not connect.');
    }
  }, []);

  const connect = useCallback(async () => {
    const gen = ++genRef.current;
    if (wallets.length === 0) {
      setNotice('No compatible wallet was detected in this browser. Install a wallet extension, then reload. Practice mode needs no wallet.');
      return;
    }
    if (wallets.length > 1) {
      setPickerOpen(true);
      return;
    }
    await connectWallet(wallets[0], gen);
  }, [wallets, connectWallet]);

  const pickWallet = useCallback(
    async (uuid: string) => {
      const w = wallets.find(x => x.info.uuid === uuid);
      if (!w) return;
      const gen = ++genRef.current;
      await connectWallet(w, gen);
    },
    [wallets, connectWallet],
  );

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const signIn = useCallback(async () => {
    if (phaseRef.current === 'awaiting') return;
    const p = selected?.provider;
    if (!p) {
      setNotice('No compatible wallet was detected. Practice mode needs no wallet.');
      return;
    }
    const gen = ++genRef.current;
    cancelledRef.current = false;
    setPhaseSafe('awaiting');
    setNotice(null);
    try {
      const accounts = await connectAccounts(p);
      if (gen !== genRef.current) return;
      const wallet = accounts[0]?.toLowerCase();
      if (!wallet) {
        setPhaseSafe('idle');
        setNotice('The wallet reported no accounts.');
        return;
      }
      setAddress(wallet);
      const chain = await getWalletChainId(p);
      if (gen !== genRef.current) return;
      setWalletChain(chain);
      const chainNum = hexToNumber(chain);
      let knownChain = appChainId;
      if (knownChain === null) {
        try {
          knownChain = (await getHealth()).chainId;
          if (gen !== genRef.current) return;
          setAppChainId(knownChain);
        } catch {
          if (gen !== genRef.current) return;
          setPhaseSafe('idle');
          setNotice('Could not confirm which network this app uses, so signing in is blocked. Try again in a moment.');
          return;
        }
      }
      if (chainNum === null) {
        setPhaseSafe('idle');
        setNotice('The wallet did not report its network, so signing in is blocked. Try reconnecting.');
        return;
      }
      if (chainNum !== knownChain) {
        setPhaseSafe('idle');
        setNotice(`Your wallet is on chain ${chainNum}. Switch it to Monad (chain ${knownChain}) to sign in.`);
        return;
      }
      const nonce = await getNonce(wallet, window.location.origin);
      if (gen !== genRef.current) return;
      if (cancelledRef.current) {
        setPhaseSafe('cancelled');
        return;
      }
      const chainNow = await getWalletChainId(p);
      if (gen !== genRef.current) return;
      if (hexToNumber(chainNow) !== knownChain) {
        setWalletChain(chainNow);
        setPhaseSafe('idle');
        setNotice(`Your wallet switched networks while signing in (now chain ${hexToNumber(chainNow) ?? 'unknown'}). Switch it to Monad (chain ${knownChain}) to sign in.`);
        return;
      }
      let signature: string;
      try {
        signature = await personalSign(p, wallet, nonce.message);
      } catch (e) {
        if (gen !== genRef.current) return;
        if (cancelledRef.current || isRejection(e)) {
          setPhaseSafe('cancelled');
          setNotice('Signature cancelled. You stay read-only; nothing was signed or sent.');
        } else {
          setPhaseSafe('idle');
          setNotice(e instanceof Error ? e.message : 'The wallet could not sign the message.');
        }
        return;
      }
      if (gen !== genRef.current) return;
      if (cancelledRef.current) {
        setPhaseSafe('cancelled');
        return;
      }
      const info = await postVerify(nonce.message, signature);
      if (gen !== genRef.current) return;
      setSession(info);
      setPhaseSafe('idle');
      setNotice(null);
    } catch (e) {
      if (gen !== genRef.current) return;
      setPhaseSafe(isRejection(e) ? 'cancelled' : 'idle');
      if (e instanceof ApiCallError) setNotice(e.message);
      else if (e instanceof WalletError) setNotice(`The wallet could not sign in: ${e.message}`);
      else setNotice(e instanceof Error ? e.message : 'Sign-in failed.');
    }
  }, [selected, appChainId, setPhaseSafe]);

  const switchNetwork = useCallback(async () => {
    const p = selected?.provider;
    if (!p) {
      setNotice('No compatible wallet was detected in this browser. Install a wallet extension, then reload. Practice mode needs no wallet.');
      return;
    }
    if (phaseRef.current === 'awaiting') return;
    const gen = ++genRef.current;
    cancelledRef.current = false;
    setPhaseSafe('awaiting');
    setNotice(null);
    let target = appChainId;
    if (target === null) {
      try {
        const h = await getHealth();
        target = h.chainId;
        if (gen !== genRef.current) return;
        setAppChainId(target);
      } catch {
        if (gen !== genRef.current) return;
        setPhaseSafe('idle');
        setNotice('Could not confirm which network this app uses, so switching is blocked. Try again in a moment.');
        return;
      }
    }
    try {
      await switchChain(
        p,
        chainIdToHex(target),
        target === MONAD_MAINNET_CHAIN_ID
          ? { ...MONAD_MAINNET_ADD_CHAIN_PARAMS }
          : undefined,
      );
    } catch (e) {
      if (gen !== genRef.current) return;
      setPhaseSafe('idle');
      if (isRejection(e)) setNotice('Network switch was cancelled. Your wallet stays on its current network.');
      else setNotice(`Your wallet could not switch networks automatically (${e instanceof Error ? e.message : String(e)}). Open your wallet, choose Monad (chain ${target}) by hand, then sign in.`);
      return;
    }
    const chain = await getWalletChainId(p);
    if (gen !== genRef.current) return;
    setWalletChain(chain);
    const now = hexToNumber(chain);
    if (now !== target) {
      setPhaseSafe('idle');
      setNotice(`Your wallet is still on chain ${now ?? 'an unknown network'}. Switch it to Monad (chain ${target}) to sign in.`);
      return;
    }
    setPhaseSafe('idle');
    await signIn();
  }, [selected, appChainId, signIn, setPhaseSafe]);

  const cancelSignIn = useCallback(() => {
    cancelledRef.current = true;
    genRef.current += 1;
    setPhaseSafe('cancelled');
    setNotice('Sign-in cancelled. You are read-only; nothing was signed.');
  }, [setPhaseSafe]);

  const disconnect = useCallback(async () => {
    const gen = ++genRef.current;
    cancelledRef.current = true;
    setSelected(null);
    setPickerOpen(false);
    setAddress(null);
    setWalletChain(null);
    const hadSession = session?.authenticated === true;
    setSession(null);
    setPhaseSafe('idle');
    setNotice(null);
    if (!hadSession) return;
    try {
      const info = await postLogout();
      if (gen === genRef.current) setSession(info);
    } catch (e) {
      if (gen !== genRef.current) return;
      if (e instanceof ApiCallError && e.code === 'SIGN_IN_REQUIRED') return;
      setNotice('Signed out on this device, but the server session could not be cleared. It expires on its own.');
    }
  }, [setPhaseSafe, session]);

  const wrongNetwork = useMemo(
    () => appChainId !== null && walletChain !== null && hexToNumber(walletChain) !== appChainId,
    [appChainId, walletChain],
  );

  const clearNotice = useCallback(() => setNotice(null), []);

  const viewer: Viewer = useMemo(() => {
    if (phase === 'awaiting') return 'awaiting';
    if (session?.authenticated) {
      if (address && session.wallet && address !== session.wallet) return 'switched';
      return 'signed';
    }
    if (session?.expired) return 'expired';
    if (phase === 'cancelled') return 'cancelled';
    if (wrongNetwork) return 'unsupported';
    if (address) return 'connected';
    return 'visitor';
  }, [phase, session, address, wrongNetwork]);

  const walletChoices = useMemo<WalletChoice[]>(
    () => wallets.map(w => ({ uuid: w.info.uuid, name: w.info.name, icon: w.info.icon })),
    [wallets],
  );

  const value = useMemo<AuthController>(
    () => ({
      provider: selected?.provider ?? null,
      address,
      session,
      phase,
      notice,
      appChainId,
      wrongNetwork,
      viewer,
      wallets: walletChoices,
      pickerOpen,
      connect,
      pickWallet,
      closePicker,
      signIn,
      switchNetwork,
      cancelSignIn,
      disconnect,
      refresh,
      clearNotice,
    }),
    [
      selected,
      address,
      session,
      phase,
      notice,
      appChainId,
      wrongNetwork,
      viewer,
      walletChoices,
      pickerOpen,
      connect,
      pickWallet,
      closePicker,
      signIn,
      switchNetwork,
      cancelSignIn,
      disconnect,
      refresh,
      clearNotice,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthController {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
