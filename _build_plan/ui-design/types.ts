// API-shaped view models. The UI renders server state; it never computes rules.
export type Mode = 'real' | 'practice';
export type Title = 'The Feared' | 'The Trusted' | 'The Notorious' | 'The Unwritten';
export type Viewer = 'visitor' | 'connected' | 'awaiting' | 'cancelled' | 'owner' | 'non-owner' | 'expired' | 'unsupported' | 'switched';
export type Intention = 'embrace' | 'redeem' | null;
export interface Stats { trust: number; notoriety: number; supplies: number }
export interface Choice {
  id: string; label: string; blurb: string; eligible: boolean;
  lockReason?: string; // server-supplied, e.g. "Needs notoriety 60 (now 0)"
  delta: Stats; preview: Stats; // preview = clamped result from server
}
export interface Encounter { instanceId: string; title: string; text: string; choices: Choice[] }
export interface Entry {
  id: string; kind: 'game' | 'chain' | 'ownership' | 'intention';
  who: string; when: string; text: string;
  txHash?: string; block?: number; fixture?: boolean;
}
export interface Profile {
  mode: Mode; tokenId: string; name: string; imageUrl?: string; traits?: string[];
  owner: { label: string; observedAt: string; status: 'fresh' | 'stale' | 'unavailable' };
  started: boolean; stats: Stats; title: Title; version: number;
  actionsUsed: number; nextResetLocal: string; intention: Intention;
  coverage: 'complete' | 'partial' | 'none'; lastIndexedBlock?: number;
  chronicle: Entry[]; inheritedFrom?: { priorChapters: number; lastThree: Entry[] };
}
export type SaveState = 'idle' | 'pending' | 'saved' | 'failed' | 'conflict' | 'duplicate';
export type ErrorCode = 'INVALID_INPUT' | 'SIGN_IN_REQUIRED' | 'NOT_CURRENT_OWNER' | 'TOKEN_NOT_FOUND'
  | 'STATE_CHANGED' | 'CHOICE_UNAVAILABLE' | 'DAILY_LIMIT' | 'RATE_LIMITED' | 'CHAIN_UNAVAILABLE' | 'STORAGE_UNAVAILABLE';
export interface Handlers {
  onConnect(): void; onSignIn(): void; onCancelSignIn(): void; onDisconnect(): void;
  onLookup(tokenId: string): void; onStartPractice(): void; onRefreshOwner(): void;
  onActivate(): void; onIntention(i: 'embrace' | 'redeem' | 'skip'): void;
  onSubmitChoice(instanceId: string, choiceId: string): void;
  onPage(dir: 'prev' | 'next'): void; onFilter(kind: Entry['kind'] | 'all'): void;
  onPracticeReset(): void; onPracticeHandoff(): void; onLeavePractice(): void;
}
