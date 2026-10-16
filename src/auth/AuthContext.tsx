import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ApiSessionInfo } from '@/shared/apiTypes';
import type { Viewer } from '@/ui/types';
import {
  connectAccounts,
  getProvider,
  getWalletChainId,
  isRejection,
  onAccountsChanged,
  onChainChanged,
  personalSign,
  WalletError,
  type WalletProvider,
} from '@/wallet/ethereum';
import { ApiCallError, getHealth, getNonce, getSession, postLogout, postVerify } from './authApi';

export type SignInPhase = 'idle' | 'awaiting' | 'cancelled';

export interface AuthController {
  provider: WalletProvider | null;
  address: string | null;
  session: ApiSessionInfo | null;
  phase: SignInPhase;
  notice: string | null;
  appChainId: number | null;
  wrongNetwork: boolean;
  viewer: Viewer;
  connect(): Promise<void>;
  signIn(): Promise<void>;
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
  const [provider] = useState<WalletProvider | null>(() => getProvider());
  const [address, setAddress] = useState<string | null>(null);
  const [session, setSession] = useState<ApiSessionInfo | null>(null);
  const [phase, setPhase] = useState<SignInPhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [appChainId, setAppChainId] = useState<number | null>(null);
  const [walletChain, setWalletChain] = useState<string | null>(null);
  const phaseRef = useRef<SignInPhase>('idle');
  const cancelledRef = useRef(false);

  const setPhaseSafe = useCallback((p: SignInPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

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
    if (!provider) return;
    const offAccounts = onAccountsChanged(provider, accounts => {
      setAddress(accounts[0]?.toLowerCase() ?? null);
    });
    const offChain = onChainChanged(provider, chain => setWalletChain(chain));
    return () => {
      offAccounts();
      offChain();
    };
  }, [provider]);

  const refresh = useCallback(async () => {
    try {
      setSession(await getSession());
    } catch {
      setSession(null);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!provider) {
      setNotice('No compatible wallet was detected in this browser. Install a wallet extension, then reload. Practice mode needs no wallet.');
      return;
    }
    try {
      const accounts = await connectAccounts(provider);
      setAddress(accounts[0]?.toLowerCase() ?? null);
      setWalletChain(await getWalletChainId(provider));
      setNotice(null);
    } catch (e) {
      if (isRejection(e)) setNotice('Wallet connection was cancelled.');
      else setNotice(e instanceof Error ? e.message : 'The wallet could not connect.');
    }
  }, [provider]);

  const signIn = useCallback(async () => {
    if (phaseRef.current === 'awaiting') return;
    if (!provider) {
      setNotice('No compatible wallet was detected. Practice mode needs no wallet.');
      return;
    }
    cancelledRef.current = false;
    setPhaseSafe('awaiting');
    setNotice(null);
    try {
      const accounts = await connectAccounts(provider);
      const wallet = accounts[0]?.toLowerCase();
      if (!wallet) {
        setPhaseSafe('idle');
        setNotice('The wallet reported no accounts.');
        return;
      }
      setAddress(wallet);
      const chain = await getWalletChainId(provider);
      setWalletChain(chain);
      const chainNum = hexToNumber(chain);
      let knownChain = appChainId;
      if (knownChain === null) {
        try {
          knownChain = (await getHealth()).chainId;
          setAppChainId(knownChain);
        } catch {
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
      if (cancelledRef.current) {
        setPhaseSafe('cancelled');
        return;
      }
      let signature: string;
      try {
        signature = await personalSign(provider, wallet, nonce.message);
      } catch (e) {
        if (cancelledRef.current || isRejection(e)) {
          setPhaseSafe('cancelled');
          setNotice('Signature cancelled. You stay read-only; nothing was signed or sent.');
        } else {
          setPhaseSafe('idle');
          setNotice(e instanceof Error ? e.message : 'The wallet could not sign the message.');
        }
        return;
      }
      if (cancelledRef.current) {
        setPhaseSafe('cancelled');
        return;
      }
      const info = await postVerify(nonce.message, signature);
      setSession(info);
      setPhaseSafe('idle');
      setNotice(null);
    } catch (e) {
      setPhaseSafe(isRejection(e) ? 'cancelled' : 'idle');
      if (e instanceof ApiCallError) setNotice(e.message);
      else if (e instanceof WalletError) setNotice(`The wallet could not sign in: ${e.message}`);
      else setNotice(e instanceof Error ? e.message : 'Sign-in failed.');
    }
  }, [provider, appChainId, setPhaseSafe]);

  const cancelSignIn = useCallback(() => {
    cancelledRef.current = true;
    setPhaseSafe('cancelled');
    setNotice('Sign-in cancelled. You are read-only; nothing was signed.');
  }, [setPhaseSafe]);

  const disconnect = useCallback(async () => {
    cancelledRef.current = true;
    setAddress(null);
    try {
      const info = await postLogout();
      setSession(info);
    } catch {
      setSession(null);
    }
    setPhaseSafe('idle');
  }, [setPhaseSafe]);

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

  const value = useMemo<AuthController>(
    () => ({
      provider,
      address,
      session,
      phase,
      notice,
      appChainId,
      wrongNetwork,
      viewer,
      connect,
      signIn,
      cancelSignIn,
      disconnect,
      refresh,
      clearNotice,
    }),
    [provider, address, session, phase, notice, appChainId, wrongNetwork, viewer, connect, signIn, cancelSignIn, disconnect, refresh, clearNotice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthController {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
