import type { Pool, PoolClient } from 'pg';
import {
  DAILY_ACTIONS,
  INITIAL_STATS,
  RULESET_VERSION,
  applyDelta,
  consequenceForChoice,
  courierChoices,
  courierSituation,
  dailyTemplateIds,
  deriveTitle,
  findChoice,
  checkEligibility,
  nextUtcMidnight,
  utcDateOf,
} from '../../src/shared/rules';
import type { ChoiceDef, ConsequenceState, Stats, StoryFlags, StorySituation, Title } from '../../src/shared/rules';
import { AppError } from '../../src/server/errors';
import { canonicalIdentity, hashRequest } from '../../src/server/service';

export interface Identity {
  namespace: string;
  chainId: number | null;
  contract: string | null;
  tokenId: string;
}

export interface CharacterRow {
  id: string;
  namespace: string;
  chain_id: string | number | null;
  contract: string | null;
  token_id: string;
  trust: number;
  notoriety: number;
  supplies: number;
  version: number;
  active_epoch_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EpochRow {
  id: string;
  character_id: string;
  controller_wallet: string;
  observed_start: Date;
  observed_end: Date | null;
  verification_block: string | number | null;
  intention: 'embrace' | 'redeem' | null;
}

export interface PgActionRequest {
  characterId: string;
  controller: string;
  instanceId: string;
  choiceId: string;
  expectedVersion: number;
  idempotencyKey: string;
  verificationBlock?: number | null;
  now?: Date;
}

export interface PgCommitReceipt {
  receiptId: string;
  eventId: string;
  before: Stats;
  after: Stats;
  titleBefore: string;
  titleAfter: string;
  label: string;
  text: string;
  actionsUsed: number;
  left: number;
  nextResetUtc: string;
  version: number;
  duplicate?: boolean;
  consequence?: ConsequenceState | null;
  obligationClosed?: ConsequenceState | null;
}

export interface ConsequenceRow {
  id: string;
  character_id: string;
  kind: ConsequenceState['kind'];
  status: ConsequenceState['status'];
  opened_sequence: number;
  origin_template_id: number | null;
  origin_choice_id: string | null;
  closed_event_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SyncResult {
  changed: boolean;
  epochId: string;
  controller: string;
}

export function identityKey(id: Identity): { namespace: string; chainId: number | null; contract: string | null; tokenId: string } {
  return {
    namespace: id.namespace,
    chainId: id.chainId,
    contract: id.contract ? id.contract.toLowerCase() : null,
    tokenId: id.tokenId,
  };
}

export function canonicalId(id: Identity): string {
  return canonicalIdentity({
    namespace: id.namespace,
    chainId: id.chainId,
    contract: id.contract,
    tokenId: id.tokenId,
  });
}

const CHAR_COLUMNS = 'id, namespace, chain_id, contract, token_id, trust, notoriety, supplies, version, active_epoch_id, created_at, updated_at';

function toStats(row: Pick<CharacterRow, 'trust' | 'notoriety' | 'supplies'>): Stats {
  return { trust: row.trust, notoriety: row.notoriety, supplies: row.supplies };
}

async function lockCharacter(client: PoolClient, characterId: string): Promise<CharacterRow> {
  const { rows } = await client.query<CharacterRow>(`SELECT ${CHAR_COLUMNS} FROM characters WHERE id = $1 FOR UPDATE`, [characterId]);
  if (rows.length === 0) throw new AppError('INVALID_INPUT', 'Unknown character');
  return rows[0];
}

async function lockActiveEpoch(client: PoolClient, character: CharacterRow): Promise<EpochRow> {
  if (!character.active_epoch_id) throw new AppError('STORAGE_UNAVAILABLE', 'Character has no active ownership epoch');
  const { rows } = await client.query<EpochRow>('SELECT * FROM ownership_epochs WHERE id = $1', [character.active_epoch_id]);
  if (rows.length === 0) throw new AppError('STORAGE_UNAVAILABLE', 'Active ownership epoch missing');
  return rows[0];
}

function requireController(epoch: EpochRow, controller: string): void {
  if (epoch.controller_wallet.toLowerCase() !== controller.trim().toLowerCase()) {
    throw new AppError('NOT_CURRENT_OWNER');
  }
}

async function nextSequence(client: PoolClient, characterId: string): Promise<number> {
  const { rows } = await client.query<{ next: string }>(
    'SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM game_events WHERE character_id = $1',
    [characterId],
  );
  return Number(rows[0].next);
}

async function appendEvent(
  client: PoolClient,
  character: CharacterRow,
  epochId: string,
  args: {
    actor: string;
    type: 'game' | 'ownership' | 'intention';
    text: string;
    before: Stats;
    after: Stats;
    templateId?: number | null;
    choiceId?: string | null;
    verificationBlock?: number | null;
    now: Date;
  },
): Promise<{ id: string; sequence: number }> {
  const sequence = await nextSequence(client, character.id);
  const { rows } = await client.query<{ id: string; sequence: number }>(
    `INSERT INTO game_events (
      character_id, epoch_id, actor_wallet, sequence, type, template_id, choice_id,
      ruleset_version, text, before_state, after_state, title_before, title_after, verification_block, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING id, sequence`,
    [
      character.id,
      epochId,
      args.actor,
      sequence,
      args.type,
      args.templateId ?? null,
      args.choiceId ?? null,
      RULESET_VERSION,
      args.text,
      JSON.stringify(args.before),
      JSON.stringify(args.after),
      deriveTitle(args.before),
      deriveTitle(args.after),
      args.verificationBlock ?? null,
      args.now.toISOString(),
    ],
  );
  return rows[0];
}

export async function applyOwnershipSync(
  client: PoolClient,
  character: CharacterRow,
  observedController: string,
  verificationBlock: number | null,
  now: Date,
): Promise<SyncResult> {
  const current = await lockActiveEpoch(client, character);
  const normalized = observedController.trim().toLowerCase();
  if (!normalized) throw new AppError('INVALID_INPUT', 'Controller wallet required');
  if (current.controller_wallet.toLowerCase() === normalized) {
    return { changed: false, epochId: current.id, controller: current.controller_wallet };
  }
  await client.query('UPDATE ownership_epochs SET observed_end = $1 WHERE id = $2', [now.toISOString(), current.id]);
  const { rows: epochRows } = await client.query<{ id: string; controller_wallet: string }>(
    `INSERT INTO ownership_epochs (character_id, controller_wallet, observed_start, verification_block)
     VALUES ($1,$2,$3,$4) RETURNING id, controller_wallet`,
    [character.id, normalized, now.toISOString(), verificationBlock],
  );
  const epoch = epochRows[0];
  await client.query('UPDATE characters SET active_epoch_id = $1, version = version + 1, updated_at = $2 WHERE id = $3', [
    epoch.id,
    now.toISOString(),
    character.id,
  ]);
  const before = toStats(character);
  await appendEvent(client, character, epoch.id, {
    actor: normalized,
    type: 'ownership',
    text: `Ownership observed. Controller is now ${normalized}. Stats, history and daily actions continue unchanged.`,
    before,
    after: before,
    verificationBlock,
    now,
  });
  return { changed: true, epochId: epoch.id, controller: epoch.controller_wallet };
}

async function loadConsequences(
  client: PoolClient | Pool,
  characterId: string,
): Promise<ConsequenceState[]> {
  const { rows } = await client.query<ConsequenceRow>(
    `SELECT id, character_id, kind, status, opened_sequence, origin_template_id, origin_choice_id, closed_event_id, created_at, updated_at
     FROM story_consequences WHERE character_id = $1 ORDER BY opened_sequence ASC, created_at ASC`,
    [characterId],
  );
  return rows.map(toConsequence);
}

function toConsequence(r: {
  kind: ConsequenceState['kind'];
  status: ConsequenceState['status'];
  opened_sequence: number;
  origin_template_id: number | null;
  origin_choice_id: string | null;
}): ConsequenceState {
  return {
    kind: r.kind,
    status: r.status,
    openedSequence: r.opened_sequence,
    originTemplateId: r.origin_template_id,
    originChoiceId: r.origin_choice_id,
  };
}

async function storyFlags(
  events: Array<{ sequence: number; created_at: string | Date }>,
  open: ConsequenceState[],
): Promise<StoryFlags> {
  const openConsequences = open.map(c => ({ ...c }));
  const openCourier = openConsequences
    .filter(c => (c.kind === 'courier_trust' || c.kind === 'tax_grudge') && c.status === 'open')
    .sort((a, b) => a.openedSequence - b.openedSequence)[0];
  let latestCourierOpenedAtDay: string | null = null;
  if (openCourier) {
    const ev = events.find(e => e.sequence === openCourier.openedSequence);
    if (ev) latestCourierOpenedAtDay = utcDateOf(new Date(ev.created_at));
  }
  return { openConsequences, latestCourierOpenedAtDay };
}

function nextPlayable(
  situation: StorySituation,
  instances: Array<{ id: string; template_id: number; resolved_event_id: string | null }>,
): { id: string; template_id: number } | null {
  const open = instances.filter(i => !i.resolved_event_id);
  if (open.length === 0) return null;
  if (situation === 'base') return open[0];
  const courier = open.find(i => i.template_id === 0);
  return courier ?? open[0];
}

async function ensureDay(
  client: PoolClient,
  character: CharacterRow,
  now: Date,
): Promise<{ used: number; date: string; instances: Array<{ id: string; template_id: number; slot: number; resolved_event_id: string | null }> }> {
  const date = utcDateOf(now);
  await client.query(
    `INSERT INTO daily_budgets (character_id, utc_date, used) VALUES ($1,$2,0)
     ON CONFLICT (character_id, utc_date) DO NOTHING`,
    [character.id, date],
  );
  const { rows: budgetRows } = await client.query<{ used: number }>(
    'SELECT used FROM daily_budgets WHERE character_id = $1 AND utc_date = $2 FOR UPDATE',
    [character.id, date],
  );
  const { rows: instances } = await client.query<{ id: string; template_id: number; slot: number; resolved_event_id: string | null }>(
    'SELECT id, template_id, slot, resolved_event_id FROM encounter_instances WHERE character_id = $1 AND utc_date = $2 ORDER BY slot',
    [character.id, date],
  );
  if (instances.length === 0) {
    const open = await loadConsequences(client, character.id);
    const events = await client.query<{ sequence: number; created_at: Date }>(
      'SELECT sequence, created_at FROM game_events WHERE character_id = $1 ORDER BY sequence ASC',
      [character.id],
    );
    const flags = await storyFlags(events.rows, open);
    const situation = courierSituation(flags, date);
    const ids = situation === 'courier_recalled' || situation === 'waystone_promise'
      ? [0, 0, 0]
      : dailyTemplateIds(
          canonicalId({ namespace: character.namespace, chainId: character.chain_id === null ? null : Number(character.chain_id), contract: character.contract, tokenId: character.token_id }),
          date,
        );
    for (let slot = 0; slot < ids.length; slot++) {
      const id = `${character.id}#${date}#${slot}`;
      await client.query(
        `INSERT INTO encounter_instances (id, character_id, utc_date, slot, template_id, ruleset_version)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, character.id, date, slot, ids[slot], RULESET_VERSION],
      );
      instances.push({ id, template_id: ids[slot], slot, resolved_event_id: null });
    }
    instances.sort((a, b) => a.slot - b.slot);
  }
  return { used: budgetRows[0].used, date, instances };
}

export async function findCharacterByIdentity(client: Pool | PoolClient, identity: Identity): Promise<CharacterRow | null> {
  const key = identityKey(identity);
  const { rows } = await client.query<CharacterRow>(
    `SELECT ${CHAR_COLUMNS} FROM characters
     WHERE namespace = $1 AND chain_id IS NOT DISTINCT FROM $2 AND contract IS NOT DISTINCT FROM $3 AND token_id = $4`,
    [key.namespace, key.chainId, key.contract, key.tokenId],
  );
  return rows[0] ?? null;
}

export interface ActivateResult {
  characterId: string;
  created: boolean;
  changed: boolean;
  epochId: string;
  controller: string;
  version: number;
}

export async function activateTx(
  pool: Pool,
  identity: Identity,
  wallet: string,
  verificationBlock: number | null,
  now: Date,
): Promise<ActivateResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const key = identityKey(identity);
    const existing = await findCharacterByIdentity(client, identity);
    if (existing) {
      const sync = await applyOwnershipSync(client, existing, wallet, verificationBlock, now);
      const { rows } = await client.query<CharacterRow>(`SELECT ${CHAR_COLUMNS} FROM characters WHERE id = $1`, [existing.id]);
      await client.query('COMMIT');
      return {
        characterId: existing.id,
        created: false,
        changed: sync.changed,
        epochId: sync.epochId,
        controller: sync.controller,
        version: rows[0].version,
      };
    }
    const { rows: charRows } = await client.query<CharacterRow>(
      `INSERT INTO characters (namespace, chain_id, contract, token_id, trust, notoriety, supplies, version, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$8)
       RETURNING ${CHAR_COLUMNS}`,
      [key.namespace, key.chainId, key.contract, key.tokenId, INITIAL_STATS.trust, INITIAL_STATS.notoriety, INITIAL_STATS.supplies, now.toISOString()],
    );
    const character = charRows[0];
    const { rows: epochRows } = await client.query<{ id: string; controller_wallet: string }>(
      `INSERT INTO ownership_epochs (character_id, controller_wallet, observed_start, verification_block)
       VALUES ($1,$2,$3,$4) RETURNING id, controller_wallet`,
      [character.id, wallet.trim().toLowerCase(), now.toISOString(), verificationBlock],
    );
    const epoch = epochRows[0];
    await client.query('UPDATE characters SET active_epoch_id = $1 WHERE id = $2', [epoch.id, character.id]);
    character.active_epoch_id = epoch.id;
    await appendEvent(client, character, epoch.id, {
      actor: epoch.controller_wallet,
      type: 'ownership',
      text: 'Character activated by the first verified owner. Stats start neutral: trust 0, notoriety 0, supplies 3.',
      before: toStats(character),
      after: toStats(character),
      verificationBlock,
      now,
    });
    await client.query('COMMIT');
    return {
      characterId: character.id,
      created: true,
      changed: true,
      epochId: epoch.id,
      controller: epoch.controller_wallet,
      version: 0,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (e instanceof AppError) throw e;
    throw new AppError('STORAGE_UNAVAILABLE', e instanceof Error ? e.message : String(e));
  } finally {
    client.release();
  }
}

export async function syncOwnershipTx(
  pool: Pool,
  identity: Identity,
  observedController: string,
  verificationBlock: number | null,
  now: Date,
): Promise<SyncResult & { characterId: string | null }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await findCharacterByIdentity(client, identity);
    if (!existing) {
      await client.query('COMMIT');
      return { changed: false, epochId: '', controller: observedController, characterId: null };
    }
    const locked = await lockCharacter(client, existing.id);
    const sync = await applyOwnershipSync(client, locked, observedController, verificationBlock, now);
    await client.query('COMMIT');
    return { ...sync, characterId: existing.id };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (e instanceof AppError) throw e;
    throw new AppError('STORAGE_UNAVAILABLE', e instanceof Error ? e.message : String(e));
  } finally {
    client.release();
  }
}

export async function commitActionTx(
  pool: Pool,
  req: PgActionRequest,
  opts?: { failAfterApply?: boolean; onLocked?: () => Promise<void> },
): Promise<PgCommitReceipt> {
  const client = await pool.connect();
  const now = req.now ?? new Date();
  try {
    await client.query('BEGIN');
    const character = await lockCharacter(client, req.characterId);
    const epoch = await lockActiveEpoch(client, character);
    requireController(epoch, req.controller);
    if (opts?.onLocked) await opts.onLocked();

    const actor = epoch.controller_wallet.toLowerCase();
    const requestHash = hashRequest({
      characterId: req.characterId,
      controller: req.controller,
      instanceId: req.instanceId,
      choiceId: req.choiceId,
      expectedVersion: req.expectedVersion,
      idempotencyKey: req.idempotencyKey,
    });
    const { rows: receiptRows } = await client.query<{ request_hash: string; payload: PgCommitReceipt }>(
      'SELECT request_hash, payload FROM action_receipts WHERE character_id = $1 AND actor_wallet = $2 AND idempotency_key = $3',
      [req.characterId, actor, req.idempotencyKey],
    );
    if (receiptRows.length > 0) {
      if (receiptRows[0].request_hash !== requestHash) {
        throw new AppError('INVALID_INPUT', 'Idempotency key reused with different input');
      }
      await client.query('COMMIT');
      return { ...receiptRows[0].payload, duplicate: true };
    }

    if (req.expectedVersion !== character.version) {
      throw new AppError('STATE_CHANGED', `Expected version ${req.expectedVersion}, found ${character.version}`);
    }

    const day = await ensureDay(client, character, now);
    if (day.used >= DAILY_ACTIONS) throw new AppError('DAILY_LIMIT');
    const open = await loadConsequences(client, character.id);
    const evRows = await client.query<{ sequence: number; created_at: Date }>(
      'SELECT sequence, created_at FROM game_events WHERE character_id = $1 ORDER BY sequence ASC',
      [character.id],
    );
    const flags = await storyFlags(evRows.rows, open);
    const situation = courierSituation(flags, day.date);
    const instance = day.instances.find(i => i.id === req.instanceId);
    if (!instance) throw new AppError('INVALID_INPUT', 'Unknown encounter instance');
    if (instance.resolved_event_id) throw new AppError('STATE_CHANGED', 'Encounter already resolved');
    const expected = nextPlayable(situation, day.instances);
    if (!expected || expected.id !== instance.id) throw new AppError('STATE_CHANGED', 'Only the next unresolved encounter can be played');

    let choice: ChoiceDef;
    if (instance.template_id === 0) {
      choice = courierChoices(flags, situation).find(c => c.id === req.choiceId) ?? null as unknown as ChoiceDef;
    } else {
      choice = null as unknown as ChoiceDef;
    }
    if (!choice) {
      try {
        choice = findChoice(instance.template_id, req.choiceId);
      } catch {
        throw new AppError('INVALID_INPUT', 'Unknown choice');
      }
    }
    const before = toStats(character);
    const elig = checkEligibility(choice, before);
    if (!elig.eligible) throw new AppError('CHOICE_UNAVAILABLE', elig.lockReason);

    let outcomeText = choice.outcome;
    let openedConsequence: ConsequenceState | null = null;
    let closedConsequence: ConsequenceState | null = null;
    if (instance.template_id === 0) {
      const result = consequenceForChoice(instance.template_id, choice.id, flags, day.date);
      if (result) {
        if (result.close) {
          const { rows: closedRows } = await client.query<ConsequenceRow>(
            `UPDATE story_consequences SET status = $1, closed_event_id = NULL, updated_at = $2
             WHERE character_id = $3 AND kind = $4 AND status = 'open'
             RETURNING id, character_id, kind, status, opened_sequence, origin_template_id, origin_choice_id, closed_event_id`,
            [result.close.status, now.toISOString(), character.id, result.close.kind],
          );
          if (closedRows[0]) {
            closedConsequence = toConsequence(closedRows[0]);
            outcomeText += ' The obligation is settled.';
          }
        }
        if (result.open) {
          const seq = await nextSequence(client, character.id);
          const { rows: openRows } = await client.query<ConsequenceRow>(
            `INSERT INTO story_consequences (character_id, kind, status, opened_sequence, origin_template_id, origin_choice_id)
             VALUES ($1, $2, 'open', $3, $4, $5)
             ON CONFLICT (character_id, kind) WHERE status = 'open' DO NOTHING
             RETURNING id, character_id, kind, status, opened_sequence, origin_template_id, origin_choice_id`,
            [character.id, result.open.kind, seq, instance.template_id, result.open.originChoiceId],
          );
          if (openRows[0]) {
            openedConsequence = toConsequence(openRows[0]);
            outcomeText += ' An unfinished promise now rides with the Chog.';
          }
        }
      }
    }

    const after = applyDelta(before, choice.delta);
    const ev = await appendEvent(client, character, epoch.id, {
      actor,
      type: 'game',
      text: `${choice.label}. Trust ${sg(choice.delta.trust)}, notoriety ${sg(choice.delta.notoriety)}, supplies ${sg(choice.delta.supplies)}.`,
      before,
      after,
      templateId: instance.template_id,
      choiceId: choice.id,
      verificationBlock: req.verificationBlock ?? null,
      now,
    });
    if (openedConsequence) {
      await client.query('UPDATE story_consequences SET opened_sequence = $1 WHERE character_id = $2 AND kind = $3 AND status = \'open\'', [ev.sequence, character.id, openedConsequence.kind]);
    }
    if (closedConsequence) {
      await client.query('UPDATE story_consequences SET closed_event_id = $1, updated_at = $2 WHERE character_id = $3 AND kind = $4 AND status = $5', [ev.id, now.toISOString(), character.id, closedConsequence.kind, closedConsequence.status]);
    }
    await client.query(
      'UPDATE encounter_instances SET resolved_event_id = $1 WHERE id = $2 AND resolved_event_id IS NULL',
      [ev.id, instance.id],
    );
    await client.query('UPDATE daily_budgets SET used = used + 1 WHERE character_id = $1 AND utc_date = $2', [character.id, day.date]);
    await client.query(
      'UPDATE characters SET trust = $1, notoriety = $2, supplies = $3, version = version + 1, updated_at = $4 WHERE id = $5',
      [after.trust, after.notoriety, after.supplies, now.toISOString(), character.id],
    );

    const receipt: PgCommitReceipt = {
      receiptId: `rcpt:${ev.id}`,
      eventId: ev.id,
      before,
      after,
      titleBefore: deriveTitle(before),
      titleAfter: deriveTitle(after),
      label: choice.label,
      text: outcomeText,
      actionsUsed: day.used + 1,
      left: DAILY_ACTIONS - (day.used + 1),
      nextResetUtc: nextUtcMidnight(now).toISOString(),
      version: character.version + 1,
      consequence: openedConsequence,
      obligationClosed: closedConsequence,
    };

    if (opts?.failAfterApply) {
      throw new AppError('STORAGE_UNAVAILABLE', 'test-induced failure after apply');
    }

    await client.query(
      `INSERT INTO action_receipts (character_id, actor_wallet, idempotency_key, request_hash, payload)
       VALUES ($1,$2,$3,$4,$5)`,
      [character.id, actor, req.idempotencyKey, requestHash, JSON.stringify(receipt)],
    );
    await client.query('COMMIT');
    return receipt;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (e instanceof AppError) throw e;
    throw new AppError('STORAGE_UNAVAILABLE', e instanceof Error ? e.message : String(e));
  } finally {
    client.release();
  }
}

export async function setIntentionTx(
  pool: Pool,
  characterId: string,
  controller: string,
  intention: 'embrace' | 'redeem',
  verificationBlock: number | null,
  now: Date,
): Promise<{ epochId: string; intention: 'embrace' | 'redeem' }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const character = await lockCharacter(client, characterId);
    const epoch = await lockActiveEpoch(client, character);
    requireController(epoch, controller);
    if (epoch.intention !== null) throw new AppError('INVALID_INPUT', 'Intention already set for this epoch');
    await client.query('UPDATE ownership_epochs SET intention = $1 WHERE id = $2', [intention, epoch.id]);
    await client.query('UPDATE characters SET version = version + 1, updated_at = $2 WHERE id = $1', [
      characterId,
      now.toISOString(),
    ]);
    const before = toStats(character);
    const text = intention === 'embrace'
      ? 'Chapter intention set: lean into the legend.'
      : 'Chapter intention set: begin a redemption chapter.';
    await appendEvent(client, character, epoch.id, {
      actor: epoch.controller_wallet,
      type: 'intention',
      text,
      before,
      after: before,
      verificationBlock,
      now,
    });
    await client.query('COMMIT');
    return { epochId: epoch.id, intention };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (e instanceof AppError) throw e;
    throw new AppError('STORAGE_UNAVAILABLE', e instanceof Error ? e.message : String(e));
  } finally {
    client.release();
  }
}

export interface PgPlayState {
  stats: Stats;
  title: Title;
  version: number;
  actionsUsed: number;
  nextResetUtc: string;
  encounter: { instanceId: string; templateId: number; story?: StoryFlags; situation?: StorySituation } | null;
  intention: 'embrace' | 'redeem' | null;
  epochId: string;
  openObligations: ConsequenceState[];
  allConsequences: ConsequenceState[];
}

export async function getPlayState(
  pool: Pool,
  characterId: string,
  controller: string,
  now: Date,
): Promise<PgPlayState> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const character = await lockCharacter(client, characterId);
    const epoch = await lockActiveEpoch(client, character);
    requireController(epoch, controller);
    const day = await ensureDay(client, character, now);
    const open = await loadConsequences(client, character.id);
    const evRows = await client.query<{ sequence: number; created_at: Date }>(
      'SELECT sequence, created_at FROM game_events WHERE character_id = $1 ORDER BY sequence ASC',
      [characterId],
    );
    const flags = await storyFlags(evRows.rows, open);
    const situation = courierSituation(flags, day.date);
    const next = nextPlayable(situation, day.instances);
    const stats = toStats(character);
    const result: PgPlayState = {
      stats,
      title: deriveTitle(stats),
      version: character.version,
      actionsUsed: day.used,
      nextResetUtc: nextUtcMidnight(now).toISOString(),
      encounter: next ? { instanceId: next.id, templateId: next.template_id, story: flags, situation } : null,
      intention: epoch.intention,
      epochId: epoch.id,
      openObligations: open.filter(c => c.status === 'open'),
      allConsequences: open,
    };
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (e instanceof AppError) throw e;
    throw new AppError('STORAGE_UNAVAILABLE', e instanceof Error ? e.message : String(e));
  } finally {
    client.release();
  }
}

function sg(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
}
