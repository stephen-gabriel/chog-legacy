import { TEMPLATE_COUNT } from './encounters';

export const RULESET_VERSION = 'legacy-v1';
export const DAILY_ACTIONS = 3;

export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function dailyTemplateIds(identity: string, utcDate: string): number[] {
  const start = hash32(`${RULESET_VERSION}|${identity}|${utcDate}`) % TEMPLATE_COUNT;
  return [0, 1, 2].map(i => (start + i) % TEMPLATE_COUNT);
}

export function utcDateOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function nextUtcMidnight(from: Date): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
}
