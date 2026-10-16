// Dev-only gallery of every UI state, driven by fixtures. Excluded from production bundles.
import { useState } from 'react';
import s from '@/ui/ui.module.css';
import { checkpoint, fixtures } from '@/ui/fixtures';
import * as C from '@/ui/components';
import type { ErrorCode, Handlers, SaveState, Viewer } from '@/ui/types';

const log = (n: string) => () => console.log('[fixture handler, not connected]', n);
const h: Handlers = new Proxy({} as Handlers, { get: (_, k) => log(String(k)) });
const SCREENS = ['Entry', 'Entry: invalid ID', 'Profile: unstarted', 'Profile: owner', 'Profile: non-owner', 'Profile: quota used', 'Profile: stale owner',
  'Activation', 'Inheritance', 'Encounter: feared', 'Encounter: neutral (locked)', 'Encounter: saving', 'Encounter: failed save',
  'Outcome', 'Practice', 'Wallet states', 'Errors'] as const;

export default function Gallery() {
  const [scr, setScr] = useState<(typeof SCREENS)[number]>('Entry');
  const [viewer, setViewer] = useState<Viewer>('visitor');
  const f = fixtures, noop = () => {};
  const F = f.feared.stats;
  let body;
  switch (scr) {
    case 'Entry': body = <C.Entry h={h} />; break;
    case 'Entry: invalid ID': body = <C.Entry h={h} error="TOKEN_NOT_FOUND" />; break;
    case 'Profile: unstarted': body = <C.ProfileView p={f.unstarted} v="owner" h={h} onPlay={noop} />; break;
    case 'Profile: owner': body = <C.ProfileView p={f.feared} v="owner" h={h} onPlay={noop} />; break;
    case 'Profile: non-owner': body = <C.ProfileView p={f.nonOwner} v="non-owner" h={h} onPlay={noop} />; break;
    case 'Profile: quota used': body = <C.ProfileView p={f.exhausted} v="owner" h={h} onPlay={noop} />; break;
    case 'Profile: stale owner': body = <><C.ErrorNotice code="CHAIN_UNAVAILABLE" /><C.ProfileView p={{ ...f.feared, owner: { ...f.feared.owner, status: 'stale' } }} v="owner" h={h} onPlay={noop} /></>; break;
    case 'Activation': body = <C.Activation onActivate={noop} onCancel={noop} />; break;
    case 'Inheritance': body = <C.Inheritance p={f.inherited} onContinue={noop} />; break;
    case 'Encounter: feared': body = <C.EncounterView e={checkpoint(F)} st={F} used={1} next={f.feared.nextResetLocal} save="idle" onSubmit={noop} />; break;
    case 'Encounter: neutral (locked)': body = <C.EncounterView e={checkpoint({ trust: 0, notoriety: 0, supplies: 0 })} st={{ trust: 0, notoriety: 0, supplies: 0 }} used={0} next={f.neutral.nextResetLocal} save="idle" onSubmit={noop} />; break;
    case 'Encounter: saving': body = <C.EncounterView e={checkpoint(F)} st={F} used={1} next="tomorrow" save={'pending' as SaveState} onSubmit={noop} />; break;
    case 'Encounter: failed save': body = <C.EncounterView e={checkpoint(F)} st={F} used={1} next="tomorrow" save="failed" error={'STORAGE_UNAVAILABLE' as ErrorCode} onSubmit={noop} />; break;
    case 'Outcome': body = <C.Outcome before={F} after={{ trust: -43, notoriety: 76, supplies: 4 }} titleBefore="The Feared" titleAfter="The Feared" text="The gate opens. Nobody meets your eyes." left={1} next={f.feared.nextResetLocal} receipt="fixture-001" onNext={noop} onChronicle={noop} />; break;
    case 'Practice': body = <><C.PracticeBar h={h} /><C.ProfileView p={f.practice} v="owner" h={h} onPlay={noop} /></>; break;
    case 'Wallet states': body = <main className={s.page}><label>State <select value={viewer} onChange={e => setViewer(e.target.value as Viewer)}>
      {(['visitor', 'connected', 'awaiting', 'cancelled', 'owner', 'non-owner', 'expired', 'unsupported', 'switched'] as Viewer[]).map(v => <option key={v}>{v}</option>)}</select></label>
      <C.SessionBar v={viewer} h={h} address="0x12…34ab (fixture)" /></main>; break;
    case 'Errors': body = <main className={s.page}>{(['INVALID_INPUT', 'ORIGIN_DENIED', 'SIGN_IN_REQUIRED', 'NOT_CURRENT_OWNER', 'STATE_CHANGED', 'CHOICE_UNAVAILABLE', 'DAILY_LIMIT', 'RATE_LIMITED', 'CHAIN_UNAVAILABLE', 'STORAGE_UNAVAILABLE'] as ErrorCode[]).map(c => <C.ErrorNotice key={c} code={c} />)}</main>; break;
  }
  return (<div>
    <nav className={s.gallery} aria-label="Fixture gallery (dev only)"><b>Fixture gallery (dev only)</b>
      <select value={scr} onChange={e => setScr(e.target.value as typeof scr)}>{SCREENS.map(x => <option key={x}>{x}</option>)}</select></nav>
    {body}</div>);
}
