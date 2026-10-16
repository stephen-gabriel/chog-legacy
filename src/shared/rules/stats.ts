import type { Stats, Title } from './types';

export const TRUST_MIN = -100;
export const TRUST_MAX = 100;
export const NOTORIETY_MIN = 0;
export const NOTORIETY_MAX = 100;
export const SUPPLIES_MIN = 0;
export const SUPPLIES_MAX = 10;

export const INITIAL_STATS: Stats = Object.freeze({ trust: 0, notoriety: 0, supplies: 3 });

export function clampTrust(n: number): number {
  return Math.max(TRUST_MIN, Math.min(TRUST_MAX, n));
}

export function clampNotoriety(n: number): number {
  return Math.max(NOTORIETY_MIN, Math.min(NOTORIETY_MAX, n));
}

export function clampSupplies(n: number): number {
  return Math.max(SUPPLIES_MIN, Math.min(SUPPLIES_MAX, n));
}

export function clampStats(s: Stats): Stats {
  return { trust: clampTrust(s.trust), notoriety: clampNotoriety(s.notoriety), supplies: clampSupplies(s.supplies) };
}

export function applyDelta(before: Stats, delta: Stats): Stats {
  return clampStats({
    trust: before.trust + delta.trust,
    notoriety: before.notoriety + delta.notoriety,
    supplies: before.supplies + delta.supplies,
  });
}

export function deriveTitle(s: Stats): Title {
  if (s.notoriety >= 60 && s.trust <= -20) return 'The Feared';
  if (s.trust >= 40) return 'The Trusted';
  if (s.notoriety >= 40) return 'The Notorious';
  return 'The Unwritten';
}

export function statsEqual(a: Stats, b: Stats): boolean {
  return a.trust === b.trust && a.notoriety === b.notoriety && a.supplies === b.supplies;
}
