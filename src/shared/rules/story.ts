import type { ChoiceDef, Stats } from './types';

export type ConsequenceKind = 'courier_trust' | 'tax_grudge' | 'waystone_promise';
export type ConsequenceStatus = 'open' | 'fulfilled' | 'returned' | 'sold' | 'refused';

export interface ConsequenceState {
  kind: ConsequenceKind;
  status: ConsequenceStatus;
  openedSequence: number;
  originTemplateId: number | null;
  originChoiceId: string | null;
}

export interface StoryFlags {
  openConsequences: ConsequenceState[];
  latestCourierOpenedAtDay: string | null;
}

export const EMPTY_STORY: StoryFlags = Object.freeze({ openConsequences: [], latestCourierOpenedAtDay: null });
export const COURIER_TEMPLATE_ID = 0;

const COURIER_KINDS: readonly ConsequenceKind[] = ['courier_trust', 'tax_grudge'];

export type StorySituation = 'base' | 'courier_recalled' | 'waystone_promise';

function bySeq(a: ConsequenceState, b: ConsequenceState): number {
  return a.openedSequence - b.openedSequence;
}

function latestOf(flags: StoryFlags, kinds: readonly ConsequenceKind[]): ConsequenceState | null {
  const rows = flags.openConsequences.filter(c => kinds.includes(c.kind)).sort(bySeq);
  return rows.length > 0 ? rows[rows.length - 1] : null;
}

function hasOpen(flags: StoryFlags, kind: ConsequenceKind): boolean {
  return flags.openConsequences.some(c => c.kind === kind && c.status === 'open');
}

export function openConsequences(flags: StoryFlags): ConsequenceState[] {
  return flags.openConsequences.filter(c => c.status === 'open').sort(bySeq);
}

export function courierRecallReady(flags: StoryFlags, today: string): boolean {
  if (hasOpen(flags, 'waystone_promise')) return false;
  const courier = latestOf(flags, COURIER_KINDS);
  return courier !== null && courier.status === 'open' && flags.latestCourierOpenedAtDay !== null && flags.latestCourierOpenedAtDay !== today;
}

export function waystoneReady(flags: StoryFlags): boolean {
  return hasOpen(flags, 'waystone_promise');
}

export function courierSituation(flags: StoryFlags, today: string): StorySituation {
  if (waystoneReady(flags)) return 'waystone_promise';
  if (courierRecallReady(flags, today)) return 'courier_recalled';
  return 'base';
}

const WAYSTONE_FROM_TAX = 'The factor slides the waystone across the cloth. “Your courier left this with me. The wayhouse still waits. Finish it.”';

const BASE_COURIER = 'A courier’s cart lies tipped in the ditch, wheels spinning free. The courier watches you from the roadside, clutching a torn manifest.';
const RECALL_TRUST = 'The courier who met you before is back at the crossroads with a cloth-wrapped waystone. The tax-factor (a story character, not a holder) has laid a claim. They ask you to settle it — or to leave them to it.';
const RECALL_TAX = 'The same courier blocks the road again, ledger open. “Your name is still in this book,” they say. “And so is a waystone you helped me claim. Deliver it, or deny the debt and walk on.”';

const WAYSTONE_FROM_SHARE = 'The courier sets the cloth-wrapped waystone on the roadside table and pushes it toward you. “The wayhouse still waits,” they say. “You kept your word before. Keep it now — or hand it back, or sell it at the crossroads. I cannot carry it.”';

function courierOrigin(flags: StoryFlags): ConsequenceKind {
  const courier = latestOf(flags, COURIER_KINDS);
  if (courier?.kind === 'tax_grudge') return 'tax_grudge';
  return 'courier_trust';
}

function waystoneOrigin(flags: StoryFlags): ConsequenceKind {
  const promise = latestOf(flags, ['waystone_promise']);
  return promise?.originChoiceId === 'take_waystone' ? 'tax_grudge' : 'courier_trust';
}

export function courierText(flags: StoryFlags, situation: StorySituation): string {
  if (situation === 'waystone_promise') {
    return waystoneOrigin(flags) === 'tax_grudge' ? WAYSTONE_FROM_TAX : WAYSTONE_FROM_SHARE;
  }
  if (situation === 'courier_recalled') {
    return courierOrigin(flags) === 'tax_grudge' ? RECALL_TAX : RECALL_TRUST;
  }
  return BASE_COURIER;
}

export function courierChoices(flags: StoryFlags, situation: StorySituation): ChoiceDef[] {
  if (situation === 'waystone_promise') {
    const lead = waystoneOrigin(flags) === 'tax_grudge' ? WAYSTONE_FROM_TAX : WAYSTONE_FROM_SHARE;
    return [
      { id: 'carry', label: 'Carry the waystone to the wayhouse', blurb: 'Keep the promise you made.', outcome: `${lead} You walk it to the wayhouse yourself. The courier bows, and the road remembers a debt kept.`, delta: { trust: 12, notoriety: -5, supplies: -1 } },
      { id: 'hand_back', label: 'Hand the waystone back to the courier', blurb: 'Let them carry what they claimed.', outcome: `${lead} You push the stone back across the cloth. The courier’s shoulders drop, and they walk on carrying it. The debt is gone; the weight is theirs.`, delta: { trust: -5, notoriety: 8, supplies: 1 } },
      { id: 'sell', label: 'Sell the waystone at the crossroads', blurb: 'A quick purse, a longer memory.', outcome: `${lead} You sell it at the crossroads for a quick purse. The factor records the trade. Nothing is owed, and nothing is kept.`, delta: { trust: -10, notoriety: 10, supplies: 2 } },
    ];
  }
  if (situation === 'courier_recalled') {
    if (courierOrigin(flags) === 'tax_grudge') {
      return [
        { id: 'recall_listen', label: 'Hear the courier out', blurb: 'Let them finish the ledger.', outcome: 'You listen. The courier’s case is short, and the waystone is heavier than the debt.', delta: { trust: 0, notoriety: 0, supplies: 0 } },
        { id: 'take_waystone', label: 'Take the waystone to the wayhouse', blurb: 'Deliver it and be done.', outcome: 'You take the waystone. The courier marks the debt paid in their own hand, and the wayhouse still waits for the stone.', delta: { trust: -5, notoriety: 7, supplies: 1 } },
        { id: 'deny_debt', label: 'Deny the debt and walk on', blurb: 'Not your book, not your price.', outcome: 'You deny the debt. The courier closes the ledger, and the factor remembers a Chog that keeps nothing.', delta: { trust: 0, notoriety: 0, supplies: 0 } },
      ];
    }
    return [
      { id: 'recall_listen', label: 'Hear the courier out', blurb: 'Let them finish the story.', outcome: 'You listen. The courier’s story is short, and the waystone is heavier than the kindness.', delta: { trust: 0, notoriety: 0, supplies: 0 } },
      { id: 'settle_tax', label: 'Settle the tax from your own pack', blurb: 'Pay what you can spare.', outcome: 'You settle the tax from your own pack. The courier bows, and asks you to carry the waystone to the wayhouse so the record stays clean.', delta: { trust: 10, notoriety: -3, supplies: -1 } },
      { id: 'refuse_courier', label: 'Refuse and leave the courier to the factor', blurb: 'Some ledgers are not yours.', outcome: 'You leave the courier to the factor. The courier’s face hardens, and the road keeps the rest.', delta: { trust: -5, notoriety: 7, supplies: 1 } },
    ];
  }
  return [
    { id: 'share', label: 'Share supplies', blurb: 'Give what you can spare.', outcome: 'You hand over a portion. The courier bows, and promises the road will remember it.', delta: { trust: 10, notoriety: -3, supplies: -1 }, requires: { minSupplies: 1 } },
    { id: 'reward', label: 'Demand a reward', blurb: 'Help has a price.', outcome: 'You name your price. The courier pays, and tells the story with a sneer.', delta: { trust: -5, notoriety: 7, supplies: 1 } },
    { id: 'pass', label: 'Pass by', blurb: 'Not your road, not your problem.', outcome: 'You walk on. The cart stays in the ditch, and so does your name.', delta: { trust: 0, notoriety: 0, supplies: 0 } },
  ];
}

export interface ChoiceResult {
  open?: { kind: ConsequenceKind; originChoiceId: string };
  close?: { kind: ConsequenceKind; status: ConsequenceStatus };
}

export function consequenceForChoice(templateId: number, choiceId: string, flags: StoryFlags, today: string): ChoiceResult | null {
  if (templateId !== COURIER_TEMPLATE_ID) return null;
  const situation = courierSituation(flags, today);
  if (situation === 'waystone_promise') {
    if (choiceId === 'carry') return { close: { kind: 'waystone_promise', status: 'fulfilled' } };
    if (choiceId === 'hand_back') return { close: { kind: 'waystone_promise', status: 'returned' } };
    if (choiceId === 'sell') return { close: { kind: 'waystone_promise', status: 'sold' } };
    return null;
  }
  if (situation === 'courier_recalled') {
    const origin = courierOrigin(flags);
    if (choiceId === 'settle_tax') return { close: { kind: 'courier_trust', status: 'refused' }, open: { kind: 'waystone_promise', originChoiceId: 'settle_tax' } };
    if (choiceId === 'take_waystone') return { close: { kind: 'tax_grudge', status: 'refused' }, open: { kind: 'waystone_promise', originChoiceId: 'take_waystone' } };
    if (choiceId === 'refuse_courier' && origin === 'courier_trust') return { close: { kind: 'courier_trust', status: 'refused' } };
    if (choiceId === 'deny_debt' && origin === 'tax_grudge') return { close: { kind: 'tax_grudge', status: 'refused' } };
    return null;
  }
  if (choiceId === 'share') return { open: { kind: 'courier_trust', originChoiceId: 'share' } };
  if (choiceId === 'reward') return { open: { kind: 'tax_grudge', originChoiceId: 'reward' } };
  return null;
}

export function applyConsequence(
  flags: StoryFlags,
  result: ChoiceResult,
  sequence: number,
  utcDate: string,
  templateId: number,
): StoryFlags {
  const next = flags.openConsequences.map(c => ({ ...c }));
  if (result.close) {
    const open = next.find(c => c.kind === result.close!.kind && c.status === 'open');
    if (open) open.status = result.close!.status;
  }
  if (result.open) {
    next.push({
      kind: result.open.kind,
      status: 'open',
      openedSequence: sequence,
      originTemplateId: templateId,
      originChoiceId: result.open.originChoiceId,
    });
  }
  const courierOpened = result.open && COURIER_KINDS.includes(result.open.kind);
  return {
    openConsequences: next,
    latestCourierOpenedAtDay: courierOpened ? utcDate : flags.latestCourierOpenedAtDay,
  };
}

export function previewStats(before: Stats, delta: Stats): Stats {
  return {
    trust: Math.max(-100, Math.min(100, before.trust + delta.trust)),
    notoriety: Math.max(0, Math.min(100, before.notoriety + delta.notoriety)),
    supplies: Math.max(0, Math.min(10, before.supplies + delta.supplies)),
  };
}
