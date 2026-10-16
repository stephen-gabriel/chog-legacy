import { useEffect, useMemo, useState } from 'react';
import s from './ui.module.css';
import type { Choice, Encounter, Entry, ErrorCode, Handlers, Profile, SaveState, Stats, Viewer } from './types';

const sg = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
const ST = (n: number) => String(n).replace('-', '−');

/* ---------- shared ---------- */
export function PracticeBar({
  h,
  controller,
  actionsUsed,
}: {
  h: Pick<Handlers, 'onPracticeReset' | 'onPracticeHandoff' | 'onLeavePractice'>;
  controller?: string;
  actionsUsed?: number;
}) {
  return (
    <div className={s.sim} role="region" aria-label="Practice mode">
      <p>
        <b>Practice: simulation.</b> A fictional Chog with fixture history. Nothing here is on-chain or saved to
        real Chogs.
      </p>
      {(controller || actionsUsed !== undefined) && (
        <p className={s.fine} role="status">
          Simulated controller: <b>{controller ?? '—'}</b>
          {actionsUsed !== undefined ? ` · Decisions today: ${actionsUsed} of 3` : ''}
        </p>
      )}
      <div className={s.row}>
        <button className={s.btn2} onClick={h.onPracticeHandoff}>
          Simulate controller change
        </button>
        <button className={s.btn2} onClick={h.onPracticeReset}>
          Reset practice
        </button>
        <button className={s.link} onClick={h.onLeavePractice}>
          Leave practice
        </button>
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

export function ErrorNotice({ code, detail, onRetry }: { code: ErrorCode; detail?: string; onRetry?: () => void }) {
  const [t, d] = MSG[code];
  return (
    <div className={s.err} role="alert">
      <b>✕ {t}</b> <span>{d}</span> <code>{code}</code>
      {detail && <span> {detail}</span>}
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
  cancelled: 'Signature cancelled. You are read-only.', signed: 'Signed in. Open a Chog to confirm ownership.',
  owner: 'Signed in, owns this Chog', 'non-owner': 'Signed in, does not own this Chog',
  expired: 'Session expired. Sign in again.', unsupported: 'This wallet can’t sign in here.', switched: 'Wallet account changed. Sign in again.',
};

export function SessionBar({ v, h, address, note }: { v: Viewer; h: Handlers; address?: string; note?: string | null }) {
  const wallet = v !== 'visitor', signed = v === 'owner' || v === 'non-owner' || v === 'signed';
  return (
    <section className={s.session} aria-label="Wallet and session">
      <ul className={s.chips}>
        <li data-on={wallet}>{wallet ? '● ' : '○ '}Wallet {wallet ? 'connected' : 'not connected'}{address && wallet ? ` ${address}` : ''}</li>
        <li data-on={signed}>{signed ? '● ' : '○ '}{signed ? 'Signed in' : 'Not signed in'}</li>
        <li data-on={v === 'owner'}>{v === 'owner' ? '● Owns this Chog' : '○ Ownership not confirmed'}</li>
      </ul>
      <p role="status">{VIEW[v]}</p>
      {note && <p className={s.fine} role="status">{note}</p>}
      <div className={s.row}>
        {v === 'visitor' && <button className={s.btn} onClick={h.onConnect}>Connect wallet</button>}
        {(v === 'connected' || v === 'cancelled' || v === 'expired' || v === 'switched' || v === 'unsupported') && <button className={s.btn} onClick={h.onSignIn}>Sign in</button>}
        {v === 'awaiting' && <button className={s.btn2} onClick={h.onCancelSignIn}>Cancel</button>}
        {v !== 'visitor' && v !== 'awaiting' && <button className={s.btn2} onClick={h.onDisconnect}>{signed ? 'Log out' : 'Disconnect'}</button>}
      </div>
      {(v === 'connected' || v === 'awaiting') && <p className={s.fine}>Signing is a free message that proves you control this wallet. It is not a transaction or approval, and moves nothing.</p>}
    </section>
  );
}

/* ---------- entry ---------- */
export function Entry({ h, error, notice }: { h: Handlers; error?: ErrorCode; notice?: string }) {
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
          {notice && <p className={s.warn} role="status">{notice}</p>}
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

export function ProfileView({ p, v, h, onPlay, onSetIntention, busy }: {
  p: Profile;
  v: Viewer;
  h: Handlers;
  onPlay(): void;
  onSetIntention?(): void;
  busy?: boolean;
}) {
  const o = p.owner;
  const stale = o.status !== 'fresh';
  const canPlay = v === 'owner' && !stale && p.actionsUsed < 3 && !busy;
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
        <h2 id="own">{p.mode === 'practice' ? 'Simulated ownership' : 'On-chain facts'}</h2>
        <p>{p.mode === 'practice' ? 'Simulated controller: ' : 'Current owner: '}<code>{o.label}</code></p>
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
        {canPlay && <button className={s.btn} onClick={onPlay}>{p.started ? 'Continue the story' : 'Start the story'}</button>}
        {v === 'owner' && stale && <p className={s.warn} role="alert">Ownership must be verified fresh before playing. Refresh ownership, then try again.</p>}
        {v === 'owner' && !stale && p.actionsUsed >= 3 && <p className={s.fine}>Come back after the reset. Past chapters stay readable below.</p>}
        {v === 'non-owner' && <p className={s.fine}>This wallet doesn’t own this Chog. You’re viewing read-only.</p>}
        {p.started && v === 'owner' && p.intention === null && onSetIntention && (
          <button className={s.btn2} onClick={onSetIntention}>Choose chapter intention (optional)</button>
        )}
        {p.intention && <p className={s.fine}>Chapter intention: {p.intention === 'embrace' ? 'lean into the legend' : 'begin a redemption chapter'}.</p>}
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

export function Inheritance({ p, onSetIntention, onContinue, error, errorDetail }: {
  p: Profile;
  onSetIntention?(i: 'embrace' | 'redeem'): Promise<void>;
  onContinue(): void;
  error?: ErrorCode;
  errorDetail?: string;
}) {
  const [pick, setPick] = useState<'embrace' | 'redeem' | 'skip'>(p.intention ? (p.intention as 'embrace' | 'redeem') : 'skip');
  const [phase, setPhase] = useState<'idle' | 'saving' | 'error'>('idle');
  const inh = p.inheritedFrom;
  const alreadySet = p.intention !== null;

  const cont = async () => {
    if (phase === 'saving') return;
    if (pick !== 'skip' && !alreadySet) {
      if (!onSetIntention) {
        onContinue();
        return;
      }
      setPhase('saving');
      try {
        await onSetIntention(pick as 'embrace' | 'redeem');
      } catch {
        setPhase('error');
        return;
      }
      setPhase('idle');
    }
    onContinue();
  };

  return (
    <main className={s.page}>
      <h1 className={s.display}>{p.title === 'The Feared' ? 'You inherited a feared Chog' : 'You inherited a Chog with a past'}</h1>
      <p className={s.lede}>Everything below continues unchanged. You can’t edit earlier chapters; you decide what comes next.</p>
      <section className={s.card}>
        <h2>{p.title}</h2><Ledger st={p.stats} />
        <ul className={s.keeps}><li>✓ Stats and title</li><li>✓ Earlier chapters ({inh?.priorChapters ?? 0} before yours)</li><li>✓ Today’s daily actions ({3 - p.actionsUsed} left)</li></ul>
        {p.title === 'The Feared' && <p className={s.fine}>Intimidation options are open. Cooperative options that need trust stay locked until you earn it.</p>}
      </section>
      <section className={s.card}><h2>Last three choices</h2>
        <ol className={s.log}>{inh?.lastThree.map(e => <li key={e.id}><b>{e.who}</b> {e.text}{e.fixture && <em className={s.fx}> fixture</em>}</li>)}</ol></section>
      {alreadySet ? (
        <section className={s.card}>
          <h2>Chapter intention already set</h2>
          <p className={s.fine}>This ownership already chose: {p.intention === 'embrace' ? 'lean into the legend' : 'begin a redemption chapter'}. Intention frames the story only; stats change through decisions.</p>
        </section>
      ) : (
        <fieldset className={s.card} disabled={phase === 'saving'}>
          <legend>Chapter intention (optional)</legend>
          <p className={s.fine}>Sets the story’s framing only. Stats change only through your decisions. You can choose once per ownership. “Decide later” keeps this choice open.</p>
          {([['embrace', 'Lean into the legend'], ['redeem', 'Begin a redemption chapter'], ['skip', 'Decide later']] as const).map(([k, l]) => (
            <label key={k} className={s.opt}><input type="radio" name="int" checked={pick === k} onChange={() => setPick(k)} /> {l}</label>
          ))}
        </fieldset>
      )}
      {phase === 'error' && <ErrorNotice code={error ?? 'STORAGE_UNAVAILABLE'} detail={errorDetail} onRetry={() => { setPhase('idle'); void cont(); }} />}
      <div className={s.row}>
        <button className={s.btn} disabled={phase === 'saving'} onClick={() => void cont()}>
          {phase === 'saving' ? 'Saving intention…' : 'Continue to today’s encounter'}
        </button>
        {phase === 'saving' && <span className={s.fine}>Waiting for the save to confirm. Don’t close this page.</span>}
      </div>
    </main>
  );
}

/* ---------- encounter + outcome ---------- */
export function EncounterView({ e, st, used, next, save, error, errorDetail, onSubmit, onRetry }: {
  e: Encounter; st: Stats; used: number; next: string; save: SaveState; error?: ErrorCode; errorDetail?: string;
  onSubmit(choiceId: string): void | Promise<void>;
  onRetry?(): void;
}) {
  const [sel, setSel] = useState<string | undefined>(undefined);
  const pending = save === 'pending';

  useEffect(() => {
    setSel(undefined);
  }, [e.instanceId]);

  useEffect(() => {
    if (sel && !e.choices.some(c => c.id === sel && c.eligible)) {
      setSel(undefined);
    }
  }, [e.choices, sel]);

  const ch = e.choices.find(c => c.id === sel && c.eligible);
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
      {error && <ErrorNotice code={error} detail={errorDetail} onRetry={onRetry} />}
      <div className={s.row} aria-live="polite">
        <button className={s.btn} disabled={!ch || pending} onClick={() => ch && void onSubmit(ch.id)}>
          {pending ? 'Saving…' : ch ? `Confirm: ${ch.label}` : 'Select a choice'}
        </button>
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
  before: Stats; after: Stats; titleBefore: string; titleAfter: string; text: string; left: number; next: string;
  receipt: string; onNext(): void; onChronicle(): void; dup?: boolean;
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
const PAGE_SIZE = 5;

export function Chronicle({ p, h }: { p: Profile; h?: Pick<Handlers, 'onPage' | 'onFilter'> }) {
  const [kind, setKind] = useState<Entry['kind'] | 'all'>('all');
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [kind, p.tokenId, p.mode]);

  const filtered = useMemo(
    () => (kind === 'all' ? p.chronicle : p.chronicle.filter(e => e.kind === kind)),
    [p.chronicle, kind],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const changeKind = (k: Entry['kind'] | 'all') => {
    setKind(k);
    h?.onFilter(k);
  };
  const changePage = (dir: 'prev' | 'next') => {
    setPage(x => Math.min(pageCount - 1, Math.max(0, x + (dir === 'next' ? 1 : -1))));
    h?.onPage(dir);
  };

  const coverageText = p.mode === 'practice'
    ? 'Practice is not on-chain; there is no chain history. Every entry here is a labeled fixture.'
    : p.coverage === 'complete'
      ? 'Chain history is complete.'
      : p.coverage === 'partial'
        ? `Chain history is partial (indexed to block ${p.lastIndexedBlock}). Missing logs never erase saved gameplay.`
        : 'No chain history imported yet.';

  return (
    <section className={s.card} aria-labelledby="chr">
      <h2 id="chr">Chronicle</h2>
      <p className={s.fine}>{coverageText}</p>
      <label>Show
        <select value={kind} onChange={e => changeKind(e.target.value as Entry['kind'] | 'all')}>
          <option value="all">Everything</option>
          <option value="game">Story chapters</option>
          <option value="chain">Chain events</option>
          <option value="ownership">Ownership</option>
          <option value="intention">Intention</option>
        </select>
      </label>
      <ol className={s.log}>
        {slice.map(e => (
          <li key={e.id} data-kind={e.kind}>
            <span className={s.kind}>{KIND[e.kind]}</span> <b>{e.who}</b> <time>{e.when}</time>
            <p>{e.text} {e.fixture && <em className={s.fx}>fixture</em>}</p>
            {e.txHash && !e.fixture && <a href={`https://monadscan.com/tx/${e.txHash}`} rel="noreferrer">View transaction (block {e.block})</a>}
          </li>
        ))}
      </ol>
      {filtered.length === 0 && <p>No entries in this filter.</p>}
      <div className={s.row}>
        <button className={s.btn2} disabled={safePage <= 0} onClick={() => changePage('prev')}>Newer</button>
        <span className={s.fine} role="status">Page {safePage + 1} of {pageCount} · {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
        <button className={s.btn2} disabled={safePage >= pageCount - 1} onClick={() => changePage('next')}>Older</button>
      </div>
    </section>
  );
}
