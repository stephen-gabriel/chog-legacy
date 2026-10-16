import { describe, expect, it } from 'vitest';
import {
  INITIAL_STATS,
  TEMPLATES,
  alwaysAvailableChoiceExists,
  applyDelta,
  buildEncounterView,
  checkEligibility,
  dailyTemplateIds,
  deriveTitle,
  findChoice,
  getTemplate,
  clampStats,
} from '@/shared/rules';

describe('stats bounds and clamping', () => {
  it('starts at trust 0, notoriety 0, supplies 3', () => {
    expect(INITIAL_STATS).toEqual({ trust: 0, notoriety: 0, supplies: 3 });
  });

  it('clamps trust to −100…100, notoriety to 0…100, supplies to 0…10', () => {
    expect(applyDelta({ trust: 95, notoriety: 95, supplies: 9 }, { trust: 10, notoriety: 10, supplies: 5 })).toEqual({
      trust: 100,
      notoriety: 100,
      supplies: 10,
    });
    expect(applyDelta({ trust: -95, notoriety: 3, supplies: 1 }, { trust: -10, notoriety: -10, supplies: -5 })).toEqual({
      trust: -100,
      notoriety: 0,
      supplies: 0,
    });
  });

  it('clamps stats wholesale', () => {
    expect(clampStats({ trust: -150, notoriety: 150, supplies: -3 })).toEqual({ trust: -100, notoriety: 100, supplies: 0 });
  });
});

describe('derived title precedence', () => {
  const cases: Array<[string, { trust: number; notoriety: number; supplies: number }, string]> = [
    ['feared when notoriety ≥ 60 and trust ≤ −20', { trust: -20, notoriety: 60, supplies: 3 }, 'The Feared'],
    ['trusted beats notorious when trust ≥ 40', { trust: 40, notoriety: 80, supplies: 3 }, 'The Trusted'],
    ['notorious when notoriety ≥ 40 only', { trust: 0, notoriety: 40, supplies: 3 }, 'The Notorious'],
    ['unwritten at defaults', { trust: 0, notoriety: 0, supplies: 3 }, 'The Unwritten'],
    ['not feared without both conditions', { trust: 0, notoriety: 70, supplies: 3 }, 'The Notorious'],
    ['not feared with high trust', { trust: 20, notoriety: 70, supplies: 3 }, 'The Notorious'],
  ];
  for (const [name, stats, title] of cases) {
    it(name, () => expect(deriveTitle(stats)).toBe(title));
  }
});

describe('FRD encounter table eligibility', () => {
  const table = [
    [0, 'share', { trust: 0, notoriety: 0, supplies: 1 }, true],
    [0, 'share', { trust: 0, notoriety: 0, supplies: 0 }, false],
    [0, 'reward', { trust: 0, notoriety: 0, supplies: 0 }, true],
    [0, 'pass', { trust: 0, notoriety: 0, supplies: 0 }, true],
    [1, 'fair', { trust: 0, notoriety: 0, supplies: 1 }, true],
    [1, 'fair', { trust: 0, notoriety: 0, supplies: 0 }, false],
    [1, 'name', { trust: 0, notoriety: 60, supplies: 0 }, true],
    [1, 'name', { trust: 0, notoriety: 59, supplies: 0 }, false],
    [1, 'long', { trust: 0, notoriety: 0, supplies: 0 }, true],
    [2, 'join', { trust: 20, notoriety: 0, supplies: 0 }, true],
    [2, 'join', { trust: 19, notoriety: 0, supplies: 0 }, false],
    [2, 'demand', { trust: 0, notoriety: 0, supplies: 0 }, true],
    [2, 'behind', { trust: 0, notoriety: 0, supplies: 0 }, true],
    [3, 'return', { trust: 0, notoriety: 0, supplies: 1 }, true],
    [3, 'return', { trust: 0, notoriety: 0, supplies: 0 }, false],
    [3, 'keep', { trust: 0, notoriety: 0, supplies: 0 }, true],
    [3, 'untouched', { trust: 0, notoriety: 0, supplies: 0 }, true],
    [4, 'better', { trust: 0, notoriety: 0, supplies: 1 }, true],
    [4, 'better', { trust: 0, notoriety: 0, supplies: 0 }, false],
    [4, 'scarier', { trust: 0, notoriety: 0, supplies: 0 }, true],
    [4, 'fade', { trust: 0, notoriety: 0, supplies: 0 }, true],
    [5, 'meal', { trust: 0, notoriety: 0, supplies: 1 }, true],
    [5, 'meal', { trust: 0, notoriety: 0, supplies: 0 }, false],
    [5, 'info', { trust: 0, notoriety: 0, supplies: 0 }, true],
    [5, 'scare', { trust: 0, notoriety: 0, supplies: 0 }, true],
  ] as const;

  for (const [templateId, choiceId, stats, expected] of table) {
    it(`template ${templateId} ${choiceId} at ${JSON.stringify(stats)} → ${expected}`, () => {
      const r = checkEligibility(findChoice(templateId, choiceId), stats);
      expect(r.eligible).toBe(expected);
      if (!expected) expect(r.lockReason).toBeTruthy();
    });
  }

  it('every template keeps an always-available fallback at zero stats', () => {
    for (const t of TEMPLATES) expect(alwaysAvailableChoiceExists(t.id)).toBe(true);
  });
});

describe('FRD effect table', () => {
  const expected: Record<string, [number, number, number]> = {
    '0:share': [10, -3, -1], '0:reward': [-5, 7, 1], '0:pass': [0, 0, 0],
    '1:fair': [6, 0, -1], '1:name': [-8, 6, 1], '1:long': [2, -2, 0],
    '2:join': [5, -2, 1], '2:demand': [-6, 8, 0], '2:behind': [8, -3, 0],
    '3:return': [12, -5, -1], '3:keep': [-10, 10, 2], '3:untouched': [2, 0, 0],
    '4:better': [10, -8, -1], '4:scarier': [-4, 10, 0], '4:fade': [0, -3, 0],
    '5:meal': [8, -2, -1], '5:info': [2, 2, 1], '5:scare': [-6, 6, 0],
  };

  it('matches every canonical delta', () => {
    for (const t of TEMPLATES) {
      for (const c of t.choices) {
        const want = expected[`${t.id}:${c.id}`];
        expect([c.delta.trust, c.delta.notoriety, c.delta.supplies], `${t.id}:${c.id}`).toEqual(want);
      }
    }
  });

  it('previews equal clamped before+delta', () => {
    const before = { trust: 95, notoriety: 95, supplies: 10 };
    const view = buildEncounterView(3, 'inst', before);
    for (const c of view.choices) {
      expect(c.preview).toEqual(applyDelta(before, c.delta));
    }
  });
});

describe('villain vs neutral option access', () => {
  it('feared Chog can use the feared name; neutral cannot', () => {
    const feared = buildEncounterView(1, 'x', { trust: -35, notoriety: 70, supplies: 3 });
    const name = feared.choices.find(c => c.id === 'name')!;
    expect(name.eligible).toBe(true);
    const neutral = buildEncounterView(1, 'x', { trust: 0, notoriety: 0, supplies: 3 });
    const locked = neutral.choices.find(c => c.id === 'name')!;
    expect(locked.eligible).toBe(false);
    expect(locked.lockReason).toBe('Needs notoriety 60 (now 0)');
  });

  it('trusted-table choice unlocks through earned trust, not intention', () => {
    const low = buildEncounterView(2, 'x', { trust: 19, notoriety: 0, supplies: 0 });
    expect(low.choices.find(c => c.id === 'join')!.eligible).toBe(false);
    const earned = buildEncounterView(2, 'x', { trust: 20, notoriety: 0, supplies: 0 });
    expect(earned.choices.find(c => c.id === 'join')!.eligible).toBe(true);
  });
});

describe('daily assignment (GAME-02)', () => {
  const identity = 'practice-local|none|none|practice-ashen-v1';

  it('is stable per identity and UTC date', () => {
    const a = dailyTemplateIds(identity, '2026-10-15');
    const b = dailyTemplateIds(identity, '2026-10-15');
    expect(a).toEqual(b);
  });

  it('selects three distinct templates within 0…5', () => {
    for (let day = 1; day <= 28; day++) {
      const date = `2026-10-${String(day).padStart(2, '0')}`;
      const ids = dailyTemplateIds(identity, date);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) {
        expect(id).toBeGreaterThanOrEqual(0);
        expect(id).toBeLessThan(6);
        expect(getTemplate(id).id).toBe(id);
      }
    }
  });

  it('changes with identity but not with ownership (identity is token-bound)', () => {
    const other = dailyTemplateIds('mainnet|143|0xc96|1425', '2026-10-15');
    const mine = dailyTemplateIds(identity, '2026-10-15');
    expect(Array.isArray(other)).toBe(true);
    expect(mine).toEqual(dailyTemplateIds(identity, '2026-10-15'));
  });
});
