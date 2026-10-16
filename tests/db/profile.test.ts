import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import type { Config } from '../../server/config';
import type { ChainAdapter } from '../../server/chain/adapter';
import { activateTx, commitActionTx, getPlayState, type Identity } from '../../server/game/service';
import { listChronicle, readProfile, type ReadDeps } from '../../server/game/profile';
import { dailyTemplateIds, getTemplate, utcDateOf } from '../../src/shared/rules';
import { canonicalId } from '../../server/game/service';
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
const NOW = new Date('2026-10-15T10:00:00.000Z');

function stubChain(): ChainAdapter {
  const boom = (): never => {
    throw new Error('chain must not be called on the read path');
  };
  return {
    maxLogRange: 100,
    getHealth: async () => boom(),
    ownerOf: async () => boom(),
    tokenURI: async () => boom(),
    getTransferLogs: async () => boom(),
  };
}

function testConfig(): Config {
  return {
    databaseUrl: 'postgres://unused',
    databaseUrlTest: null,
    mainnetRpcUrl: 'http://unused',
    mainnetChainId: 143,
    chogContract: ID.contract!,
    historyStartBlock: 101_997_010,
    appOrigin: 'http://localhost:5173',
    apiPort: 8787,
    metadataTtlMs: 60_000,
    maxLogRange: 100,
    identityNamespace: 'chog-mainnet',
    sessionSecret: 'test-session-secret-at-least-16-chars',
    sessionTtlMs: 86_400_000,
    nonceTtlMs: 300_000,
    host: '127.0.0.1',
    trustProxy: false,
    dbSsl: false,
    staticDir: 'dist',
    production: false,
  };
}

async function commitOnce(pool: Pool, characterId: string, key: string, now: Date): Promise<void> {
  const st = await getPlayState(pool, characterId, WALLET_A, now);
  const templateId = dailyTemplateIds(canonicalId(ID), utcDateOf(now))[0];
  const choice = getTemplate(st.encounter ? st.encounter.templateId : templateId).choices.find(c => !c.requires)!;
  await commitActionTx(pool, {
    characterId,
    controller: WALLET_A,
    instanceId: st.encounter?.instanceId ?? `${characterId}#${utcDateOf(now)}#0`,
    choiceId: choice.id,
    expectedVersion: st.version,
    idempotencyKey: key,
    now,
  });
}

describe.runIf(gate.ok)('postgres profile read model (real database)', () => {
  let pool: Pool;
  let deps: ReadDeps;

  beforeAll(async () => {
    pool = await createCleanPool(gate.url!);
    deps = { pool, chain: stubChain(), config: testConfig(), now: () => NOW };
  }, 30_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('an unseen token returns an honest empty profile and mutates nothing', async () => {
    const profile = await readProfile(deps, { ...ID, tokenId: '9999' });
    expect(profile.ownership).toMatchObject({ status: 'never', owner: null });
    expect(profile.game).toBeNull();
    expect(profile.chronicle).toEqual([]);
    expect(profile.provenance).toEqual([]);
    expect(profile.historySync).toBeNull();
    expect(profile.metadata).toBeNull();
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM characters');
    expect(rows[0].n).toBe(0);
  });

  it('after activation the profile shows the game summary and activation chronicle entry', async () => {
    const { characterId } = await activateTx(pool, ID, WALLET_A, 102_000_000, NOW);
    const profile = await readProfile(deps, ID);
    expect(profile.game).not.toBeNull();
    expect(profile.game!.characterId).toBe(characterId);
    expect(profile.game!.title).toBe('The Unwritten');
    expect(profile.game!.stats).toEqual({ trust: 0, notoriety: 0, supplies: 3 });
    expect(profile.game!.controller).toBe(WALLET_A);
    expect(profile.game!.actionsUsedToday).toBe(0);
    expect(profile.game!.epochCount).toBe(1);
    expect(profile.chronicle).toHaveLength(1);
    expect(profile.chronicle[0].type).toBe('ownership');
  });

  it('a fresh observation renders as fresh and a 30-minute-old observation downgrades to stale in display only', async () => {
    const [ns, chainId, contract, tokenId] = [ID.namespace, ID.chainId, ID.contract!, ID.tokenId];
    await pool.query(
      `INSERT INTO ownership_observations (namespace, chain_id, contract, token_id, owner_address, block_number, observed_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'fresh')
       ON CONFLICT (namespace, chain_id, contract, token_id)
       DO UPDATE SET observed_at = EXCLUDED.observed_at, owner_address = EXCLUDED.owner_address, status = 'fresh'`,
      [ns, chainId, contract, tokenId, WALLET_A, 102_000_001, NOW.toISOString()],
    );
    let profile = await readProfile(deps, ID);
    expect(profile.ownership.status).toBe('fresh');
    expect(profile.ownership.owner).toBe(WALLET_A);

    await pool.query(
      'UPDATE ownership_observations SET observed_at = $1 WHERE namespace = $2 AND chain_id = $3 AND contract = $4 AND token_id = $5',
      [new Date(NOW.getTime() - 30 * 60_000).toISOString(), ns, chainId, contract, tokenId],
    );
    profile = await readProfile(deps, ID);
    expect(profile.ownership.status).toBe('stale');
    expect(profile.ownership.owner).toBe(WALLET_A);
    const { rows } = await pool.query(
      'SELECT status FROM ownership_observations WHERE namespace = $1 AND chain_id = $2 AND contract = $3 AND token_id = $4',
      [ns, chainId, contract, tokenId],
    );
    expect(rows[0].status).toBe('fresh');
  });

  it('metadata cache is served with an honest stale flag after the TTL', async () => {
    const [ns, chainId, contract, tokenId] = [ID.namespace, ID.chainId, ID.contract!, ID.tokenId];
    await pool.query(
      `INSERT INTO metadata_cache (namespace, chain_id, contract, token_id, token_uri, name, image_uri, traits, error, retrieved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9)
       ON CONFLICT (namespace, chain_id, contract, token_id)
       DO UPDATE SET retrieved_at = EXCLUDED.retrieved_at, name = EXCLUDED.name`,
      [
        ns, chainId, contract, tokenId,
        'ipfs://bafytest/1425.json', 'Chog of the Long Road',
        'ipfs://bafytest/1425.png',
        JSON.stringify([{ trait_type: 'Era', value: 'First' }]),
        new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      ],
    );
    let profile = await readProfile(deps, ID);
    expect(profile.metadata).toMatchObject({ name: 'Chog of the Long Road', stale: true, error: null });
    expect(profile.metadata!.traits).toEqual([{ trait_type: 'Era', value: 'First' }]);

    await pool.query(
      'UPDATE metadata_cache SET retrieved_at = $1 WHERE namespace = $2 AND chain_id = $3 AND contract = $4 AND token_id = $5',
      [NOW.toISOString(), ns, chainId, contract, tokenId],
    );
    profile = await readProfile(deps, ID);
    expect(profile.metadata!.stale).toBe(false);
  });

  it('provenance maps indexed chain events newest first', async () => {
    const [ns, chainId, contract, tokenId] = [ID.namespace, ID.chainId, ID.contract!, ID.tokenId];
    const insert = (block: number, logIndex: number, kind: 'mint' | 'transfer') =>
      pool.query(
        `INSERT INTO chain_events (namespace, chain_id, contract, token_id, block_number, block_hash, tx_hash, log_index, from_address, to_address, kind, observed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING`,
        [ns, chainId, contract, tokenId, block, '0xblock', `0xtx${block}${logIndex}`, logIndex,
         kind === 'mint' ? '0x0000000000000000000000000000000000000000' : WALLET_A,
         WALLET_A, kind, NOW.toISOString()],
      );
    await insert(101_997_010, 0, 'mint');
    await insert(102_500_000, 0, 'transfer');
    await insert(103_000_000, 1, 'transfer');

    const profile = await readProfile(deps, ID);
    expect(profile.provenance.map(p => p.blockNumber)).toEqual([103_000_000, 102_500_000, 101_997_010]);
    expect(profile.provenance[0].logIndex).toBe(1);
    expect(profile.provenance[2].kind).toBe('mint');
  });

  it('game summary counts actions and the chronicle paginates with a cursor', async () => {
    await commitOnce(pool, (await pool.query<{ id: string }>('SELECT id FROM characters WHERE token_id = $1', [ID.tokenId])).rows[0].id, 'read-0001', NOW);
    await commitOnce(pool, (await pool.query<{ id: string }>('SELECT id FROM characters WHERE token_id = $1', [ID.tokenId])).rows[0].id, 'read-0002', NOW);

    const profile = await readProfile(deps, ID);
    expect(profile.game!.actionsUsedToday).toBe(2);
    expect(profile.game!.gameEventCount).toBe(2);
    expect(profile.chronicle.map(e => e.sequence)).toEqual([3, 2, 1]);

    const page1 = await listChronicle(deps, ID, { limit: 2 });
    expect(page1.chronicle.map(e => e.sequence)).toEqual([3, 2]);
    expect(page1.nextGameCursor).toBe(2);
    expect(page1.provenance).toHaveLength(2);
    expect(page1.nextProvCursor).toBeTruthy();

    const page2 = await listChronicle(deps, ID, { limit: 2, gameCursor: page1.nextGameCursor, provCursor: page1.nextProvCursor });
    expect(page2.chronicle.map(e => e.sequence)).toEqual([1]);
    expect(page2.nextGameCursor).toBeNull();
    expect(page2.provenance).toHaveLength(1);
    expect(page2.nextProvCursor).toBeNull();
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
