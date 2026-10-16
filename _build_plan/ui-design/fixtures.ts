// FIXTURES ONLY — fictional data. Never import in production fetching code.
import type { Encounter, Entry, Profile, Stats } from './types';
const when = '(fixture date)';
const g = (id: string, who: string, text: string): Entry => ({ id, kind: 'game', who, when, text, fixture: true });
const hist: Entry[] = [
  g('3', 'Controller A (fixture)', 'Kept the disputed cache. Trust −10, notoriety +10.'),
  g('2', 'Controller A (fixture)', 'Made the rumor scarier. Trust −4, notoriety +10.'),
  g('1', 'Controller A (fixture)', 'Demanded a seat at the table. Trust −6, notoriety +8.'),
];
const base: Profile = {
  mode: 'real', tokenId: '1425', name: 'Chog #1425 (fixture)',
  owner: { label: '0x12…34ab (fixture)', observedAt: '2 min ago (fixture)', status: 'fresh' },
  started: true, stats: { trust: 0, notoriety: 0, supplies: 3 }, title: 'The Unwritten', version: 4,
  actionsUsed: 1, nextResetLocal: '01:00 WAT tomorrow (fixture)', intention: null,
  coverage: 'partial', lastIndexedBlock: 1234567, chronicle: [],
};
export const fixtures: Record<string, Profile> = {
  unstarted: { ...base, started: false, version: 0, actionsUsed: 0, chronicle: [
    { id: 'c1', kind: 'chain', who: 'Chain log', when, text: 'Minted to 0x12…34ab (fixture hash).', txHash: '0xFIXTURE', block: 1, fixture: true }] },
  neutral: { ...base, chronicle: [g('n1', 'Current owner (fixture)', 'Passed by the stranded courier. No change.')] },
  feared: { ...base, stats: { trust: -35, notoriety: 70, supplies: 3 }, title: 'The Feared', chronicle: hist },
  inherited: { ...base, stats: { trust: -35, notoriety: 70, supplies: 3 }, title: 'The Feared', chronicle: [
    { id: 'o1', kind: 'ownership', who: 'Controller B (fixture)', when, text: 'Ownership observed. Stats, history and daily actions continue unchanged.', fixture: true }, ...hist],
    inheritedFrom: { priorChapters: 1, lastThree: hist } },
  nonOwner: { ...base, stats: { trust: -35, notoriety: 70, supplies: 3 }, title: 'The Feared', chronicle: hist },
  exhausted: { ...base, stats: { trust: -25, notoriety: 76, supplies: 4 }, title: 'The Feared', actionsUsed: 3, chronicle: hist },
  practice: { ...base, mode: 'practice', tokenId: 'practice', name: 'Ashen Chog (practice character)',
    owner: { label: 'Controller A — simulated', observedAt: 'n/a', status: 'fresh' },
    stats: { trust: -35, notoriety: 70, supplies: 3 }, title: 'The Feared', actionsUsed: 0, coverage: 'complete', chronicle: hist },
};
// Mirrors encounter 1 of the FRD table to show locked/unlocked states. Real data comes from the server.
export const checkpoint = (s: Stats): Encounter => {
  const c = (n: number) => Math.max(-100, Math.min(100, n)), p = (n: number) => Math.max(0, Math.min(100, n)), q = (n: number) => Math.max(0, Math.min(10, n));
  const mk = (id: string, label: string, blurb: string, d: [number, number, number], ok: boolean, why?: string) => ({
    id, label, blurb, eligible: ok, lockReason: ok ? undefined : why,
    delta: { trust: d[0], notoriety: d[1], supplies: d[2] },
    preview: { trust: c(s.trust + d[0]), notoriety: p(s.notoriety + d[1]), supplies: q(s.supplies + d[2]) } });
  return { instanceId: 'fixture-inst-1', title: 'A checkpoint',
    text: 'Guards hold the bridge road. They look at you, then at the lantern-lit ledger on the gate.',
    choices: [
      mk('fair', 'Trade fairly', 'Pay the toll in kind.', [6, 0, -1], s.supplies >= 1, 'Needs 1 supply (you have 0)'),
      mk('name', 'Use your feared name', 'Let the legend open the gate.', [-8, 6, 1], s.notoriety >= 60, `Needs notoriety 60 (now ${s.notoriety})`),
      mk('long', 'Take the long route', 'Slower, quieter.', [2, -2, 0], true)] };
};
