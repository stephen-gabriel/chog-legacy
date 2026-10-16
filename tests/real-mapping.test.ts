// Copy into the existing project's tests directory; uses its Vitest and @ alias.
import { describe, expect, it } from 'vitest';
import { apiProfileToUi } from '@/real/realMapping';
import type { ApiGameEvent, ApiProfile } from '@/shared/apiTypes';

const owner = `0x${'2'.repeat(40)}`;
const oldController = `0x${'3'.repeat(40)}`;
const event = (id: string, createdAt: string): ApiGameEvent => ({
  id, createdAt, type: 'game', actor: oldController, sequence: 1,
  templateId: 1, choiceId: 'fixture', text: 'Fixture chapter',
  titleBefore: 'The Feared', titleAfter: 'The Feared', rulesetVersion: 'v1',
});
const fixture = (): ApiProfile => ({
  identity: { namespace: 'qa', chainId: 143, contract: null, tokenId: '1425' },
  ownership: { status: 'fresh', owner, observedAt: '2026-10-16T00:00:00Z', verificationBlock: 1, chainError: null },
  metadata: null,
  game: { characterId: 'qa', stats: { trust: -35, notoriety: 70, supplies: 3 }, title: 'The Feared', version: 1, controller: oldController, intention: null, epochCount: 1, actionsUsedToday: 0, nextResetUtc: '2026-10-17T00:00:00Z', gameEventCount: 2, priorGameChapters: 0 },
  chronicle: [event('september', '2026-09-30T23:59:00Z'), event('october', '2026-10-01T00:01:00Z')],
  provenance: [], historySync: null,
});
describe('real profile presentation', () => {
  it('orders by actual timestamps across month boundaries', () => {
    expect(apiProfileToUi(fixture()).chronicle.map(e => e.id)).toEqual(['october', 'september']);
  });
  it('labels the observed NFT owner even before gameplay controller synchronization', () => {
    expect(apiProfileToUi(fixture()).owner.label).toBe('0x2222…2222');
  });
});
