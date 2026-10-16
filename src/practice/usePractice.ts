import { useCallback, useMemo, useRef, useState } from 'react';
import { deriveTitle } from '@/shared/rules';
import type { Stats } from '@/shared/rules';
import { AppError, type ErrorCode } from '@/server/errors';
import {
  CONTROLLER_A,
  CONTROLLER_B,
  GameService,
  PRACTICE_CHARACTER_ID,
  PRACTICE_TOKEN_ID,
  seedPractice,
  systemClock,
  type CommitReceipt,
  type EventRecord,
  type PlayView,
} from '@/server/service';
import { clearPracticeDb, loadPracticeDb, savePracticeDb } from '@/server/storage';
import { delay, formatResetLocal, relativePast } from '@/app/format';
import type { Entry, Profile, SaveState } from '@/ui/types';

export type PracticeView = 'profile' | 'encounter' | 'outcome' | 'inheritance';

function eventToEntry(ev: EventRecord): Entry {
  return {
    id: ev.id,
    kind: ev.type,
    who: ev.actor,
    when: new Date(ev.createdAt).toLocaleString(),
    text: ev.text,
    fixture: ev.fixture,
  };
}

export function currentController(svc: GameService): string {
  return svc.getProfile(PRACTICE_CHARACTER_ID).epoch.controller;
}

export function profileFromService(svc: GameService): Profile {
  const pm = svc.getProfile(PRACTICE_CHARACTER_ID);
  const stats: Stats = { trust: pm.character.trust, notoriety: pm.character.notoriety, supplies: pm.character.supplies };
  return {
    mode: 'practice',
    tokenId: PRACTICE_TOKEN_ID,
    name: 'Ashen Chog (practice character)',
    owner: {
      label: `${pm.epoch.controller}`,
      observedAt: relativePast(pm.epoch.startedAt, new Date(), '(simulated observation)'),
      status: 'fresh',
    },
    started: pm.started,
    stats,
    title: deriveTitle(stats),
    version: pm.character.version,
    actionsUsed: pm.actionsUsed,
    nextResetLocal: formatResetLocal(pm.nextResetUtc),
    intention: pm.epoch.intention,
    coverage: 'none',
    chronicle: pm.chronicleNewestFirst.map(eventToEntry),
    inheritedFrom:
      pm.epochCount > 1
        ? { priorChapters: pm.priorGameChapters, lastThree: pm.lastThreeGameEvents.map(eventToEntry) }
        : undefined,
  };
}

export interface PracticeController {
  ready: boolean;
  profile: Profile;
  view: PracticeView;
  play: PlayView | null;
  outcome: CommitReceipt | null;
  saveState: SaveState;
  errorCode: ErrorCode | null;
  note: string | null;
  controller: string;
  tick: number;
  refresh(): void;
  openProfile(): void;
  openPlay(): void;
  openIntention(): void;
  submitChoice(choiceId: string): Promise<void>;
  nextAfterOutcome(): void;
  handoff(): void;
  reset(): void;
  setIntention(i: 'embrace' | 'redeem'): Promise<void>;
  clearNote(): void;
  clearError(): void;
}

const SAVE_LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 300;

export function usePractice(): PracticeController {
  const svcRef = useRef<GameService | null>(null);
  if (!svcRef.current) {
    const db = loadPracticeDb(systemClock);
    svcRef.current = new GameService(db, systemClock, savePracticeDb, true);
  }
  const svc = svcRef.current;

  const [tick, setTick] = useState(0);
  const [view, setView] = useState<PracticeView>('profile');
  const [play, setPlay] = useState<PlayView | null>(null);
  const [outcome, setOutcome] = useState<CommitReceipt | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const profile = useMemo(() => profileFromService(svc), [svc, tick]);
  const controller = profile.owner.label;

  const showError = useCallback((e: unknown) => {
    setErrorCode(e instanceof AppError ? e.code : 'STORAGE_UNAVAILABLE');
    setSaveState('failed');
    refresh();
  }, [refresh]);

  const openPlay = useCallback(() => {
    try {
      const pv = svc.getPlay(PRACTICE_CHARACTER_ID, currentController(svc));
      if (pv.actionsUsed >= 3 || !pv.encounter) {
        setView('profile');
        setNote('No decisions left today. The allowance belongs to the Chog and resets at the time shown.');
        setPlay(pv);
        refresh();
        return;
      }
      setPlay(pv);
      setErrorCode(null);
      setSaveState('idle');
      setView('encounter');
      refresh();
    } catch (e) {
      showError(e);
    }
  }, [svc, refresh, showError]);

  const openProfile = useCallback(() => {
    setView('profile');
    setErrorCode(null);
    setSaveState('idle');
    refresh();
  }, [refresh]);

  const openIntention = useCallback(() => {
    setView('inheritance');
    setErrorCode(null);
    refresh();
  }, [refresh]);

  const submitChoice = useCallback(async (choiceId: string) => {
    if (!play?.encounter) return;
    setSaveState('pending');
    setErrorCode(null);
    const request = {
      characterId: PRACTICE_CHARACTER_ID,
      controller: currentController(svc),
      instanceId: play.encounter.instanceId,
      choiceId,
      expectedVersion: play.version,
      idempotencyKey: crypto.randomUUID(),
    };
    try {
      if (SAVE_LATENCY_MS > 0) await delay(SAVE_LATENCY_MS);
      const receipt = svc.commitAction(request);
      setOutcome(receipt);
      setSaveState('saved');
      setView('outcome');
      refresh();
    } catch (e) {
      const code = e instanceof AppError ? e.code : 'STORAGE_UNAVAILABLE';
      setErrorCode(code);
      setSaveState(code === 'STATE_CHANGED' || code === 'CHOICE_UNAVAILABLE' || code === 'DAILY_LIMIT' ? 'conflict' : 'failed');
      try {
        setPlay(svc.getPlay(PRACTICE_CHARACTER_ID, currentController(svc)));
      } catch {
        setPlay(null);
      }
      refresh();
    }
  }, [play, svc, refresh]);

  const nextAfterOutcome = useCallback(() => {
    openPlay();
  }, [openPlay]);

  const handoff = useCallback(() => {
    try {
      const cur = currentController(svc);
      const next = cur === CONTROLLER_A ? CONTROLLER_B : CONTROLLER_A;
      const res = svc.syncOwnership(PRACTICE_CHARACTER_ID, next);
      setView('inheritance');
      setErrorCode(null);
      setNote(
        res.changed
          ? 'Simulated controller change recorded. Reputation, history, supplies and remaining daily actions carried over unchanged.'
          : 'The simulated controller is unchanged.',
      );
      refresh();
    } catch (e) {
      showError(e);
    }
  }, [svc, refresh, showError]);

  const setIntention = useCallback(async (i: 'embrace' | 'redeem') => {
    if (SAVE_LATENCY_MS > 0) await delay(SAVE_LATENCY_MS);
    const pm = svc.getProfile(PRACTICE_CHARACTER_ID);
    svc.setIntention(PRACTICE_CHARACTER_ID, pm.epoch.controller, pm.epoch.id, i);
    refresh();
  }, [svc, refresh]);

  const reset = useCallback(() => {
    clearPracticeDb();
    const db = seedPractice(systemClock.now());
    savePracticeDb(db);
    svcRef.current = new GameService(db, systemClock, savePracticeDb, true);
    setView('profile');
    setPlay(null);
    setOutcome(null);
    setSaveState('idle');
    setErrorCode(null);
    setNote('Practice reset. The seeded feared Chog is back at trust −35, notoriety 70, supplies 3, controller A.');
    refresh();
  }, [refresh]);

  return {
    ready: true,
    profile,
    view,
    play,
    outcome,
    saveState,
    errorCode,
    note,
    controller,
    tick,
    refresh,
    openProfile,
    openPlay,
    openIntention,
    submitChoice,
    nextAfterOutcome,
    handoff,
    reset,
    setIntention,
    clearNote: useCallback(() => setNote(null), []),
    clearError: useCallback(() => { setErrorCode(null); setSaveState('idle'); }, []),
  };
}
