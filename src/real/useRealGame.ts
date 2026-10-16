import { useCallback, useState } from 'react';
import type { ApiCommitReceipt, ApiPlayState, ApiProfile } from '@/shared/apiTypes';
import type { ErrorCode, SaveState } from '@/ui/types';
import { actionChog, activateChog, intentionChog, lookupRealToken, playChog, refreshRealToken } from './realApi';

export type RealPlayView = 'loading' | 'ready' | 'error' | 'inheritance' | 'encounter' | 'outcome';

const CONFLICT_CODES: ErrorCode[] = ['STATE_CHANGED', 'CHOICE_UNAVAILABLE', 'DAILY_LIMIT'];

export interface RealGameController {
  profile: ApiProfile | null;
  view: RealPlayView;
  loadError: { code: ErrorCode; detail: string } | null;
  play: ApiPlayState | null;
  outcome: ApiCommitReceipt | null;
  saveState: SaveState;
  errorCode: ErrorCode | null;
  errorDetail: string | null;
  notice: string | null;
  busy: boolean;
  load(): Promise<void>;
  refreshOwner(quiet?: boolean): Promise<void>;
  activate(): Promise<'play' | 'inheritance' | 'error'>;
  openPlay(): Promise<void>;
  openIntention(): void;
  submitChoice(choiceId: string): Promise<void>;
  setIntention(i: 'embrace' | 'redeem'): Promise<void>;
  openProfile(): void;
  clearError(): void;
  clearNotice(): void;
}

export function useRealGame(tokenId: string): RealGameController {
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [view, setView] = useState<RealPlayView>('loading');
  const [loadError, setLoadError] = useState<{ code: ErrorCode; detail: string } | null>(null);
  const [play, setPlay] = useState<ApiPlayState | null>(null);
  const [outcome, setOutcome] = useState<ApiCommitReceipt | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setError = useCallback((code: ErrorCode, detail: string | null) => {
    setErrorCode(code);
    setErrorDetail(detail);
  }, []);

  const load = useCallback(async () => {
    setView('loading');
    setLoadError(null);
    const res = await lookupRealToken(tokenId);
    if (res.ok && res.profile) {
      setProfile(res.profile);
      setView('ready');
    } else {
      setLoadError({ code: res.errorCode ?? 'CHAIN_UNAVAILABLE', detail: res.detail ?? 'Lookup failed.' });
      setView('error');
    }
  }, [tokenId]);

  const refreshOwner = useCallback(async (quiet?: boolean) => {
    setBusy(true);
    const res = await refreshRealToken(tokenId);
    setBusy(false);
    if (res.ok && res.profile) {
      setProfile(res.profile);
      setNotice(null);
      return;
    }
    if (quiet) return;
    setNotice(res.detail ?? 'Ownership refresh failed.');
    setError(res.errorCode ?? 'CHAIN_UNAVAILABLE', res.detail ?? null);
  }, [tokenId, setError]);

  const activate = useCallback(async (): Promise<'play' | 'inheritance' | 'error'> => {
    setBusy(true);
    const res = await activateChog(tokenId);
    if (!res.ok || !res.data) {
      setBusy(false);
      setError(res.errorCode ?? 'SIGN_IN_REQUIRED', res.detail ?? null);
      return 'error';
    }
    const created = res.data.created;
    const changed = res.data.changed;
    const reload = await lookupRealToken(tokenId);
    if (reload.ok && reload.profile) setProfile(reload.profile);
    setBusy(false);
    setErrorCode(null);
    setErrorDetail(null);
    if (created) return 'play';
    if (changed) {
      setView('inheritance');
      return 'inheritance';
    }
    return 'play';
  }, [tokenId, setError]);

  const openPlay = useCallback(async () => {
    setView('encounter');
    setPlay(null);
    setErrorCode(null);
    setErrorDetail(null);
    const res = await playChog(tokenId);
    if (!res.ok || !res.data) {
      const code = res.errorCode ?? 'STORAGE_UNAVAILABLE';
      if (code === 'INVALID_INPUT' && /not activated/i.test(res.detail ?? '')) {
        setNotice(res.detail ?? null);
        setView('ready');
      } else {
        setError(code, res.detail ?? null);
        setView('encounter');
      }
      return;
    }
    const st = res.data;
    setPlay(st);
    if (!st.encounter) {
      setNotice(
        st.actionsUsed >= 3
          ? 'All three daily decisions are used. The allowance belongs to the Chog and resets at the time shown.'
          : 'No encounter is available right now. Come back after the reset.',
      );
      setView('ready');
      return;
    }
    setView('encounter');
  }, [tokenId, setError]);

  const openIntention = useCallback(() => {
    setErrorCode(null);
    setErrorDetail(null);
    setView('inheritance');
  }, []);

  const submitChoice = useCallback(
    async (choiceId: string) => {
      if (!play?.encounter) return;
      setSaveState('pending');
      setErrorCode(null);
      setErrorDetail(null);
      const res = await actionChog(tokenId, {
        instanceId: play.encounter.instanceId,
        choiceId,
        expectedVersion: play.version,
        idempotencyKey: `act:${play.encounter.instanceId}:${choiceId}`,
      });
      if (res.ok && res.data) {
        setOutcome(res.data);
        setSaveState('saved');
        setView('outcome');
        void lookupRealToken(tokenId).then(r => {
          if (r.ok && r.profile) setProfile(r.profile);
        });
        return;
      }
      const code = res.errorCode ?? 'STORAGE_UNAVAILABLE';
      setError(code, res.detail ?? null);
      setSaveState(CONFLICT_CODES.includes(code) ? 'conflict' : 'failed');
      if (CONFLICT_CODES.includes(code)) {
        const retry = await playChog(tokenId);
        if (retry.ok && retry.data) setPlay(retry.data);
      }
    },
    [play, tokenId, setError],
  );

  const setIntention = useCallback(
    async (i: 'embrace' | 'redeem') => {
      setErrorCode(null);
      setErrorDetail(null);
      const res = await intentionChog(tokenId, i);
      if (!res.ok) {
        const code = res.errorCode ?? 'STORAGE_UNAVAILABLE';
        setError(code, res.detail ?? null);
        setSaveState('failed');
        throw new Error(res.detail ?? 'Intention could not be saved.');
      }
      const reload = await lookupRealToken(tokenId);
      if (reload.ok && reload.profile) setProfile(reload.profile);
      setSaveState('saved');
    },
    [tokenId, setError],
  );

  const openProfile = useCallback(() => {
    setView('ready');
    setErrorCode(null);
    setErrorDetail(null);
    setSaveState('idle');
  }, []);

  return {
    profile,
    view,
    loadError,
    play,
    outcome,
    saveState,
    errorCode,
    errorDetail,
    notice,
    busy,
    load,
    refreshOwner,
    activate,
    openPlay,
    openIntention,
    submitChoice,
    setIntention,
    openProfile,
    clearError: useCallback(() => {
      setErrorCode(null);
      setErrorDetail(null);
      setSaveState('idle');
    }, []),
    clearNotice: useCallback(() => setNotice(null), []),
  };
}
