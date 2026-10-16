import { useState } from 'react';
import s from './ui.module.css';
import type { Choice, Encounter, Entry, ErrorCode, Handlers, Profile, SaveState, Stats, Viewer } from './types';

const sg = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
const ST = (n: number) => String(n).replace('-', '−');

/* ---------- shared ---------- */
export function PracticeBar({ h }: { h: Pick<Handlers, 'onPracticeReset' | 'onPracticeHandoff' | 'onLeavePractice'> }) {
  return (
    <div className={s.sim} role="region" aria-label="Practice mode">
      <p><b>Practice: simulation.</b> A fictional Chog with fixture history. Nothing here is on-chain or saved to real Chogs.</p>
      <div className={s.row}>
        <button className={s.btn2} onClick={h.onPracticeHandoff}>Simulate controller change</button>
        <button className={s.btn2} onClick={h.onPracticeReset}>Reset practice</button>
        <button className={s.link} onClick={h.onLeavePractice}>Leave practice</button>
      </div>
    </div>
  );
}

const MSG: Record<ErrorCode, [string, string]> = {
  INVALID_INPUT: ['That input is not valid.', 'Check the token ID: whole numbers only.'],
  SIGN_IN_REQUIRED: ['Sign in again.', 'Your session ended. No action was used.'],
  NOT_CURRENT_OWNER: ['This wallet no longer owns this Chog.', 'You can still read its chronicle. Refresh ownership to confirm.'],
  TOKEN_NOT_FOUND: ['No such token exists.', 'Try another ID or play the practice scenario.'],
  STATE_CHANGED: ['The Chog changed while you were deciding.', 'We reloaded it. Review the updated outcomes and choose again.'],
  CHOICE_UNAVAILABLE: ['That choice is no longer available.', 'Its requirement is no longer met. Pick another.'],
  DAILY_LIMIT: ['All three daily decisions are used.', 'The allowance belongs to the Chog and resets at the time shown.'],
  RATE_LIMITED: ['Too many requests.', 'Wait a moment, then retry. Nothing was spent.'],
  CHAIN_UNAVAILABLE: ['Ownership can’t be verified right now.', 'Decisions are paused. You can read the last known state, marked stale.'],
  STORAGE_UNAVAILABLE: ['Your decision was not saved.', 'No action was used. Retrying is safe.'],
};
export function ErrorNotice({ code, onRetry }: { code: ErrorCode; onRetry?: () => void }) {
  const [t, d] = MSG[code];
  return (
    <div className={s.err} role="alert">
      <b>✕ {t}</b> <span>{d}</span> <code>{code}</code>
      {onRetry && <button className={s.btn2} onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Meter({ label, v, min, max, after }: { label: string; v: number; min: number; max: number; after?: number }) {
  const pc = (n: number) => ((n - min) / (max - min)) * 100;
  const changed = after !== undefined && after !== v;
  return (
    <div className={s.meter}>
      <div className={s.mh}><span>{label}</span><b>{ST(v)}{changed && <> → <em className={s.after}>{ST(after!)}</em></>}</b></div>
      <div className={s.track} role="img" aria-label={`${label} ${v}${changed ? `, becomes ${after}` : ''}, range ${min} to ${max}`}>
        {min < 0 && <i className={s.zero} />}
        <i className={s.mark} style={{ left: `${pc(v)}%` }} />
        {changed && <i className={s.ghost} style={{ left: `${pc(after!)}%` }} />}
      </div>
    </div>
  );
}
export function Ledger({ st, after }: { st: Stats; after?: Stats }) {
  return (
    <div className={s.ledger}>
      <Meter label="Trust" v={st.trust} min={-100} max={100} after={after?.trust} />
      <Meter label="Notoriety" v={st.notoriety} min={0} max={100} after={after?.notoriety} />
      <div className={s.meter}>
        <div className={s.mh}><span>Supplies</span><b>{st.supplies}{after && after.supplies !== st.supplies && <> → <em className={s.after}>{after.supplies}</em></>} / 10</b></div>
        <div className={s.pips} aria-hidden>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < st.supplies ? s.on : ''} />)}</div>
      </div>
    </div>
  );
}

export function Portrait({ url, name }: { url?: string; name: string }) {
  const [bad, setBad] = useState(false);
  return url && !bad ? <img className={s.portrait} src={url} alt={name} onError={() => setBad(true)} /> : (
    <div className={s.portrait} role="img" aria-label="No image available for this Chog">
      <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden><circle cx="32" cy="34" r="20" fill="none" stroke="currentColor" strokeWidth="3" /><circle cx="25" cy="31" r="3" fill="currentColor" /><circle cx="39" cy="31" r="3" fill="currentColor" /><path d="M24 43q8 5 16 0" fill="none" stroke="currentColor" strokeWidth="3" /></svg>
      <small>Image unavailable</small>
    </div>
  );
}

/* ---------- session ---------- */
const VIEW: Record<Viewer, string> = {
  visitor: 'Not connected', connected: 'Wallet connected, not signed in', awaiting: 'Waiting for your signature…',
  cancelled: 'Signature cancelled. You are read-only.', owner: 'Signed in, owns this Chog', 'non-owner': 'Signed in, does not own this Chog',
  expired: 'Session expired. Sign in again.', unsupported: 'This wallet type can’t sign in here.', switched: 'Wallet account changed. Sign in again.',
};
export function SessionBar({ v, h, address }: { v: Viewer; h: Handlers; address?: string }) {
  const wallet = v !== 'visitor', signed = v === 'owner' || v === 'non-owner';
  return (
    <section className={s.session} aria-label="Wallet and session">
      <ul className={s.chips}>
        <li data-on={wallet}>{wallet ? '● ' : '○ '}Wallet {wallet ? 'connected' : 'not connected'}{address && wallet ? ` ${address}` : ''}</li>
        <li data-on={signed}>{signed ? '● ' : '○ '}{signed ? 'Signed in' : 'Not signed in'}</li>
        <li data-on={v === 'owner'}>{v === 'owner' ? '● Owns this Chog' : '○ Ownership not confirmed'}</li>
      </ul>
      <p role="status">{VIEW[v]}</p>
      <div className={s.row}>
        {v === 'visitor' && <button className={s.btn} onClick={h.onConnect}>Connect wallet</button>}
        {(v === 'connected' || v === 'cancelled' || v === 'expired' || v === 'switched') && <button className={s.btn} onClick={h.onSignIn}>Sign in</button>}
        {v === 'awaiting' && <button className={s.btn2} onClick={h.onCancelSignIn}>Cancel</button>}
        {v !== 'visitor' && v !== 'awaiting' && <button className={s.btn2} onClick={h.onDisconnect}>{signed ? 'Log out' : 'Disconnect'}</button>}
      </div>
      {(v === 'connected' || v === 'awaiting') && <p className={s.fine}>Signing is a free message that proves you control this wallet. It is not a transaction or approval, and moves nothing.</p>}
    </section>
  );
}

/* ---------- entry ---------- */
export function Entry({ h, error }: { h: Handlers; error?: ErrorCode }) {
  const [id, setId] = useState('');
  const ok = /^\d+$/.test(id);
  return (
    <main className={s.page}>
      <h1 className={s.display}>The Chog keeps its past.<br />You choose its next chapter.</h1>
      <p className={s.lede}>A short daily story game. Every Chog carries its reputation to whoever owns it next. You inherit the consequences, then decide what comes after.</p>
      <div className={s.split}>
        <section className={s.card}>
          <h2>Look up a real Chog</h2>
          <p className={s.fine}>Reads public chain data. No wallet needed.</p>
          <label htmlFor="tok">Token ID</label>
          <div className={s.row}>
            <input id="tok" inputMode="numeric" value={id} aria-invalid={!!id && !ok} aria-describedby="tokh" onChange={e => setId(e.target.value.trim())} onKeyDown={e => e.key === 'Enter' && ok && h.onLookup(id)} />
            <button className={s.btn} disabled={!ok} onClick={() => h.onLookup(id)}>Open profile</button>
          </div>
          <p id="tokh" className={s.fine}>{id && !ok ? 'Use whole numbers only, like 1425.' : 'Example: 1425'}</p>
          {error && <ErrorNotice code={error} />}
        </section>
        <section className={`${s.card} ${s.cardSim}`}>
          <h2>Try it in practice</h2>
          <p>Play a fictional feared Chog, hand it to a new controller, and watch its past stay put. About 30 seconds. No wallet.</p>
          <button className={s.btn} onClick={h.onStartPractice}>Start practice</button>
        </section>
      </div>
      <p className={s.fine}>Real profiles show chain facts and saved gameplay separately. Practice is always labeled as a simulation.</p>
    </main>
  );
}

/* ---------- profile ---------- */
export function QuotaPanel({ used, next }: { used: number; next: string }) {
  const left = 3 - used;
  return (
    <div className={s.quota}>
      <span className={s.pips} aria-hidden>{[0, 1, 2].map(i => <i key={i} className={i < left ? s.on : ''} />)}</span>
      <div><b>{left === 0 ? 'No decisions left today' : `${left} of 3 decisions left today`}</b>
        <small>Next reset {next}. Belongs to the Chog, so a new owner can’t refill it.</small></div>
    </div>
  );
}

export function ProfileView({ p, v, h, onPlay }: { p: Profile; v: Viewer; h: Handlers; onPlay(): void }) {
  const o = p.owner;
  const stale = o.status !== 'fresh';
  return (
    <main className={s.page}>
      <header className={s.head}>
        <Portrait url={p.imageUrl} name={p.name} />
        <div>
          <p className={s.tag}>{p.mode === 'practice' ? 'Practice character (simulated)' : 'Real Chog, Monad mainnet'}</p>
          <h1 className={s.display}>{p.name}</h1>
          <p className={s.title}>{p.started ? p.title : 'Unwritten: no gameplay yet'}</p>
          {p.traits ? <p className={s.fine}>Traits (reported metadata): {p.traits.join(', ')}</p> : <p className={s.fine}>Traits unavailable right now.</p>}
        </div>
      </header>

      <section className={s.card} aria-labelledby="own">
        <h2 id="own">On-chain facts</h2>
        <p>Current owner: <code>{o.label}</code></p>
        <p className={stale ? s.warn : s.fine} role="status">
          {o.status === 'fresh' ? `✓ Verified ${o.observedAt}` : o.status === 'stale' ? `⚠ Stale: last verified ${o.observedAt}. Decisions are paused.` : '⚠ Ownership can’t be read right now.'}
        </p>
        {p.mode === 'real' && <button className={s.btn2} onClick={h.onRefreshOwner}>Refresh ownership</button>}
      </section>

      <section className={s.card} aria-labelledby="gp">
        <h2 id="gp">Saved gameplay <small>(in-app fiction)</small></h2>
        {p.started ? <><Ledger st={p.stats} /><QuotaPanel used={p.actionsUsed} next={p.nextResetLocal} /></> :
          <p>No chapters yet. Chain history is shown as provenance, not reputation. The first verified owner starts the story with neutral stats.</p>}
      </section>

      <div className={s.row}>
        {v === 'owner' && p.actionsUsed < 3 && <button className={s.btn} onClick={onPlay}>{p.started ? 'Continue the story' : 'Start the story'}</button>}
        {v === 'owner' && p.actionsUsed >= 3 && <p className={s.fine}>Come back after the reset. Past chapters stay readable below.</p>}
        {v === 'non-owner' && <p className={s.fine}>This wallet doesn’t own this Chog. You’re viewing read-only.</p>}
        <button className={s.btn2} onClick={() => navigator.clipboard?.writeText(location.href)}>Copy profile link</button>
      </div>
      <Chronicle p={p} h={h} />
    </main>
  );
}

/* ---------- activation + inheritance ---------- */
export function Activation({ onActivate, onCancel }: { onActivate(): void; onCancel(): void }) {
  return (
    <main className={s.page}><section className={s.card}>
      <h1 className={s.display}>Begin this Chog’s story</h1>
      <p>Wallet ownership is verified. No chapters exist yet, so it starts neutral: trust 0, notoriety 0, supplies 3. Past transfers are provenance only.</p>
      <div className={s.row}><button className={s.btn} onClick={onActivate}>Activate</button><button className={s.btn2} onClick={onCancel}>Stay read-only</button></div>
    </section></main>
  );
}

export function Inheritance({ p, h, onContinue }: { p: Profile; h: Handlers; onContinue(): void }) {
  const [pick, setPick] = useState<'embrace' | 'redeem' | 'skip'>('skip');
  const inh = p.inheritedFrom;
  return (
    <main className={s.page}>
      <h1 className={s.display}>You inherited {p.title === 'The Feared' ? 'a feared Chog' : 'a Chog with a past'}</h1>
      <p className={s.lede}>Everything below continues unchanged. You can’t edit earlier chapters; you decide what comes next.</p>
      <section className={s.card}>
        <h2>{p.title}</h2><Ledger st={p.stats} />
        <ul className={s.keeps}><li>✓ Stats and title</li><li>✓ Earlier chapters ({inh?.priorChapters ?? 0} before yours)</li><li>✓ Today’s daily actions ({3 - p.actionsUsed} left)</li></ul>
        {p.title === 'The Feared' && <p className={s.fine}>Intimidation options are open. Cooperative options that need trust stay locked until you earn it.</p>}
      </section>
      <section className={s.card}><h2>Last three choices</h2>
        <ol className={s.log}>{inh?.lastThree.map(e => <li key={e.id}><b>{e.who}</b> {e.text}{e.fixture && <em className={s.fx}> fixture</em>}</li>)}</ol></section>
      <fieldset className={s.card}>
        <legend>Chapter intention (optional)</legend>
        <p className={s.fine}>Sets the story’s framing only. Stats change only through your decisions. You can choose once per ownership.</p>
        {([['embrace', 'Lean into the legend'], ['redeem', 'Begin a redemption chapter'], ['skip', 'Decide later']] as const).map(([k, l]) => (
          <label key={k} className={s.opt}><input type="radio" name="int" checked={pick === k} onChange={() => setPick(k)} /> {l}</label>))}
      </fieldset>
      <div className={s.row}><button className={s.btn} onClick={() => { h.onIntention(pick); onContinue(); }}>Continue to today’s encounter</button></div>
    </main>
  );
}

/* ---------- encounter + outcome ---------- */
export function EncounterView({ e, st, used, next, save, error, onSubmit }: {
  e: Encounter; st: Stats; used: number; next: string; save: SaveState; error?: ErrorCode; onSubmit(choiceId: string): void;
}) {
  const [sel, setSel] = useState<string>();
  const ch = e.choices.find(c => c.id === sel);
  const pending = save === 'pending';
  return (
    <main className={s.page}>
      <p className={s.tag}>Decision {used + 1} of 3 today</p>
      <h1 className={s.display}>{e.title}</h1>
      <p className={s.lede}>{e.text}</p>
      <Ledger st={st} after={ch?.preview} />
      <fieldset className={s.choices} disabled={pending}>
        <legend>Choose one. This is saved only after the server confirms it.</legend>
        {e.choices.map(c => <ChoiceRow key={c.id} c={c} sel={sel === c.id} onPick={() => setSel(c.id)} />)}
      </fieldset>
      {error && <ErrorNotice code={error} />}
      <div className={s.row} aria-live="polite">
        <button className={s.btn} disabled={!ch || pending} onClick={() => ch && onSubmit(ch.id)}>{pending ? 'Saving…' : ch ? `Confirm: ${ch.label}` : 'Select a choice'}</button>
        {save === 'pending' && <span className={s.fine}>Waiting for the server. Don’t close this page.</span>}
      </div>
      <p className={s.fine}>Leaving this unresolved costs nothing. Resets {next}.</p>
    </main>
  );
}
function ChoiceRow({ c, sel, onPick }: { c: Choice; sel: boolean; onPick(): void }) {
  const d = c.delta;
  return (
    <label className={`${s.choice} ${sel ? s.sel : ''} ${c.eligible ? '' : s.locked}`}>
      <input type="radio" name="choice" disabled={!c.eligible} checked={sel} onChange={onPick} aria-describedby={`d-${c.id}`} />
      <span><b>{c.label}</b> <span className={s.blurb}>{c.blurb}</span>
        <span id={`d-${c.id}`} className={s.fx2}>
          {c.eligible ? `Trust ${sg(d.trust)} · Notoriety ${sg(d.notoriety)} · Supplies ${sg(d.supplies)}` : `🔒 Locked: ${c.lockReason}`}
        </span></span>
    </label>
  );
}

export function Outcome({ before, after, titleBefore, titleAfter, text, left, next, receipt, onNext, onChronicle, dup }: {
  before: Stats; after: Stats; titleBefore: string; titleAfter: string; text: string; left: number; next: string; receipt: string; onNext(): void; onChronicle(): void; dup?: boolean;
}) {
  return (
    <main className={s.page}>
      <p className={s.ok} role="status">✓ Saved. {dup ? 'This decision was already recorded; nothing was spent twice.' : 'Recorded in the chronicle.'}</p>
      <h1 className={s.display}>{text}</h1>
      <Ledger st={before} after={after} />
      {titleBefore !== titleAfter && <p className={s.title}>Title changed: {titleBefore} → {titleAfter}</p>}
      <p className={s.fine}>Receipt {receipt}. This is an app save, not a blockchain transaction.</p>
      <div className={s.row}>
        {left > 0 ? <button className={s.btn} onClick={onNext}>Next encounter ({left} left)</button> : <p>All decisions used. Next reset {next}.</p>}
        <button className={s.btn2} onClick={onChronicle}>Open chronicle</button>
      </div>
    </main>
  );
}

/* ---------- chronicle ---------- */
const KIND = { game: '✎ Story', chain: '⛓ Chain', ownership: '⇄ Ownership', intention: '⚑ Intention' } as const;
export function Chronicle({ p, h }: { p: Profile; h: Pick<Handlers, 'onPage' | 'onFilter'> }) {
  return (
    <section className={s.card} aria-labelledby="chr">
      <h2 id="chr">Chronicle</h2>
      <p className={s.fine}>{p.coverage === 'complete' ? 'Chain history is complete.' : p.coverage === 'partial' ? `Chain history is partial (indexed to block ${p.lastIndexedBlock}). Missing logs never erase saved gameplay.` : 'No chain history imported yet.'}</p>
      <label>Show <select onChange={e => h.onFilter(e.target.value as Entry['kind'] | 'all')}><option value="all">Everything</option>
        <option value="game">Story chapters</option><option value="chain">Chain events</option><option value="ownership">Ownership</option></select></label>
      <ol className={s.log}>
        {p.chronicle.map(e => (
          <li key={e.id} data-kind={e.kind}>
            <span className={s.kind}>{KIND[e.kind]}</span> <b>{e.who}</b> <time>{e.when}</time>
            <p>{e.text} {e.fixture && <em className={s.fx}>fixture</em>}</p>
            {e.txHash && !e.fixture && <a href={`https://monadscan.com/tx/${e.txHash}`} rel="noreferrer">View transaction (block {e.block})</a>}
          </li>))}
      </ol>
      {p.chronicle.length === 0 && <p>No entries yet.</p>}
      <div className={s.row}><button className={s.btn2} onClick={() => h.onPage('prev')}>Newer</button><button className={s.btn2} onClick={() => h.onPage('next')}>Older</button></div>
    </section>
  );
}
