import type { ErrorCode } from '../server/errors';
import type { Stats, Title } from './rules';

export interface ApiIdentity {
  namespace: string;
  chainId: number | null;
  contract: string | null;
  tokenId: string;
}

export type OwnershipStatus = 'fresh' | 'stale' | 'unavailable' | 'never';

export interface ApiOwnership {
  status: OwnershipStatus;
  owner: string | null;
  observedAt: string | null;
  verificationBlock: number | null;
  chainError: string | null;
}

export interface ApiTrait {
  trait_type: string;
  value: string | number;
}

export interface ApiMetadata {
  tokenUri: string | null;
  name: string | null;
  imageUri: string | null;
  traits: ApiTrait[] | null;
  retrievedAt: string | null;
  stale: boolean;
  error: string | null;
}

export interface ApiGameSummary {
  characterId: string;
  stats: Stats;
  title: Title;
  version: number;
  controller: string;
  intention: 'embrace' | 'redeem' | null;
  epochCount: number;
  actionsUsedToday: number;
  nextResetUtc: string;
  gameEventCount: number;
  priorGameChapters: number;
}

export interface ApiGameEvent {
  id: string;
  sequence: number;
  type: 'game' | 'ownership' | 'intention';
  actor: string;
  templateId: number | null;
  choiceId: string | null;
  text: string;
  titleBefore: string;
  titleAfter: string;
  rulesetVersion: string;
  createdAt: string;
}

export interface ApiChainEvent {
  txHash: string;
  blockNumber: number;
  logIndex: number;
  kind: 'mint' | 'transfer' | 'burn';
  from: string;
  to: string;
  tokenId: string;
  observedAt: string;
}

export interface ApiHistorySync {
  startBlock: number;
  lastIndexedBlock: number;
  latestKnownBlock: number | null;
  status: 'complete' | 'partial' | 'none';
  updatedAt: string;
}

export interface ApiProfile {
  identity: ApiIdentity;
  ownership: ApiOwnership;
  metadata: ApiMetadata | null;
  game: ApiGameSummary | null;
  chronicle: ApiGameEvent[];
  provenance: ApiChainEvent[];
  historySync: ApiHistorySync | null;
}

export interface ApiChroniclePage {
  chronicle: ApiGameEvent[];
  provenance: ApiChainEvent[];
  nextGameCursor: number | null;
  nextProvCursor: string | null;
}

export interface ApiError {
  error: { code: ErrorCode; message: string };
}

export interface ApiHealth {
  ok: boolean;
  db: boolean;
  chain: { ok: boolean; blockNumber: number | null; error: string | null };
  contract: string;
  contractName: string | null;
  chainId: number;
}

export interface ApiNonceResponse {
  message: string;
  nonce: string;
  expiresAt: string;
  domain: string;
  uri: string;
  chainId: number;
}

export interface ApiSessionInfo {
  authenticated: boolean;
  wallet: string | null;
  expiresAt: string | null;
  expired: boolean;
  chainId: number;
}

export interface ApiActivationResult {
  characterId: string;
  created: boolean;
  changed: boolean;
  epochId: string;
  controller: string;
  version: number;
}

export interface ApiPlayState {
  characterId: string;
  controller: string;
  stats: Stats;
  title: Title;
  version: number;
  actionsUsed: number;
  nextResetUtc: string;
  intention: 'embrace' | 'redeem' | null;
  epochId: string;
  encounter: import('./rules').EncounterView | null;
}

export interface ApiIntentionResult {
  epochId: string;
  intention: 'embrace' | 'redeem';
}

export interface ApiCommitReceipt {
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
}
