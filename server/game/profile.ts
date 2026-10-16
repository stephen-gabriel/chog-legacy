import type { Pool } from 'pg';
import type { Config } from '../config';
import type { ChainAdapter } from '../chain/adapter';
import { resolveMetadata } from '../chain/metadata';
import { AppError } from '../../src/server/errors';
import { deriveTitle, nextUtcMidnight, utcDateOf } from '../../src/shared/rules';
import type {
  ApiChainEvent,
  ApiChroniclePage,
  ApiGameEvent,
  ApiGameSummary,
  ApiHistorySync,
  ApiIdentity,
  ApiMetadata,
  ApiOwnership,
  ApiProfile,
} from '../../src/shared/apiTypes';
import { findCharacterByIdentity, identityKey, type Identity } from './service';

export interface ReadDeps {
  pool: Pool;
  chain: ChainAdapter;
  config: Config;
  now(): Date;
}

const CHRONICLE_LIMIT = 100;
const FRESH_MS = 10 * 60_000;

interface ObservationRow {
  owner_address: string | null;
  block_number: string | null;
  observed_at: Date;
  status: 'fresh' | 'stale' | 'unavailable';
}

function keyParams(identity: Identity): [string, number | null, string | null, string] {
  const key = identityKey(identity);
  return [key.namespace, key.chainId, key.contract, key.tokenId];
}

function requireChainKeys(identity: Identity): void {
  if (identity.chainId === null || !identity.contract) {
    throw new AppError('INVALID_INPUT', 'chainId and contract are required for this namespace');
  }
}

function displayOwnership(row: ObservationRow | null, now: Date): ApiOwnership {
  if (!row) return { status: 'never', owner: null, observedAt: null, verificationBlock: null, chainError: null };
  const ageMs = now.getTime() - new Date(row.observed_at).getTime();
  const status = row.status === 'fresh' && ageMs > FRESH_MS ? 'stale' : row.status;
  return {
    status,
    owner: row.owner_address,
    observedAt: new Date(row.observed_at).toISOString(),
    verificationBlock: row.block_number === null ? null : Number(row.block_number),
    chainError: row.status === 'unavailable' ? 'last refresh could not reach the chain' : null,
  };
}

async function readObservation(deps: ReadDeps, identity: Identity): Promise<ObservationRow | null> {
  const [ns, chainId, contract, tokenId] = keyParams(identity);
  const { rows } = await deps.pool.query<ObservationRow>(
    'SELECT owner_address, block_number, observed_at, status FROM ownership_observations WHERE namespace = $1 AND chain_id = $2 AND contract = $3 AND token_id = $4',
    [ns, chainId, contract, tokenId],
  );
  return rows[0] ?? null;
}

async function readGame(deps: ReadDeps, identity: Identity): Promise<{ summary: ApiGameSummary | null; chronicle: ApiGameEvent[] }> {
  const character = await findCharacterByIdentity(deps.pool, identity);
  if (!character) return { summary: null, chronicle: [] };
  const { rows } = await deps.pool.query<{ id: string; intention: 'embrace' | 'redeem' | null }>(
    'SELECT id, intention FROM ownership_epochs WHERE id = $1',
    [character.active_epoch_id],
  );
  const { rows: countRows } = await deps.pool.query<{ count: string; epochs: string; prior: string }>(
    `SELECT COUNT(*) FILTER (WHERE type = 'game') AS count, COUNT(*) AS epochs,
            COUNT(*) FILTER (WHERE type = 'game' AND epoch_id IS DISTINCT FROM $2) AS prior
     FROM game_events WHERE character_id = $1`,
    [character.id, character.active_epoch_id],
  );
  const date = utcDateOf(deps.now());
  const { rows: budgetRows } = await deps.pool.query<{ used: number }>(
    'SELECT used FROM daily_budgets WHERE character_id = $1 AND utc_date = $2',
    [character.id, date],
  );
  const stats = { trust: character.trust, notoriety: character.notoriety, supplies: character.supplies };
  const controller = await readController(deps, character.active_epoch_id);
  const summary: ApiGameSummary = {
    characterId: character.id,
    stats,
    title: deriveTitle(stats),
    version: character.version,
    controller,
    intention: rows[0]?.intention ?? null,
    epochCount: Number(countRows[0].epochs),
    actionsUsedToday: budgetRows[0]?.used ?? 0,
    nextResetUtc: nextUtcMidnight(deps.now()).toISOString(),
    gameEventCount: Number(countRows[0].count),
    priorGameChapters: Number(countRows[0].prior),
  };
  const { rows: events } = await deps.pool.query<{
    id: string; sequence: number; type: 'game' | 'ownership' | 'intention'; actor_wallet: string;
    template_id: number | null; choice_id: string | null; text: string; title_before: string;
    title_after: string; ruleset_version: string; created_at: Date;
  }>(
    `SELECT id, sequence, type, actor_wallet, template_id, choice_id, text, title_before, title_after, ruleset_version, created_at
     FROM game_events WHERE character_id = $1 ORDER BY sequence DESC LIMIT $2`,
    [character.id, CHRONICLE_LIMIT],
  );
  return {
    summary,
    chronicle: events.map(mapGameEvent),
  };
}

async function readController(deps: ReadDeps, epochId: string | null): Promise<string> {
  if (!epochId) return '';
  const { rows } = await deps.pool.query<{ controller_wallet: string }>('SELECT controller_wallet FROM ownership_epochs WHERE id = $1', [epochId]);
  return rows[0]?.controller_wallet ?? '';
}

function mapGameEvent(e: {
  id: string; sequence: number; type: 'game' | 'ownership' | 'intention'; actor_wallet: string;
  template_id: number | null; choice_id: string | null; text: string; title_before: string;
  title_after: string; ruleset_version: string; created_at: Date;
}): ApiGameEvent {
  return {
    id: e.id,
    sequence: e.sequence,
    type: e.type,
    actor: e.actor_wallet,
    templateId: e.template_id,
    choiceId: e.choice_id,
    text: e.text,
    titleBefore: e.title_before,
    titleAfter: e.title_after,
    rulesetVersion: e.ruleset_version,
    createdAt: new Date(e.created_at).toISOString(),
  };
}

async function readProvenance(deps: ReadDeps, identity: Identity, limit = CHRONICLE_LIMIT): Promise<ApiChainEvent[]> {
  requireChainKeys(identity);
  const [ns, chainId, contract, tokenId] = keyParams(identity);
  const { rows } = await deps.pool.query<{
    tx_hash: string; block_number: string; log_index: number; kind: 'mint' | 'transfer' | 'burn';
    from_address: string; to_address: string; token_id: string; observed_at: Date;
  }>(
    `SELECT tx_hash, block_number, log_index, kind, from_address, to_address, token_id, observed_at
     FROM chain_events WHERE namespace = $1 AND chain_id = $2 AND contract = $3 AND token_id = $4
     ORDER BY block_number DESC, log_index DESC LIMIT $5`,
    [ns, chainId, contract, tokenId, limit],
  );
  return rows.map(e => ({
    txHash: e.tx_hash,
    blockNumber: Number(e.block_number),
    logIndex: e.log_index,
    kind: e.kind,
    from: e.from_address,
    to: e.to_address,
    tokenId: e.token_id,
    observedAt: new Date(e.observed_at).toISOString(),
  }));
}

async function readHistorySync(deps: ReadDeps, identity: Identity): Promise<ApiHistorySync | null> {
  requireChainKeys(identity);
  const [ns, chainId, contract, tokenId] = keyParams(identity);
  const { rows } = await deps.pool.query<{
    start_block: string; cursor_block: string; latest_verified_block: string | null;
    status: 'complete' | 'partial' | 'none'; updated_at: Date;
  }>(
    'SELECT start_block, cursor_block, latest_verified_block, status, updated_at FROM history_sync WHERE namespace = $1 AND chain_id = $2 AND contract = $3 AND token_id = $4',
    [ns, chainId, contract, tokenId],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    startBlock: Number(r.start_block),
    lastIndexedBlock: Number(r.cursor_block),
    latestKnownBlock: r.latest_verified_block === null ? null : Number(r.latest_verified_block),
    status: r.status,
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

async function readMetadata(deps: ReadDeps, identity: Identity): Promise<ApiMetadata | null> {
  requireChainKeys(identity);
  const [ns, chainId, contract, tokenId] = keyParams(identity);
  const { rows } = await deps.pool.query<{
    token_uri: string | null; name: string | null; image_uri: string | null;
    traits: ApiTraitRow[] | null; error: string | null; retrieved_at: Date;
  }>('SELECT token_uri, name, image_uri, traits, error, retrieved_at FROM metadata_cache WHERE namespace = $1 AND chain_id = $2 AND contract = $3 AND token_id = $4', [
    ns, chainId, contract, tokenId,
  ]);
  if (rows.length === 0) return null;
  const r = rows[0];
  const ageMs = deps.now().getTime() - new Date(r.retrieved_at).getTime();
  return {
    tokenUri: r.token_uri,
    name: r.name,
    imageUri: r.image_uri,
    traits: r.traits ?? null,
    retrievedAt: new Date(r.retrieved_at).toISOString(),
    stale: ageMs > deps.config.metadataTtlMs,
    error: r.error,
  };
}

interface ApiTraitRow {
  trait_type: string;
  value: string | number;
}

export async function readProfile(deps: ReadDeps, identity: Identity): Promise<ApiProfile> {
  const [observation, game, provenance, historySync, metadata] = await Promise.all([
    readObservation(deps, identity),
    readGame(deps, identity),
    readProvenance(deps, identity).catch(e => {
      if (e instanceof AppError && e.code === 'INVALID_INPUT') return [];
      throw e;
    }),
    readHistorySync(deps, identity).catch(e => {
      if (e instanceof AppError && e.code === 'INVALID_INPUT') return null;
      throw e;
    }),
    readMetadata(deps, identity).catch(e => {
      if (e instanceof AppError && e.code === 'INVALID_INPUT') return null;
      throw e;
    }),
  ]);
  return {
    identity: {
      namespace: identity.namespace,
      chainId: identity.chainId,
      contract: identity.contract,
      tokenId: identity.tokenId,
    },
    ownership: displayOwnership(observation, deps.now()),
    metadata,
    game: game.summary,
    chronicle: game.chronicle,
    provenance,
    historySync,
  };
}

async function upsertObservation(
  pool: Pool,
  identity: Identity,
  owner: string | null,
  blockNumber: number | null,
  status: 'fresh' | 'unavailable',
  now: Date,
): Promise<void> {
  const [ns, chainId, contract, tokenId] = keyParams(identity);
  await pool.query(
    `INSERT INTO ownership_observations (namespace, chain_id, contract, token_id, owner_address, block_number, observed_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (namespace, chain_id, contract, token_id)
     DO UPDATE SET owner_address = EXCLUDED.owner_address, block_number = EXCLUDED.block_number,
                   observed_at = EXCLUDED.observed_at, status = EXCLUDED.status`,
    [ns, chainId, contract, tokenId, owner, blockNumber, now.toISOString(), status],
  );
}

async function upsertMetadata(
  pool: Pool,
  identity: Identity,
  tokenUri: string | null,
  name: string | null,
  imageUri: string | null,
  traits: ApiTraitRow[] | null,
  error: string | null,
  now: Date,
): Promise<void> {
  const [ns, chainId, contract, tokenId] = keyParams(identity);
  await pool.query(
    `INSERT INTO metadata_cache (namespace, chain_id, contract, token_id, token_uri, name, image_uri, traits, error, retrieved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (namespace, chain_id, contract, token_id)
     DO UPDATE SET token_uri = EXCLUDED.token_uri, name = EXCLUDED.name, image_uri = EXCLUDED.image_uri,
                   traits = EXCLUDED.traits, error = EXCLUDED.error, retrieved_at = EXCLUDED.retrieved_at`,
    [ns, chainId, contract, tokenId, tokenUri, name, imageUri, traits ? JSON.stringify(traits) : null, error, now.toISOString()],
  );
}

async function syncHistoryPage(deps: ReadDeps, identity: Identity, latestBlock: number): Promise<void> {
  const [ns, chainId, contract, tokenId] = keyParams(identity);
  await deps.pool.query(
    `INSERT INTO history_sync (namespace, chain_id, contract, token_id, start_block, cursor_block, status, updated_at)
     VALUES ($1,$2,$3,$4,$5,$5,'partial',$6)
     ON CONFLICT (namespace, chain_id, contract, token_id) DO NOTHING`,
    [ns, chainId, contract, tokenId, deps.config.historyStartBlock, deps.now().toISOString()],
  );
  const { rows } = await deps.pool.query<{ cursor_block: string }>(
    'SELECT cursor_block FROM history_sync WHERE namespace = $1 AND chain_id = $2 AND contract = $3 AND token_id = $4',
    [ns, chainId, contract, tokenId],
  );
  const cursor = Number(rows[0].cursor_block);
  if (cursor > latestBlock) return;
  const toBlock = Math.min(cursor + deps.chain.maxLogRange - 1, latestBlock);
  const logs = await deps.chain.getTransferLogs(tokenId, cursor, toBlock);
  for (const log of logs) {
    await deps.pool.query(
      `INSERT INTO chain_events (namespace, chain_id, contract, token_id, block_number, block_hash, tx_hash, log_index, from_address, to_address, kind, observed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING`,
      [
        ns, chainId, contract, tokenId,
        log.blockNumber, log.blockHash, log.txHash, log.logIndex,
        log.from, log.to, log.kind, deps.now().toISOString(),
      ],
    );
  }
  await deps.pool.query(
    `UPDATE history_sync SET cursor_block = $1, latest_verified_block = $2, updated_at = $3
     WHERE namespace = $4 AND chain_id = $5 AND contract = $6 AND token_id = $7`,
    [toBlock, latestBlock, deps.now().toISOString(), ns, chainId, contract, tokenId],
  );
}

export async function refreshProfile(deps: ReadDeps, identity: Identity): Promise<ApiProfile> {
  requireChainKeys(identity);
  const health = await deps.chain.getHealth();
  if (!health.ok || health.blockNumber === null) {
    throw new AppError('CHAIN_UNAVAILABLE', health.error ?? 'Chain unreachable');
  }
  const now = deps.now();

  let owner: string;
  let verificationBlock: number;
  try {
    const res = await deps.chain.ownerOf(identity.tokenId);
    owner = res.owner;
    verificationBlock = res.blockNumber;
  } catch (e) {
    if (e instanceof AppError && e.code === 'TOKEN_NOT_FOUND') {
      await upsertObservation(deps.pool, identity, null, health.blockNumber, 'unavailable', now);
      throw e;
    }
    throw e;
  }
  await upsertObservation(deps.pool, identity, owner, verificationBlock, 'fresh', now);

  try {
    const tokenUri = await deps.chain.tokenURI(identity.tokenId);
    const meta = await resolveMetadata(tokenUri, { timeoutMs: 8000 });
    await upsertMetadata(
      deps.pool, identity, tokenUri,
      meta.name, meta.imageUri, meta.traits, meta.ok ? null : meta.error, now,
    );
  } catch (e) {
    await upsertMetadata(
      deps.pool, identity, null, null, null, null,
      e instanceof Error ? e.message : String(e), now,
    );
  }

  await syncHistoryPage(deps, identity, health.blockNumber);
  return readProfile(deps, identity);
}

export async function listChronicle(
  deps: ReadDeps,
  identity: Identity,
  opts: { gameCursor?: number | null; provCursor?: string | null; limit?: number },
): Promise<ApiChroniclePage> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const character = await findCharacterByIdentity(deps.pool, identity);

  let chronicle: ApiGameEvent[] = [];
  let nextGameCursor: number | null = null;
  if (character) {
    const rawCursor = opts.gameCursor ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(rawCursor)) throw new AppError('INVALID_INPUT', 'Malformed game cursor');
    const cursor = Math.min(Math.max(rawCursor, 0), 2_147_483_647);
    const { rows } = await deps.pool.query<{
      id: string; sequence: number; type: 'game' | 'ownership' | 'intention'; actor_wallet: string;
      template_id: number | null; choice_id: string | null; text: string; title_before: string;
      title_after: string; ruleset_version: string; created_at: Date;
    }>(
      `SELECT id, sequence, type, actor_wallet, template_id, choice_id, text, title_before, title_after, ruleset_version, created_at
       FROM game_events WHERE character_id = $1 AND sequence < $2 ORDER BY sequence DESC LIMIT $3`,
      [character.id, cursor, limit + 1],
    );
    const page = rows.slice(0, limit);
    chronicle = page.map(mapGameEvent);
    if (rows.length > limit && page.length > 0) nextGameCursor = page[page.length - 1].sequence;
  }

  let provenance: ApiChainEvent[] = [];
  let nextProvCursor: string | null = null;
  if (identity.chainId !== null && identity.contract) {
    let blockCursor = Number.MAX_SAFE_INTEGER;
    let logCursor = 2_147_483_647;
    if (opts.provCursor) {
      const [b, l] = opts.provCursor.split(':');
      blockCursor = Number(b);
      logCursor = Number(l);
      if (!Number.isFinite(blockCursor) || !Number.isFinite(logCursor)) {
        throw new AppError('INVALID_INPUT', 'Malformed provenance cursor');
      }
      blockCursor = Math.min(Math.max(blockCursor, 0), Number.MAX_SAFE_INTEGER);
      logCursor = Math.min(Math.max(logCursor, 0), 2_147_483_647);
    }
    const [ns, chainId, contract, tokenId] = keyParams(identity);
    const { rows } = await deps.pool.query<{
      tx_hash: string; block_number: string; log_index: number; kind: 'mint' | 'transfer' | 'burn';
      from_address: string; to_address: string; token_id: string; observed_at: Date;
    }>(
      `SELECT tx_hash, block_number, log_index, kind, from_address, to_address, token_id, observed_at
       FROM chain_events
       WHERE namespace = $1 AND chain_id = $2 AND contract = $3 AND token_id = $4
         AND (block_number < $5 OR (block_number = $5 AND log_index < $6))
       ORDER BY block_number DESC, log_index DESC LIMIT $7`,
      [ns, chainId, contract, tokenId, String(blockCursor), logCursor, limit + 1],
    );
    const page = rows.slice(0, limit);
    provenance = page.map(e => ({
      txHash: e.tx_hash,
      blockNumber: Number(e.block_number),
      logIndex: e.log_index,
      kind: e.kind,
      from: e.from_address,
      to: e.to_address,
      tokenId: e.token_id,
      observedAt: new Date(e.observed_at).toISOString(),
    }));
    if (rows.length > limit && page.length > 0) {
      const last = page[page.length - 1];
      nextProvCursor = `${Number(last.block_number)}:${last.log_index}`;
    }
  }

  return { chronicle, provenance, nextGameCursor, nextProvCursor };
}

export function toApiIdentity(id: Identity): ApiIdentity {
  return { namespace: id.namespace, chainId: id.chainId, contract: id.contract, tokenId: id.tokenId };
}
