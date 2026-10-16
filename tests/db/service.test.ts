import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { AppError } from '../../src/server/errors';
import { DAILY_ACTIONS, checkEligibility, dailyTemplateIds, getTemplate, utcDateOf } from '../../src/shared/rules';
import {
  activateTx,
  canonicalId,
  commitActionTx,
  getPlayState,
  setIntentionTx,
  syncOwnershipTx,
  type Identity,
} from '../../server/game/service';
import { createCleanPool, gateDb } from './helpers';

const gate = gateDb();
const BLOCK_REASON = gate.reason ?? 'unknown';

const ID: Identity = {
  namespace: 'chog-mainnet',
  chainId: 143,
  contract: '0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763',
  tokenId: '1425',
};
const WALLET_A = '0x601634f3d0746b550e68439286c1ad022a5f2b88';
const WALLET_B = '0x99891b613b6b5e64cd8a245372fdc858181f7cf0';
const NOW = new Date('2026-10-15T10:00:00.000Z');
const NEXT_DAY = new Date('2026-10-16T10:00:00.000Z');

function codeOf(e: unknown): string {
  return e instanceof AppError ? e.code : `NOT_APP_ERROR:${String(e)}`;
}

function rejectsWith(p: Promise<unknown>, code: string): Promise<void> {
  return expect(p).rejects.toSatisfy((e: unknown) => codeOf(e) === code);
}

function alwaysAvailableChoice(templateId: number): string {
  const c = getTemplate(templateId).choices.find(x => !x.requires);
  if (!c) throw new Error(`template ${templateId} has no always-available choice`);
  return c.id;
}

function slotInstance(characterId: string, date: string, slot: number): string {
  return `${characterId}#${date}#${slot}`;
}

interface CommitAttempt {
  receipt: Awaited<ReturnType<typeof commitActionTx>>;
  instanceId: string;
  choiceId: string;
  expectedVersion: number;
}

async function freshCommit(
  pool: Pool,
  ident: Identity,
  characterId: string,
  controller: string,
  now: Date,
  idempotencyKey: string,
): Promise<CommitAttempt> {
  const st = await getPlayState(pool, characterId, controller, now);
  const date = utcDateOf(now);
  let instanceId: string;
  let templateId: number;
  if (st.encounter) {
    instanceId = st.encounter.instanceId;
    templateId = st.encounter.templateId;
  } else {
    instanceId = slotInstance(characterId, date, 0);
    templateId = dailyTemplateIds(canonicalId(ident), date)[0];
  }
  const choiceId = alwaysAvailableChoice(templateId);
  const expectedVersion = st.version;
  const receipt = await commitActionTx(pool, {
    characterId,
    controller,
    instanceId,
    choiceId,
    expectedVersion,
    idempotencyKey,
    now,
  });
  return { receipt, instanceId, choiceId, expectedVersion };
}

describe.runIf(gate.ok)('postgres game service (real database)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = await createCleanPool(gate.url!);
  }, 30_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('activation creates a neutral character with one ownership epoch and an activation event', async () => {
    const res = await activateTx(pool, ID, WALLET_A, 101_000_000, NOW);
    expect(res.created).toBe(true);
    expect(res.controller).toBe(WALLET_A);
    const { rows } = await pool.query('SELECT trust, notoriety, supplies, version FROM characters WHERE id = $1', [res.characterId]);
    expect(rows[0]).toMatchObject({ trust: 0, notoriety: 0, supplies: 3, version: 0 });
    const { rows: epochs } = await pool.query('SELECT * FROM ownership_epochs WHERE character_id = $1', [res.characterId]);
    expect(epochs).toHaveLength(1);
    expect(epochs[0].intention).toBeNull();
    const { rows: events } = await pool.query('SELECT type FROM game_events WHERE character_id = $1', [res.characterId]);
    expect(events.map(e => e.type)).toEqual(['ownership']);
  });

  it('re-activation by the same owner does not open a second epoch', async () => {
    const ident = { ...ID, tokenId: '476' };
    const first = await activateTx(pool, ident, WALLET_A, 101_000_001, NOW);
    const second = await activateTx(pool, ident, WALLET_A, 101_000_002, NOW);
    expect(second.created).toBe(false);
    expect(second.epochId).toBe(first.epochId);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM ownership_epochs WHERE character_id = $1', [first.characterId]);
    expect(rows[0].n).toBe(1);
  });

  it('commits an action atomically: stats, budget, event, receipt and version move together', async () => {
    const { characterId } = await activateTx(pool, ID, WALLET_A, 101_000_000, NOW);
    const { receipt } = await freshCommit(pool, ID, characterId, WALLET_A, NOW, 'happy-0001');
    expect(receipt.before).toEqual({ trust: 0, notoriety: 0, supplies: 3 });
    expect(receipt.actionsUsed).toBe(1);
    expect(receipt.left).toBe(DAILY_ACTIONS - 1);
    expect(receipt.version).toBe(1);

    const { rows: chars } = await pool.query('SELECT trust, notoriety, supplies, version FROM characters WHERE id = $1', [characterId]);
    expect(chars[0].version).toBe(1);
    expect({ trust: chars[0].trust, notoriety: chars[0].notoriety, supplies: chars[0].supplies }).toEqual(receipt.after);

    const { rows: budget } = await pool.query('SELECT used FROM daily_budgets WHERE character_id = $1 AND utc_date = $2', [characterId, utcDateOf(NOW)]);
    expect(budget[0].used).toBe(1);

    const { rows: events } = await pool.query('SELECT type FROM game_events WHERE character_id = $1 ORDER BY sequence', [characterId]);
    expect(events.map(e => e.type)).toEqual(['ownership', 'game']);

    const { rows: receipts } = await pool.query('SELECT request_hash FROM action_receipts WHERE character_id = $1', [characterId]);
    expect(receipts).toHaveLength(1);
  });

  it('two concurrent commits with the same expected version: exactly one wins, the other sees STATE_CHANGED', async () => {
    const ident = { ...ID, tokenId: '1' };
    const { characterId } = await activateTx(pool, ident, WALLET_A, 101_000_010, NOW);
    const st = await getPlayState(pool, characterId, WALLET_A, NOW);
    const base = {
      characterId,
      controller: WALLET_A,
      instanceId: slotInstance(characterId, utcDateOf(NOW), 0),
      choiceId: alwaysAvailableChoice(st.encounter!.templateId),
      expectedVersion: st.version,
      now: NOW,
    };
    const results = await Promise.allSettled([
      commitActionTx(pool, { ...base, idempotencyKey: 'race-aaaa-1' }),
      commitActionTx(pool, { ...base, idempotencyKey: 'race-bbbb-2' }),
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(codeOf(rejected[0].reason)).toBe('STATE_CHANGED');
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM game_events WHERE character_id = $1 AND type = 'game'", [characterId]);
    expect(rows[0].n).toBe(1);
  });

  it('idempotent retry returns the stored receipt without reapplying state', async () => {
    const ident = { ...ID, tokenId: '2' };
    const { characterId } = await activateTx(pool, ident, WALLET_A, 101_000_020, NOW);
    const first = await freshCommit(pool, ident, characterId, WALLET_A, NOW, 'idem-0001');
    const duplicate = await commitActionTx(pool, {
      characterId,
      controller: WALLET_A,
      instanceId: first.instanceId,
      choiceId: first.choiceId,
      expectedVersion: first.expectedVersion,
      idempotencyKey: 'idem-0001',
      now: NOW,
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.eventId).toBe(first.receipt.eventId);
    expect(duplicate.after).toEqual(first.receipt.after);
    expect(duplicate.version).toBe(first.receipt.version);
    const { rows: budget } = await pool.query('SELECT used FROM daily_budgets WHERE character_id = $1 AND utc_date = $2', [characterId, utcDateOf(NOW)]);
    expect(budget[0].used).toBe(1);
    const { rows: events } = await pool.query("SELECT COUNT(*)::int AS n FROM game_events WHERE character_id = $1 AND type = 'game'", [characterId]);
    expect(events[0].n).toBe(1);
  });

  it('parallel duplicate submits with one idempotency key apply exactly once', async () => {
    const ident = { ...ID, tokenId: '3' };
    const { characterId } = await activateTx(pool, ident, WALLET_A, 101_000_030, NOW);
    const st = await getPlayState(pool, characterId, WALLET_A, NOW);
    const base = {
      characterId,
      controller: WALLET_A,
      instanceId: slotInstance(characterId, utcDateOf(NOW), 0),
      choiceId: alwaysAvailableChoice(st.encounter!.templateId),
      expectedVersion: st.version,
      now: NOW,
    };
    const results = await Promise.allSettled([
      commitActionTx(pool, { ...base, idempotencyKey: 'dup-key-01' }),
      commitActionTx(pool, { ...base, idempotencyKey: 'dup-key-01' }),
    ]);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    const applied = results.filter(r => r.status === 'fulfilled' && !r.value.duplicate);
    expect(applied).toHaveLength(1);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM game_events WHERE character_id = $1 AND type = 'game'", [characterId]);
    expect(rows[0].n).toBe(1);
    const { rows: budget } = await pool.query('SELECT used FROM daily_budgets WHERE character_id = $1 AND utc_date = $2', [characterId, utcDateOf(NOW)]);
    expect(budget[0].used).toBe(1);
  });

  it('daily quota: three actions succeed, the fourth fails with DAILY_LIMIT, and the next UTC day resets', async () => {
    const ident = { ...ID, tokenId: '4' };
    const { characterId } = await activateTx(pool, ident, WALLET_A, 101_000_040, NOW);
    for (let i = 0; i < DAILY_ACTIONS; i++) {
      const { receipt } = await freshCommit(pool, ident, characterId, WALLET_A, NOW, `quota-day1-${i}`);
      expect(receipt.actionsUsed).toBe(i + 1);
    }
    const st = await getPlayState(pool, characterId, WALLET_A, NOW);
    expect(st.actionsUsed).toBe(DAILY_ACTIONS);
    expect(st.encounter).toBeNull();

    await rejectsWith(
      commitActionTx(pool, {
        characterId,
        controller: WALLET_A,
        instanceId: slotInstance(characterId, utcDateOf(NOW), 0),
        choiceId: alwaysAvailableChoice(dailyTemplateIds(canonicalId(ident), utcDateOf(NOW))[0]),
        expectedVersion: st.version,
        idempotencyKey: 'quota-day1-limit',
        now: NOW,
      }),
      'DAILY_LIMIT',
    );

    const next = await freshCommit(pool, ident, characterId, WALLET_A, NEXT_DAY, 'quota-day2-0');
    expect(next.receipt.actionsUsed).toBe(1);
    const { rows: budget2 } = await pool.query('SELECT used FROM daily_budgets WHERE character_id = $1 AND utc_date = $2', [characterId, utcDateOf(NEXT_DAY)]);
    expect(budget2[0].used).toBe(1);
  });

  it('stale expected version fails with STATE_CHANGED and changes nothing', async () => {
    const ident = { ...ID, tokenId: '5' };
    const { characterId } = await activateTx(pool, ident, WALLET_A, 101_000_050, NOW);
    const first = await freshCommit(pool, ident, characterId, WALLET_A, NOW, 'stale-0001');
    await rejectsWith(
      commitActionTx(pool, {
        characterId,
        controller: WALLET_A,
        instanceId: first.instanceId,
        choiceId: first.choiceId,
        expectedVersion: first.expectedVersion,
        idempotencyKey: 'stale-0002',
        now: NOW,
      }),
      'STATE_CHANGED',
    );
    const { rows } = await pool.query('SELECT version FROM characters WHERE id = $1', [characterId]);
    expect(rows[0].version).toBe(first.receipt.version);
    const { rows: budget } = await pool.query('SELECT used FROM daily_budgets WHERE character_id = $1 AND utc_date = $2', [characterId, utcDateOf(NOW)]);
    expect(budget[0].used).toBe(1);
  });

  it('a failure after apply rolls everything back: no stats, budget, events or receipt persist', async () => {
    const ident = { ...ID, tokenId: '6' };
    const { characterId } = await activateTx(pool, ident, WALLET_A, 101_000_060, NOW);
    const st = await getPlayState(pool, characterId, WALLET_A, NOW);
    await rejectsWith(
      commitActionTx(
        pool,
        {
          characterId,
          controller: WALLET_A,
          instanceId: slotInstance(characterId, utcDateOf(NOW), 0),
          choiceId: alwaysAvailableChoice(st.encounter!.templateId),
          expectedVersion: st.version,
          idempotencyKey: 'rollback-01',
          now: NOW,
        },
        { failAfterApply: true },
      ),
      'STORAGE_UNAVAILABLE',
    );

    const { rows: chars } = await pool.query('SELECT version FROM characters WHERE id = $1', [characterId]);
    expect(chars[0].version).toBe(st.version);
    const { rows: budget } = await pool.query('SELECT used FROM daily_budgets WHERE character_id = $1 AND utc_date = $2', [characterId, utcDateOf(NOW)]);
    expect(budget).toHaveLength(1);
    expect(budget[0].used).toBe(0);
    const { rows: events } = await pool.query("SELECT COUNT(*)::int AS n FROM game_events WHERE character_id = $1 AND type = 'game'", [characterId]);
    expect(events[0].n).toBe(0);
    const { rows: receipts } = await pool.query('SELECT COUNT(*)::int AS n FROM action_receipts WHERE character_id = $1', [characterId]);
    expect(receipts[0].n).toBe(0);

    const retry = await freshCommit(pool, ident, characterId, WALLET_A, NOW, 'rollback-01');
    expect(retry.receipt.duplicate).toBeUndefined();
    expect(retry.receipt.actionsUsed).toBe(1);
  });

  it('ownership transfer preserves stats, history and quota; the old controller is rejected', async () => {
    const ident = { ...ID, tokenId: '7' };
    const { characterId } = await activateTx(pool, ident, WALLET_A, 101_000_070, NOW);
    const first = await freshCommit(pool, ident, characterId, WALLET_A, NOW, 'transfer-0001');
    const before = first.receipt.after;

    const sync = await syncOwnershipTx(pool, ident, WALLET_B, 101_000_080, NOW);
    expect(sync.changed).toBe(true);
    expect(sync.controller).toBe(WALLET_B);

    const { rows: epochs } = await pool.query(
      'SELECT controller_wallet, observed_end FROM ownership_epochs WHERE character_id = $1 ORDER BY observed_start',
      [characterId],
    );
    expect(epochs).toHaveLength(2);
    expect(epochs[0].observed_end).not.toBeNull();
    expect(epochs[1].observed_end).toBeNull();

    const stAfter = await getPlayState(pool, characterId, WALLET_B, NOW);
    expect(stAfter.stats).toEqual(before);
    expect(stAfter.actionsUsed).toBe(1);
    expect(stAfter.intention).toBeNull();

    await rejectsWith(
      commitActionTx(pool, {
        characterId,
        controller: WALLET_A,
        instanceId: slotInstance(characterId, utcDateOf(NOW), 1),
        choiceId: alwaysAvailableChoice(dailyTemplateIds(canonicalId(ident), utcDateOf(NOW))[1]),
        expectedVersion: stAfter.version,
        idempotencyKey: 'transfer-old',
        now: NOW,
      }),
      'NOT_CURRENT_OWNER',
    );

    const next = await freshCommit(pool, ident, characterId, WALLET_B, NOW, 'transfer-0002');
    expect(next.receipt.before).toEqual(before);

    const { rows: events } = await pool.query('SELECT type, actor_wallet FROM game_events WHERE character_id = $1 ORDER BY sequence', [characterId]);
    expect(events.map(e => e.type)).toEqual(['ownership', 'game', 'ownership', 'game']);
    expect(events[1].actor_wallet).toBe(WALLET_A);
    expect(events[3].actor_wallet).toBe(WALLET_B);
  });

  it('intention can be set once per epoch and never overwritten', async () => {
    const ident = { ...ID, tokenId: '8' };
    const { characterId } = await activateTx(pool, ident, WALLET_A, 101_000_090, NOW);
    const set = await setIntentionTx(pool, characterId, WALLET_A, 'redeem', 101_000_091, NOW);
    expect(set.intention).toBe('redeem');
    await rejectsWith(setIntentionTx(pool, characterId, WALLET_A, 'embrace', 101_000_092, NOW), 'INVALID_INPUT');
    const { rows } = await pool.query('SELECT intention FROM ownership_epochs WHERE id = $1', [set.epochId]);
    expect(rows[0].intention).toBe('redeem');
    const { rows: events } = await pool.query("SELECT COUNT(*)::int AS n FROM game_events WHERE character_id = $1 AND type = 'intention'", [characterId]);
    expect(events[0].n).toBe(1);
  });

  it('a locked choice fails with CHOICE_UNAVAILABLE instead of applying', async () => {
    const ident = { ...ID, tokenId: '9' };
    const { characterId } = await activateTx(pool, ident, WALLET_A, 101_000_100, NOW);
    const st = await getPlayState(pool, characterId, WALLET_A, NOW);
    const t = getTemplate(st.encounter!.templateId);
    const locked = t.choices.find(c => c.requires && !checkEligibility(c, st.stats).eligible);
    if (!locked) return;
    await rejectsWith(
      commitActionTx(pool, {
        characterId,
        controller: WALLET_A,
        instanceId: slotInstance(characterId, utcDateOf(NOW), 0),
        choiceId: locked.id,
        expectedVersion: st.version,
        idempotencyKey: 'locked-0001',
        now: NOW,
      }),
      'CHOICE_UNAVAILABLE',
    );
    const { rows } = await pool.query('SELECT version FROM characters WHERE id = $1', [characterId]);
    expect(rows[0].version).toBe(st.version);
  });

  it('namespace isolation: same chain identity in another namespace is a different character', async () => {
    const a = await activateTx(pool, ID, WALLET_A, 101_000_110, NOW);
    const b = await activateTx(pool, { ...ID, namespace: 'chog-alt-ns' }, WALLET_B, 101_000_111, NOW);
    expect(b.characterId).not.toBe(a.characterId);
    await freshCommit(pool, ID, a.characterId, WALLET_A, NOW, 'ns-a-0001');
    const stB = await getPlayState(pool, b.characterId, WALLET_B, NOW);
    expect(stB.stats).toEqual({ trust: 0, notoriety: 0, supplies: 3 });
    expect(stB.actionsUsed).toBe(0);
    expect(stB.version).toBe(0);
  });

  it('an unknown instance id fails with INVALID_INPUT', async () => {
    const ident = { ...ID, tokenId: '10' };
    const { characterId } = await activateTx(pool, ident, WALLET_A, 101_000_120, NOW);
    const st = await getPlayState(pool, characterId, WALLET_A, NOW);
    await rejectsWith(
      commitActionTx(pool, {
        characterId,
        controller: WALLET_A,
        instanceId: 'not-a-real-instance',
        choiceId: 'pass',
        expectedVersion: st.version,
        idempotencyKey: 'unknown-inst',
        now: NOW,
      }),
      'INVALID_INPUT',
    );
  });
});

describe('postgres test database gate (always runs)', () => {
  it('refuses missing, non-postgres and non-test databases, and accepts a test url', () => {
    expect(gateDb({}).ok).toBe(false);
    expect(gateDb({ DATABASE_URL_TEST: 'mysql://localhost/chog_test' }).ok).toBe(false);
    expect(gateDb({ DATABASE_URL_TEST: 'postgres://user:pass@localhost/chog_prod' }).ok).toBe(false);
    expect(gateDb({ DATABASE_URL_TEST: 'not a url' }).ok).toBe(false);
    expect(gateDb({ DATABASE_URL_TEST: 'postgres://user:pass@localhost:5432/chog_test' }).ok).toBe(true);
    if (!gate.ok) console.warn(`BLOCKED: ${BLOCK_REASON}`);
    expect(typeof gate.ok).toBe('boolean');
  });
});
