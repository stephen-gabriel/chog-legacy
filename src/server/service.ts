import {
  DAILY_ACTIONS,
  INITIAL_STATS,
  RULESET_VERSION,
  applyDelta,
  applyConsequence,
  buildEncounterView,
  consequenceForChoice,
  courierChoices,
  courierSituation,
  dailyTemplateIds,
  deriveTitle,
  findChoice,
  getTemplate,
  checkEligibility,
  nextUtcMidnight,
  utcDateOf,
} from '../shared/rules';
import type { ChoiceDef, ConsequenceState, EncounterView, Stats, StoryFlags, StorySituation } from '../shared/rules';
import { AppError } from './errors';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

const PRACTICE_CLOCK_KEY = 'chog-legacy:practice:clock';

function practiceClockIso(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const v = sessionStorage.getItem(PRACTICE_CLOCK_KEY);
  return v && !Number.isNaN(Date.parse(v)) ? v : null;
}

export const practiceClock: Clock = {
  now: () => {
    const iso = practiceClockIso();
    return iso ? new Date(iso) : systemClock.now();
  },
};

export type EventType = 'game' | 'ownership' | 'intention';
export type Intention = 'embrace' | 'redeem';

export interface CharacterRecord {
  id: string;
  namespace: string;
  chainId: number | null;
  contract: string | null;
  tokenId: string;
  trust: number;
  notoriety: number;
  supplies: number;
  version: number;
  activeEpochId: string;
  createdAt: string;
}

export interface EpochRecord {
  id: string;
  characterId: string;
  controller: string;
  startedAt: string;
  endedAt: string | null;
  intention: Intention | null;
}

export interface EventRecord {
  id: string;
  characterId: string;
  epochId: string;
  actor: string;
  sequence: number;
  type: EventType;
  templateId: number | null;
  choiceId: string | null;
  rulesetVersion: string;
  text: string;
  before: Stats;
  after: Stats;
  titleBefore: string;
  titleAfter: string;
  createdAt: string;
  fixture: boolean;
}

export interface ConsequenceRecord extends ConsequenceState {
  characterId: string;
  status: ConsequenceState['status'];
}

export interface BudgetRecord {
  characterId: string;
  date: string;
  used: number;
}

export interface InstanceRecord {
  id: string;
  characterId: string;
  date: string;
  slot: number;
  templateId: number;
  resolvedEventId: string | null;
}

export interface ReceiptRecord {
  key: string;
  characterId: string;
  requestHash: string;
  payload: CommitReceipt;
}

export interface DbState {
  characters: CharacterRecord[];
  epochs: EpochRecord[];
  events: EventRecord[];
  budgets: BudgetRecord[];
  instances: InstanceRecord[];
  receipts: ReceiptRecord[];
  sequences: Record<string, number>;
  consequences: ConsequenceRecord[];
}

export interface CommitReceipt {
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
  consequence?: ConsequenceRecord | null;
  obligationClosed?: ConsequenceRecord | null;
}

export interface PlayView {
  stats: Stats;
  title: string;
  version: number;
  actionsUsed: number;
  nextResetUtc: string;
  encounter: EncounterView | null;
  instanceDate: string | null;
  intention: Intention | null;
  epochId: string;
  controller: string;
}

export interface ProfileModel {
  character: CharacterRecord;
  epoch: EpochRecord;
  title: string;
  started: boolean;
  actionsUsed: number;
  nextResetUtc: string;
  chronicleNewestFirst: EventRecord[];
  priorGameChapters: number;
  lastThreeGameEvents: EventRecord[];
  epochCount: number;
  instanceDate: string | null;
  openObligations: ConsequenceRecord[];
  consequences: ConsequenceRecord[];
}

export interface ActionRequest {
  characterId: string;
  controller: string;
  instanceId: string;
  choiceId: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface SyncResult {
  changed: boolean;
  epochId: string;
  controller: string;
}

export function emptyDb(): DbState {
  return { characters: [], epochs: [], events: [], budgets: [], instances: [], receipts: [], sequences: {}, consequences: [] };
}

export function storyFlagsFor(s: Pick<DbState, 'consequences' | 'events'>, characterId: string): StoryFlags {
  const openConsequences: ConsequenceState[] = (s.consequences ?? [])
    .filter(c => c.characterId === characterId)
    .map(c => ({
      kind: c.kind,
      status: c.status,
      openedSequence: c.openedSequence,
      originTemplateId: c.originTemplateId,
      originChoiceId: c.originChoiceId,
    }));
  const openCourier = openConsequences
    .filter(c => (c.kind === 'courier_trust' || c.kind === 'tax_grudge') && c.status === 'open')
    .sort((a, b) => a.openedSequence - b.openedSequence)[0];
  let openedDay: string | null = null;
  if (openCourier) {
    const ev = (s.events ?? []).find(e => e.characterId === characterId && e.sequence === openCourier.openedSequence);
    openedDay = ev ? ev.createdAt.slice(0, 10) : null;
  }
  return { openConsequences, latestCourierOpenedAtDay: openedDay };
}

export function canonicalIdentity(c: Pick<CharacterRecord, 'namespace' | 'chainId' | 'contract' | 'tokenId'>): string {
  return `${c.namespace}|${c.chainId ?? 'none'}|${(c.contract ?? 'none').toLowerCase()}|${c.tokenId}`;
}

function sg(n: number): string {
  return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
}

function effectSummary(d: Stats): string {
  return `Trust ${sg(d.trust)}, notoriety ${sg(d.notoriety)}, supplies ${sg(d.supplies)}.`;
}

export class GameService {
  constructor(
    private state: DbState,
    private readonly clock: Clock,
    private readonly persist: (s: DbState) => void,
    private readonly fixture: boolean,
  ) {}

  snapshot(): DbState {
    return this.state;
  }

  private run<T>(fn: (s: DbState) => T): T {
    const next: DbState = structuredClone(this.state);
    const out = fn(next);
    this.state = next;
    this.persist(next);
    return out;
  }

  private nextSeq(s: DbState, characterId: string): number {
    s.sequences[characterId] = (s.sequences[characterId] ?? 0) + 1;
    return s.sequences[characterId];
  }

  private requireCharacter(s: DbState, characterId: string): CharacterRecord {
    const char = s.characters.find(c => c.id === characterId);
    if (!char) throw new AppError('INVALID_INPUT', 'Unknown character');
    return char;
  }

  private requireController(s: DbState, characterId: string, controller: string): { char: CharacterRecord; epoch: EpochRecord } {
    const char = this.requireCharacter(s, characterId);
    const epoch = s.epochs.find(e => e.id === char.activeEpochId);
    if (!epoch) throw new AppError('STORAGE_UNAVAILABLE', 'No active ownership epoch');
    if (epoch.controller.toLowerCase() !== controller.trim().toLowerCase()) {
      throw new AppError('NOT_CURRENT_OWNER');
    }
    return { char, epoch };
  }

  private ensureDay(s: DbState, char: CharacterRecord, now: Date): { budget: BudgetRecord; instances: InstanceRecord[]; date: string } {
    const date = utcDateOf(now);
    let budget = s.budgets.find(b => b.characterId === char.id && b.date === date);
    if (!budget) {
      budget = { characterId: char.id, date, used: 0 };
      s.budgets.push(budget);
    }
    let instances = s.instances.filter(i => i.characterId === char.id && i.date === date);
    if (instances.length === 0) {
      const flags = storyFlagsFor(s, char.id);
      const situation = courierSituation(flags, date);
      const ids = situation === 'courier_recalled' || situation === 'waystone_promise'
        ? [0, 0, 0]
        : dailyTemplateIds(canonicalIdentity(char), date);
      instances = ids.map((templateId, slot) => ({
        id: `${char.id}#${date}#${slot}`,
        characterId: char.id,
        date,
        slot,
        templateId,
        resolvedEventId: null,
      }));
      s.instances.push(...instances);
    }
    instances.sort((a, b) => a.slot - b.slot);
    return { budget, instances, date };
  }

  private nextPlayable(instances: InstanceRecord[], situation: StorySituation): InstanceRecord | null {
    const open = instances.filter(i => i.resolvedEventId === null);
    if (open.length === 0) return null;
    if (situation === 'base') return open[0];
    return open.find(i => i.templateId === 0) ?? open[0];
  }

  private appendEvent(
    s: DbState,
    char: CharacterRecord,
    epoch: EpochRecord,
    actor: string,
    type: EventType,
    text: string,
    before: Stats,
    after: Stats,
    templateId: number | null = null,
    choiceId: string | null = null,
  ): EventRecord {
    const sequence = this.nextSeq(s, char.id);
    const ev: EventRecord = {
      id: `${char.id}#ev${sequence}`,
      characterId: char.id,
      epochId: epoch.id,
      actor,
      sequence,
      type,
      templateId,
      choiceId,
      rulesetVersion: RULESET_VERSION,
      text,
      before: { ...before },
      after: { ...after },
      titleBefore: deriveTitle(before),
      titleAfter: deriveTitle(after),
      createdAt: this.clock.now().toISOString(),
      fixture: this.fixture,
    };
    s.events.push(ev);
    return ev;
  }

  private nextResetUtc(now: Date): string {
    return nextUtcMidnight(now).toISOString();
  }

  getProfile(characterId: string): ProfileModel {
    return this.run(s => {
      const char = this.requireCharacter(s, characterId);
      const epoch = s.epochs.find(e => e.id === char.activeEpochId);
      if (!epoch) throw new AppError('STORAGE_UNAVAILABLE', 'No active ownership epoch');
      const now = this.clock.now();
      const { budget } = this.ensureDay(s, char, now);
      const events = s.events
        .filter(e => e.characterId === char.id)
        .sort((a, b) => b.sequence - a.sequence);
      const priorGameChapters = s.events.filter(e => e.characterId === char.id && e.type === 'game' && e.epochId !== epoch.id).length;
      const lastThreeGameEvents = s.events
        .filter(e => e.characterId === char.id && e.type === 'game')
        .sort((a, b) => b.sequence - a.sequence)
        .slice(0, 3);
      const instances = s.instances.filter(i => i.characterId === char.id && i.date === utcDateOf(now));
      return {
        character: { ...char },
        epoch: { ...epoch },
        title: deriveTitle(char),
        started: s.events.some(e => e.characterId === char.id && e.type === 'game'),
        actionsUsed: budget.used,
        nextResetUtc: this.nextResetUtc(now),
        chronicleNewestFirst: events,
        priorGameChapters,
        lastThreeGameEvents,
        epochCount: s.epochs.filter(e => e.characterId === char.id).length,
        instanceDate: instances[0]?.date ?? null,
        openObligations: s.consequences.filter(c => c.characterId === char.id && c.status === 'open'),
        consequences: s.consequences.filter(c => c.characterId === char.id),
      };
    });
  }

  getPlay(characterId: string, controller: string): PlayView {
    return this.run(s => {
      const now = this.clock.now();
      const { char, epoch } = this.requireController(s, characterId, controller);
      const { budget, instances, date } = this.ensureDay(s, char, now);
      const flags = storyFlagsFor(s, char.id);
      const situation = courierSituation(flags, date);
      const next = this.nextPlayable(instances, situation);
      const stats: Stats = { trust: char.trust, notoriety: char.notoriety, supplies: char.supplies };
      return {
        stats,
        title: deriveTitle(stats),
        version: char.version,
        actionsUsed: budget.used,
        nextResetUtc: this.nextResetUtc(now),
        encounter: next ? buildEncounterView(next.templateId, next.id, stats, flags, date) : null,
        instanceDate: next?.date ?? null,
        intention: epoch.intention,
        epochId: epoch.id,
        controller: epoch.controller,
      };
    });
  }

  commitAction(req: ActionRequest): CommitReceipt {
    return this.run(s => {
      const now = this.clock.now();
      const { char, epoch } = this.requireController(s, req.characterId, req.controller);

      const requestHash = hashRequest(req);
      const existing = s.receipts.find(r => r.key === req.idempotencyKey && r.characterId === req.characterId);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new AppError('INVALID_INPUT', 'Idempotency key reused with different input');
        }
        return { ...existing.payload, duplicate: true };
      }

      if (req.expectedVersion !== char.version) {
        throw new AppError('STATE_CHANGED', `Expected version ${req.expectedVersion}, found ${char.version}`);
      }

      const { budget, instances, date } = this.ensureDay(s, char, now);
      if (budget.used >= DAILY_ACTIONS) {
        throw new AppError('DAILY_LIMIT');
      }
      const flags = storyFlagsFor(s, char.id);
      const situation = courierSituation(flags, date);
      const instance = s.instances.find(i => i.id === req.instanceId);
      if (!instance || instance.characterId !== char.id) throw new AppError('INVALID_INPUT', 'Unknown encounter instance');
      if (instance.date !== date) {
        throw new AppError('STATE_CHANGED', 'Encounter belongs to a previous day');
      }
      if (instance.resolvedEventId) {
        throw new AppError('STATE_CHANGED', 'Encounter already resolved');
      }
      const expected = this.nextPlayable(instances, situation);
      if (!expected || instance.id !== expected.id) {
        throw new AppError('STATE_CHANGED', 'Only the next unresolved encounter can be played');
      }

      const template = instance.templateId;
      let choice: ChoiceDef | null = null;
      if (template === 0) {
        choice = courierChoices(flags, situation).find(c => c.id === req.choiceId) ?? null;
      }
      if (!choice) {
        try {
          choice = findChoice(getTemplate(template), req.choiceId);
        } catch {
          throw new AppError('INVALID_INPUT', 'Unknown choice');
        }
      }
      const before: Stats = { trust: char.trust, notoriety: char.notoriety, supplies: char.supplies };
      const elig = checkEligibility(choice, before);
      if (!elig.eligible) {
        throw new AppError('CHOICE_UNAVAILABLE', elig.lockReason);
      }

      const after = applyDelta(before, choice.delta);
      char.trust = after.trust;
      char.notoriety = after.notoriety;
      char.supplies = after.supplies;
      char.version += 1;
      budget.used += 1;
      let outcomeText = choice.outcome;
      let consequenceNote: ConsequenceRecord | null = null;
      let obligationClosed: ConsequenceRecord | null = null;
      if (template === 0) {
        const result = consequenceForChoice(template, choice.id, flags, date);
        if (result) {
          const nextFlags = applyConsequence(flags, result, (s.sequences[char.id] ?? 0) + 1, date, template);
          s.consequences = s.consequences.filter(c => c.characterId !== char.id);
          for (const c of nextFlags.openConsequences) {
            s.consequences.push({ characterId: char.id, ...c });
          }
          if (result.close) {
            const closed = s.consequences.find(c => c.characterId === char.id && c.kind === result.close!.kind && c.status === result.close!.status);
            if (closed) obligationClosed = closed;
            outcomeText += ' The obligation is settled.';
          }
          if (result.open) {
            const opened = s.consequences.find(c => c.characterId === char.id && c.kind === result.open!.kind && c.status === 'open');
            if (opened) {
              consequenceNote = opened;
              outcomeText += ' An unfinished promise now rides with the Chog.';
            }
          }
        }
      }
      const ev = this.appendEvent(
        s, char, epoch, epoch.controller, 'game',
        `${choice.label}. ${effectSummary(choice.delta)}`,
        before, after, template, choice.id,
      );
      instance.resolvedEventId = ev.id;

      const receipt: CommitReceipt = {
        receiptId: `${char.id}#rcpt${ev.sequence}`,
        eventId: ev.id,
        before,
        after,
        titleBefore: deriveTitle(before),
        titleAfter: deriveTitle(after),
        label: choice.label,
        text: outcomeText,
        actionsUsed: budget.used,
        left: DAILY_ACTIONS - budget.used,
        nextResetUtc: this.nextResetUtc(now),
        version: char.version,
        consequence: consequenceNote,
        obligationClosed,
      };
      s.receipts.push({ key: req.idempotencyKey, characterId: char.id, requestHash, payload: receipt });
      return receipt;
    });
  }

  syncOwnership(characterId: string, observedController: string): SyncResult {
    return this.run(s => {
      const now = this.clock.now();
      const char = this.requireCharacter(s, characterId);
      const current = s.epochs.find(e => e.id === char.activeEpochId);
      if (!current) throw new AppError('STORAGE_UNAVAILABLE', 'No active ownership epoch');
      const normalized = observedController.trim();
      if (!normalized) throw new AppError('INVALID_INPUT', 'Controller required');
      if (current.controller.toLowerCase() === normalized.toLowerCase()) {
        return { changed: false, epochId: current.id, controller: current.controller };
      }
      current.endedAt = now.toISOString();
      const count = s.epochs.filter(e => e.characterId === char.id).length + 1;
      const epoch: EpochRecord = {
        id: `${char.id}#epoch${count}`,
        characterId: char.id,
        controller: normalized,
        startedAt: now.toISOString(),
        endedAt: null,
        intention: null,
      };
      s.epochs.push(epoch);
      char.activeEpochId = epoch.id;
      char.version += 1;
      const before: Stats = { trust: char.trust, notoriety: char.notoriety, supplies: char.supplies };
      this.appendEvent(
        s, char, epoch, normalized, 'ownership',
        `Ownership observed. Controller is now ${normalized}. Stats, history and daily actions continue unchanged.`,
        before, before,
      );
      return { changed: true, epochId: epoch.id, controller: epoch.controller };
    });
  }

  setIntention(characterId: string, controller: string, epochId: string, intention: Intention): EpochRecord {
    return this.run(s => {
      const { char, epoch } = this.requireController(s, characterId, controller);
      if (epoch.id !== epochId) throw new AppError('STATE_CHANGED', 'Ownership epoch changed');
      if (epoch.intention !== null) throw new AppError('INVALID_INPUT', 'Intention already set for this epoch');
      epoch.intention = intention;
      char.version += 1;
      const before: Stats = { trust: char.trust, notoriety: char.notoriety, supplies: char.supplies };
      const text = intention === 'embrace'
        ? 'Chapter intention set: lean into the legend.'
        : 'Chapter intention set: begin a redemption chapter.';
      this.appendEvent(s, char, epoch, epoch.controller, 'intention', text, before, before);
      return { ...epoch };
    });
  }
}

export function hashRequest(req: ActionRequest): string {
  const base = `${req.characterId}|${req.controller.toLowerCase()}|${req.instanceId}|${req.choiceId}|${req.expectedVersion}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < base.length; i++) {
    h ^= base.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export const PRACTICE_NAMESPACE = 'practice-local';
export const PRACTICE_TOKEN_ID = 'practice-ashen-v1';
export const PRACTICE_CHARACTER_ID = `${PRACTICE_NAMESPACE}|${PRACTICE_TOKEN_ID}`;
export const CONTROLLER_A = 'Controller A — simulated';
export const CONTROLLER_B = 'Controller B — simulated';
export const PRACTICE_VILLAIN: Stats = Object.freeze({ trust: -35, notoriety: 70, supplies: 3 });

export function seedPractice(now: Date): DbState {
  const s = emptyDb();
  const createdAt = now.toISOString();
  const char: CharacterRecord = {
    id: PRACTICE_CHARACTER_ID,
    namespace: PRACTICE_NAMESPACE,
    chainId: null,
    contract: null,
    tokenId: PRACTICE_TOKEN_ID,
    trust: 0,
    notoriety: 0,
    supplies: INITIAL_STATS.supplies,
    version: 0,
    activeEpochId: `${PRACTICE_CHARACTER_ID}#epoch1`,
    createdAt,
  };
  const epoch: EpochRecord = {
    id: char.activeEpochId,
    characterId: char.id,
    controller: CONTROLLER_A,
    startedAt: createdAt,
    endedAt: null,
    intention: null,
  };
  s.characters.push(char);
  s.epochs.push(epoch);

  const originBefore: Stats = { ...INITIAL_STATS };
  const originAfter: Stats = { trust: -15, notoriety: 42, supplies: 1 };
  pushSeedEvent(s, epoch, 'ownership', 'Practice scenario (fixture)',
    'Practice scenario origin. This fictional Chog begins its simulated life already marked by an earlier life; the summary state below opens the scenario. Nothing here is on-chain.',
    originBefore, originAfter, null, null, createdAt, 1);

  let cur: Stats = { ...originAfter };
  const chapters: Array<{ templateId: number; choiceId: string; label: string; delta: Stats }> = [
    { templateId: 2, choiceId: 'demand', label: 'Demanded a seat at the table', delta: { trust: -6, notoriety: 8, supplies: 0 } },
    { templateId: 4, choiceId: 'scarier', label: 'Made the rumor scarier', delta: { trust: -4, notoriety: 10, supplies: 0 } },
    { templateId: 3, choiceId: 'keep', label: 'Kept the disputed cache', delta: { trust: -10, notoriety: 10, supplies: 2 } },
  ];
  let seq = 2;
  for (const ch of chapters) {
    const before = { ...cur };
    const after = applyDelta(before, ch.delta);
    pushSeedEvent(s, epoch, 'game', CONTROLLER_A, `${ch.label}. ${effectSummary(ch.delta)}`, before, after, ch.templateId, ch.choiceId, createdAt, seq);
    cur = after;
    seq += 1;
  }
  char.trust = cur.trust;
  char.notoriety = cur.notoriety;
  char.supplies = cur.supplies;
  char.version = 4;
  s.sequences[char.id] = seq - 1;
  return s;
}

function pushSeedEvent(
  s: DbState,
  epoch: EpochRecord,
  type: EventType,
  actor: string,
  text: string,
  before: Stats,
  after: Stats,
  templateId: number | null,
  choiceId: string | null,
  createdAt: string,
  sequence: number,
): void {
  s.events.push({
    id: `${epoch.characterId}#ev${sequence}`,
    characterId: epoch.characterId,
    epochId: epoch.id,
    actor,
    sequence,
    type,
    templateId,
    choiceId,
    rulesetVersion: RULESET_VERSION,
    text,
    before: { ...before },
    after: { ...after },
    titleBefore: deriveTitle(before),
    titleAfter: deriveTitle(after),
    createdAt,
    fixture: true,
  });
}
