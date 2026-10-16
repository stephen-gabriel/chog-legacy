import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONTROLLER_A,
  CONTROLLER_B,
  GameService,
  PRACTICE_CHARACTER_ID,
  canonicalIdentity,
  seedPractice,
  type Clock,
} from '@/server/service';
import { AppError } from '@/server/errors';
import { dailyTemplateIds, deriveTitle } from '@/shared/rules';
import { PRACTICE_STORAGE_KEY, clearPracticeDb, loadPracticeDb, savePracticeDb } from '@/server/storage';

const clockAt = (iso: string): Clock => ({ now: () => new Date(iso) });

function makeService(nowIso = '2026-10-15T10:00:00.000Z') {
  const clock = clockAt(nowIso);
  const db = seedPractice(clock.now());
  const svc = new GameService(db, clock, () => {}, true);
  return { svc, clock, db };
}

function errCode(fn: () => unknown): string {
  try {
    fn();
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof AppError ? e.code : `OTHER:${String(e)}`;
  }
}

function pickChoice(play: NonNullable<ReturnType<GameService['getPlay']>>['encounter'], preferTrust = false) {
  const eligible = play!.choices.filter(c => c.eligible);
  expect(eligible.length).toBeGreaterThan(0);
  if (preferTrust) {
    return [...eligible].sort((a, b) => b.delta.trust - a.delta.trust || a.delta.supplies - b.delta.supplies)[0];
  }
  return eligible.find(c => c.delta.trust === 0 && c.delta.notoriety === 0) ?? eligible[eligible.length - 1];
}

let keyN = 0;
const nextKey = () => `test-key-${++keyN}`;

describe('practice seed (DEMO-01)', () => {
  it('seeds the feared villain at −35 / 70 / 3 under controller A with labeled fixture history', () => {
    const { svc } = makeService();
    const pm = svc.getProfile(PRACTICE_CHARACTER_ID);
    expect({ trust: pm.character.trust, notoriety: pm.character.notoriety, supplies: pm.character.supplies }).toEqual({
      trust: -35,
      notoriety: 70,
      supplies: 3,
    });
    expect(pm.title).toBe('The Feared');
    expect(pm.epoch.controller).toBe(CONTROLLER_A);
    expect(pm.started).toBe(true);
    expect(pm.chronicleNewestFirst).toHaveLength(4);
    expect(pm.chronicleNewestFirst.every(e => e.fixture)).toBe(true);
    expect(pm.chronicleNewestFirst.filter(e => e.type === 'game')).toHaveLength(3);
    expect(pm.character.namespace).toBe('practice-local');
  });

  it('seeded chapters are numerically consistent from origin to final state', () => {
    const { svc } = makeService();
    const events = svc.getProfile(PRACTICE_CHARACTER_ID).chronicleNewestFirst.slice().reverse();
    for (let i = 1; i < events.length; i++) {
      expect(events[i].before).toEqual(events[i - 1].after);
    }
    const last = events[events.length - 1];
    expect(last.after).toEqual({ trust: -35, notoriety: 70, supplies: 3 });
  });
});

describe('commit semantics (GAME-03, §5)', () => {
  it('applies exactly one table-defined effect, one event, one quota and one version bump', () => {
    const { svc } = makeService();
    const before = svc.getProfile(PRACTICE_CHARACTER_ID);
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    expect(play.encounter).not.toBeNull();
    const choice = play.encounter!.choices.find(c => c.eligible)!;
    const receipt = svc.commitAction({
      characterId: PRACTICE_CHARACTER_ID,
      controller: CONTROLLER_A,
      instanceId: play.encounter!.instanceId,
      choiceId: choice.id,
      expectedVersion: play.version,
      idempotencyKey: nextKey(),
    });
    expect(receipt.before).toEqual(play.stats);
    expect(receipt.after).toEqual(choice.preview);
    expect(receipt.titleBefore).toBe(deriveTitle(play.stats));
    expect(receipt.actionsUsed).toBe(1);
    expect(receipt.left).toBe(2);

    const after = svc.getProfile(PRACTICE_CHARACTER_ID);
    expect(after.character.version).toBe(before.character.version + 1);
    expect(after.actionsUsed).toBe(1);
    expect(after.chronicleNewestFirst).toHaveLength(before.chronicleNewestFirst.length + 1);
    expect(after.chronicleNewestFirst[0].type).toBe('game');
    expect(after.chronicleNewestFirst[0].actor).toBe(CONTROLLER_A);
  });

  it('the next unresolved instance is the only playable one', () => {
    const { svc } = makeService();
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    const first = play.encounter!;
    const secondChoice = pickChoice(first);
    svc.commitAction({
      characterId: PRACTICE_CHARACTER_ID,
      controller: CONTROLLER_A,
      instanceId: first.instanceId,
      choiceId: secondChoice.id,
      expectedVersion: play.version,
      idempotencyKey: nextKey(),
    });
    const play2 = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    expect(play2.encounter!.instanceId).not.toBe(first.instanceId);

    const stale = errCode(() =>
      svc.commitAction({
        characterId: PRACTICE_CHARACTER_ID,
        controller: CONTROLLER_A,
        instanceId: first.instanceId,
        choiceId: secondChoice.id,
        expectedVersion: play2.version,
        idempotencyKey: nextKey(),
      }),
    );
    expect(stale).toBe('STATE_CHANGED');
  });

  it('rejects a stale expected version with STATE_CHANGED', () => {
    const { svc } = makeService();
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    const choice = pickChoice(play.encounter);
    svc.commitAction({
      characterId: PRACTICE_CHARACTER_ID,
      controller: CONTROLLER_A,
      instanceId: play.encounter!.instanceId,
      choiceId: choice.id,
      expectedVersion: play.version,
      idempotencyKey: nextKey(),
    });
    const code = errCode(() =>
      svc.commitAction({
        characterId: PRACTICE_CHARACTER_ID,
        controller: CONTROLLER_A,
        instanceId: play.encounter!.instanceId,
        choiceId: choice.id,
        expectedVersion: play.version,
        idempotencyKey: nextKey(),
      }),
    );
    expect(code).toBe('STATE_CHANGED');
  });

  it('blocks ineligible choices with CHOICE_UNAVAILABLE', () => {
    const { svc, db } = makeService();
    const char = db.characters.find(c => c.id === PRACTICE_CHARACTER_ID)!;
    char.trust = 0;
    char.notoriety = 0;
    char.supplies = 0;
    const identity = canonicalIdentity(char);
    const date = '2026-10-15';
    const firstTemplate = dailyTemplateIds(identity, date)[0];

    if (firstTemplate === 2) {
      const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
      const join = play.encounter!.choices.find(c => c.id === 'join')!;
      expect(join.eligible).toBe(false);
      const code = errCode(() =>
        svc.commitAction({
          characterId: PRACTICE_CHARACTER_ID,
          controller: CONTROLLER_A,
          instanceId: play.encounter!.instanceId,
          choiceId: 'join',
          expectedVersion: play.version,
          idempotencyKey: nextKey(),
        }),
      );
      expect(code).toBe('CHOICE_UNAVAILABLE');
    } else {
      const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
      const locked = play.encounter!.choices.find(c => !c.eligible)!;
      expect(locked).toBeTruthy();
      const code = errCode(() =>
        svc.commitAction({
          characterId: PRACTICE_CHARACTER_ID,
          controller: CONTROLLER_A,
          instanceId: play.encounter!.instanceId,
          choiceId: locked.id,
          expectedVersion: play.version,
          idempotencyKey: nextKey(),
        }),
      );
      expect(code).toBe('CHOICE_UNAVAILABLE');
    }
  });

  it('enforces the three-decision daily limit and ignores ownership change as a refill', () => {
    const { svc } = makeService();
    let lastInstanceId = '';
    for (let i = 0; i < 3; i++) {
      const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
      expect(play.encounter).not.toBeNull();
      lastInstanceId = play.encounter!.instanceId;
      const choice = pickChoice(play.encounter);
      svc.commitAction({
        characterId: PRACTICE_CHARACTER_ID,
        controller: CONTROLLER_A,
        instanceId: lastInstanceId,
        choiceId: choice.id,
        expectedVersion: play.version,
        idempotencyKey: nextKey(),
      });
    }
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    expect(play.actionsUsed).toBe(3);
    expect(errCode(() =>
      svc.commitAction({
        characterId: PRACTICE_CHARACTER_ID,
        controller: CONTROLLER_A,
        instanceId: lastInstanceId,
        choiceId: 'pass',
        expectedVersion: play.version,
        idempotencyKey: nextKey(),
      }),
    )).toBe('DAILY_LIMIT');

    svc.syncOwnership(PRACTICE_CHARACTER_ID, CONTROLLER_B);
    const asB = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_B);
    expect(asB.actionsUsed).toBe(3);
    expect(asB.encounter).toBeNull();
  });
});

describe('idempotency', () => {
  it('an exact retry returns the same receipt without spending another action', () => {
    const { svc } = makeService();
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    const choice = pickChoice(play.encounter);
    const req = {
      characterId: PRACTICE_CHARACTER_ID,
      controller: CONTROLLER_A,
      instanceId: play.encounter!.instanceId,
      choiceId: choice.id,
      expectedVersion: play.version,
      idempotencyKey: nextKey(),
    };
    const first = svc.commitAction(req);
    const retry = svc.commitAction(req);
    expect(retry.duplicate).toBe(true);
    expect(retry.receiptId).toBe(first.receiptId);
    expect(retry.after).toEqual(first.after);
    const pm = svc.getProfile(PRACTICE_CHARACTER_ID);
    expect(pm.actionsUsed).toBe(1);
    expect(pm.chronicleNewestFirst).toHaveLength(5);
  });

  it('rejects reuse of a key with different input', () => {
    const { svc } = makeService();
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    const choice = pickChoice(play.encounter);
    const key = nextKey();
    svc.commitAction({
      characterId: PRACTICE_CHARACTER_ID,
      controller: CONTROLLER_A,
      instanceId: play.encounter!.instanceId,
      choiceId: choice.id,
      expectedVersion: play.version,
      idempotencyKey: key,
    });
    const play2 = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    const code = errCode(() =>
      svc.commitAction({
        characterId: PRACTICE_CHARACTER_ID,
        controller: CONTROLLER_A,
        instanceId: play2.encounter!.instanceId,
        choiceId: pickChoice(play2.encounter).id,
        expectedVersion: play2.version,
        idempotencyKey: key,
      }),
    );
    expect(code).toBe('INVALID_INPUT');
  });
});

describe('ownership inheritance (OWN-01…04)', () => {
  it('controller change preserves stats, history, supplies and remaining daily actions', () => {
    const { svc } = makeService();
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    const choice = pickChoice(play.encounter);
    const receipt = svc.commitAction({
      characterId: PRACTICE_CHARACTER_ID,
      controller: CONTROLLER_A,
      instanceId: play.encounter!.instanceId,
      choiceId: choice.id,
      expectedVersion: play.version,
      idempotencyKey: nextKey(),
    });

    const sync = svc.syncOwnership(PRACTICE_CHARACTER_ID, CONTROLLER_B);
    expect(sync.changed).toBe(true);

    const beforeB = svc.getProfile(PRACTICE_CHARACTER_ID);
    expect(beforeB.character.trust).toBe(receipt.after.trust);
    expect(beforeB.character.notoriety).toBe(receipt.after.notoriety);
    expect(beforeB.character.supplies).toBe(receipt.after.supplies);
    expect(beforeB.epoch.controller).toBe(CONTROLLER_B);
    expect(beforeB.actionsUsed).toBe(1);
    expect(beforeB.priorGameChapters).toBe(4);
    expect(beforeB.lastThreeGameEvents).toHaveLength(3);
    expect(beforeB.chronicleNewestFirst[0].type).toBe('ownership');
    expect(beforeB.chronicleNewestFirst[0].text).toContain(CONTROLLER_B);

    const playB = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_B);
    expect(playB.actionsUsed).toBe(1);
    expect(playB.stats).toEqual(receipt.after);
    expect(playB.encounter).not.toBeNull();
    expect(playB.version).toBe(beforeB.character.version);
  });

  it('keeps the old controller blocked despite acting before (OWN-02)', () => {
    const { svc } = makeService();
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    const choice = pickChoice(play.encounter);
    const req = {
      characterId: PRACTICE_CHARACTER_ID,
      controller: CONTROLLER_A,
      instanceId: play.encounter!.instanceId,
      choiceId: choice.id,
      expectedVersion: play.version,
      idempotencyKey: nextKey(),
    };
    svc.commitAction(req);
    svc.syncOwnership(PRACTICE_CHARACTER_ID, CONTROLLER_B);

    expect(errCode(() => svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A))).toBe('NOT_CURRENT_OWNER');
    expect(errCode(() => svc.commitAction({ ...req, idempotencyKey: nextKey() }))).toBe('NOT_CURRENT_OWNER');
    expect(errCode(() =>
      svc.commitAction({
        ...req,
        expectedVersion: svc.getProfile(PRACTICE_CHARACTER_ID).character.version,
        idempotencyKey: nextKey(),
      }),
    )).toBe('NOT_CURRENT_OWNER');
  });

  it('daily encounter assignments survive the owner change (GAME-02 persistence)', () => {
    const { svc } = makeService();
    const playA = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    const firstTemplate = playA.encounter!.templateId;
    svc.syncOwnership(PRACTICE_CHARACTER_ID, CONTROLLER_B);
    const playB = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_B);
    expect(playB.encounter!.templateId).toBe(firstTemplate);
    expect(playB.encounter!.instanceId).toBe(playA.encounter!.instanceId);
  });

  it('an unchanged observation does not open a new epoch', () => {
    const { svc } = makeService();
    const r = svc.syncOwnership(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    expect(r.changed).toBe(false);
    expect(svc.getProfile(PRACTICE_CHARACTER_ID).epochCount).toBe(1);
  });
});

describe('midnight boundary (GAME-01/04)', () => {
  it('unresolved yesterday encounters are rejected after the UTC day changes; quota resets once', () => {
    const clock = clockAt('2026-10-15T23:59:00.000Z');
    const svc = new GameService(seedPractice(clock.now()), clock, () => {}, true);
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    const yesterdayInstance = play.encounter!.instanceId;
    const choice = pickChoice(play.encounter);

    const midnight = clockAt('2026-10-16T00:01:00.000Z');
    const svc2 = new GameService(svc.snapshot(), midnight, () => {}, true);

    const code = errCode(() =>
      svc2.commitAction({
        characterId: PRACTICE_CHARACTER_ID,
        controller: CONTROLLER_A,
        instanceId: yesterdayInstance,
        choiceId: choice.id,
        expectedVersion: play.version,
        idempotencyKey: nextKey(),
      }),
    );
    expect(code).toBe('STATE_CHANGED');

    const fresh = svc2.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    expect(fresh.actionsUsed).toBe(0);
    expect(fresh.encounter!.instanceId).not.toBe(yesterdayInstance);
    expect(fresh.instanceDate).toBe('2026-10-16');
  });
});

describe('chapter intention (OWN-03)', () => {
  it('sets once per epoch, changes no stats and spends no daily action', () => {
    const { svc } = makeService();
    const pm = svc.getProfile(PRACTICE_CHARACTER_ID);
    const epoch = svc.setIntention(PRACTICE_CHARACTER_ID, CONTROLLER_A, pm.epoch.id, 'redeem');
    expect(epoch.intention).toBe('redeem');
    const after = svc.getProfile(PRACTICE_CHARACTER_ID);
    expect(after.actionsUsed).toBe(0);
    expect(after.character.trust).toBe(-35);
    expect(after.chronicleNewestFirst[0].type).toBe('intention');
    expect(errCode(() => svc.setIntention(PRACTICE_CHARACTER_ID, CONTROLLER_A, pm.epoch.id, 'embrace'))).toBe('INVALID_INPUT');
  });

  it('a new ownership epoch reopens the intention opportunity', () => {
    const { svc } = makeService();
    const pm = svc.getProfile(PRACTICE_CHARACTER_ID);
    svc.setIntention(PRACTICE_CHARACTER_ID, CONTROLLER_A, pm.epoch.id, 'embrace');
    const sync = svc.syncOwnership(PRACTICE_CHARACTER_ID, CONTROLLER_B);
    const fresh = svc.getProfile(PRACTICE_CHARACTER_ID);
    expect(fresh.epoch.intention).toBeNull();
    expect(sync.epochId).toBe(fresh.epoch.id);
    expect(svc.setIntention(PRACTICE_CHARACTER_ID, CONTROLLER_B, fresh.epoch.id, 'redeem').intention).toBe('redeem');
  });
});

describe('redemption becomes mechanics, not text', () => {
  it('a neutral Chog cannot intimidate; the feared name stays locked without earned notoriety', () => {
    const mutable = { iso: '2026-10-15T10:00:00.000Z' };
    const clock: Clock = { now: () => new Date(mutable.iso) };
    const db = seedPractice(clock.now());
    const char = db.characters.find(c => c.id === PRACTICE_CHARACTER_ID)!;
    char.trust = 0;
    char.notoriety = 0;
    char.supplies = 3;
    char.version = 0;
    const svc = new GameService(db, clock, () => {}, true);

    let sawLockedFearedName = false;
    let trustedChoiceSeen = false;
    for (let day = 0; day < 6; day++) {
      mutable.iso = `2026-10-${String(15 + day).padStart(2, '0')}T10:00:00.000Z`;
      let play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
      while (play.encounter && play.actionsUsed < 3) {
        if (play.encounter.templateId === 1) {
          const name = play.encounter.choices.find(c => c.id === 'name')!;
          expect(name.eligible).toBe(false);
          expect(name.lockReason).toContain('Needs notoriety 60');
          sawLockedFearedName = true;
        }
        if (play.encounter.templateId === 2) {
          trustedChoiceSeen = true;
        }
        const choice = pickChoice(play.encounter, true);
        svc.commitAction({
          characterId: PRACTICE_CHARACTER_ID,
          controller: CONTROLLER_A,
          instanceId: play.encounter.instanceId,
          choiceId: choice.id,
          expectedVersion: play.version,
          idempotencyKey: nextKey(),
        });
        play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
      }
    }
    expect(sawLockedFearedName).toBe(true);
    expect(trustedChoiceSeen).toBe(true);
    const finalTrust = svc.getProfile(PRACTICE_CHARACTER_ID).character.trust;
    expect(finalTrust).toBeGreaterThan(0);
  });
});

describe('storage persistence and namespace separation', () => {
  beforeEach(() => {
    clearPracticeDb();
  });

  it('practice progress survives a reload via isolated localStorage', () => {
    const clock = clockAt('2026-10-15T10:00:00.000Z');
    const svc = new GameService(seedPractice(clock.now()), clock, savePracticeDb, true);
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    const choice = pickChoice(play.encounter);
    svc.commitAction({
      characterId: PRACTICE_CHARACTER_ID,
      controller: CONTROLLER_A,
      instanceId: play.encounter!.instanceId,
      choiceId: choice.id,
      expectedVersion: play.version,
      idempotencyKey: nextKey(),
    });
    svc.syncOwnership(PRACTICE_CHARACTER_ID, CONTROLLER_B);

    const reloaded = loadPracticeDb(clock);
    const svc2 = new GameService(reloaded, clock, savePracticeDb, true);
    const pm = svc2.getProfile(PRACTICE_CHARACTER_ID);
    expect(pm.actionsUsed).toBe(1);
    expect(pm.epoch.controller).toBe(CONTROLLER_B);
    expect(pm.chronicleNewestFirst).toHaveLength(6);
  });

  it('uses a practice-only storage key and identity namespace', () => {
    expect(PRACTICE_STORAGE_KEY).toContain('practice');
    expect(PRACTICE_CHARACTER_ID.startsWith('practice-local|')).toBe(true);
    expect(PRACTICE_CHARACTER_ID).not.toMatch(/^mainnet/);
  });

  it('reset reseeds a clean villain', () => {
    const clock = clockAt('2026-10-15T10:00:00.000Z');
    const svc = new GameService(seedPractice(clock.now()), clock, savePracticeDb, true);
    const play = svc.getPlay(PRACTICE_CHARACTER_ID, CONTROLLER_A);
    svc.commitAction({
      characterId: PRACTICE_CHARACTER_ID,
      controller: CONTROLLER_A,
      instanceId: play.encounter!.instanceId,
      choiceId: pickChoice(play.encounter).id,
      expectedVersion: play.version,
      idempotencyKey: nextKey(),
    });
    clearPracticeDb();
    const fresh = new GameService(loadPracticeDb(clock), clock, savePracticeDb, true);
    const pm = fresh.getProfile(PRACTICE_CHARACTER_ID);
    expect(pm.actionsUsed).toBe(0);
    expect(pm.character.trust).toBe(-35);
    expect(pm.epoch.controller).toBe(CONTROLLER_A);
    expect(pm.chronicleNewestFirst).toHaveLength(4);
  });
});
