import type { ApiChainEvent, ApiGameEvent, ApiProfile } from '@/shared/apiTypes';
import { formatResetLocal } from '@/app/format';
import type { Entry, Profile } from '@/ui/types';

const GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

export function ipfsHttp(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;
  return uri.startsWith('ipfs://') ? GATEWAY + uri.slice(7) : uri;
}

export function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

const CHAIN_KIND: Record<ApiChainEvent['kind'], string> = {
  mint: 'Mint',
  transfer: 'Transfer',
  burn: 'Burn',
};

function gameEntry(e: ApiGameEvent): Entry {
  return {
    id: e.id,
    kind: e.type,
    who: e.actor,
    when: new Date(e.createdAt).toLocaleString(),
    text: `${e.titleAfter} — ${e.text}`,
  };
}

function chainEntry(e: ApiChainEvent): Entry {
  return {
    id: `${e.txHash}-${e.logIndex}`,
    kind: 'chain',
    who: CHAIN_KIND[e.kind],
    when: new Date(e.observedAt).toLocaleString(),
    text:
      e.kind === 'mint'
        ? `Minted to ${shortAddress(e.to)} in block ${e.blockNumber}.`
        : e.kind === 'burn'
          ? `Burned from ${shortAddress(e.from)} in block ${e.blockNumber}.`
          : `Moved ${shortAddress(e.from)} → ${shortAddress(e.to)} in block ${e.blockNumber}.`,
    txHash: e.txHash,
    block: e.blockNumber,
  };
}

export function apiProfileToUi(p: ApiProfile): Profile {
  const g = p.game;
  const stats = g?.stats ?? { trust: 0, notoriety: 0, supplies: 3 };
  const chronicle: Entry[] = [...p.chronicle.map(gameEntry), ...p.provenance.map(chainEntry)]
    .sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0))
    .slice(0, 100);
  const priorChapters = g?.priorGameChapters ?? 0;
  const lastThree = p.chronicle.filter(e => e.type === 'game').slice(0, 3).map(gameEntry);
  return {
    mode: 'real',
    tokenId: p.identity.tokenId,
    name: p.metadata?.name ?? `Chog #${p.identity.tokenId}`,
    imageUrl: ipfsHttp(p.metadata?.imageUri ?? null),
    traits: p.metadata?.traits ? p.metadata.traits.map(t => `${t.trait_type}: ${t.value}`) : undefined,
    owner: {
      label: g && g.controller ? shortAddress(g.controller) : p.ownership.owner ? shortAddress(p.ownership.owner) : 'not observed yet',
      observedAt: p.ownership.observedAt ?? 'never',
      status: p.ownership.status === 'fresh' ? 'fresh' : p.ownership.status === 'stale' ? 'stale' : 'unavailable',
    },
    started: g !== null,
    stats,
    title: g ? g.title : stats.notoriety >= 40 ? 'The Notorious' : 'The Unwritten',
    version: g?.version ?? 0,
    actionsUsed: g?.actionsUsedToday ?? 0,
    nextResetLocal: g ? formatResetLocal(g.nextResetUtc) : '',
    intention: g?.intention ?? null,
    coverage: p.historySync ? p.historySync.status : 'none',
    lastIndexedBlock: p.historySync?.lastIndexedBlock,
    chronicle,
    inheritedFrom: priorChapters > 0 ? { priorChapters, lastThree } : undefined,
  };
}
