import { useEffect, useMemo, useRef, useState } from "react";
import s from "./ui.module.css";
import { Icon } from "./Icon";
import type {
  Choice,
  Encounter,
  Entry,
  ErrorCode,
  Handlers,
  Profile,
  SaveState,
  Stats,
  Viewer,
} from "./types";

const ST = (n: number) => String(n).replace("-", "−");
const short = (v: string) =>
  /^0x[a-fA-F0-9]{40}$/.test(v) ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;
const art = "/art/ashen-storybook.png";
const displayName = (p: Profile) =>
  p.mode === "practice" ? "Ashen Chog" : p.name;

export function PracticeBar({
  h,
  controller,
  actionsUsed,
}: {
  h: Pick<
    Handlers,
    "onPracticeReset" | "onPracticeHandoff" | "onLeavePractice"
  >;
  controller?: string;
  actionsUsed?: number;
}) {
  return (
    <aside className={s.sim} aria-label="Practice mode">
      <div className={s.simInner}>
        <div className={s.simCopy}>
          <span className={s.simBadge}>
            <Icon name="leaf" size={15} /> Practice: simulation
          </span>
          <span>A fictional Chog. Progress stays in this browser.</span>
        </div>
        <div className={s.simActions}>
          <span className={s.simController}>
            {controller?.replace(" — simulated", "")}
            {actionsUsed !== undefined ? ` · ${actionsUsed}/3 used` : ""}
          </span>
          <button className={s.smallBtn} onClick={h.onPracticeHandoff}>
            <Icon name="swap" size={15} /> Simulate controller change
          </button>
          <details className={s.practiceTools}>
            <summary aria-label="Practice options">•••</summary>
            <div>
              <button onClick={h.onPracticeReset}>Reset practice</button>
              <button onClick={h.onLeavePractice}>Leave practice</button>
            </div>
          </details>
        </div>
      </div>
    </aside>
  );
}

const MSG: Record<ErrorCode, [string, string]> = {
  INVALID_INPUT: [
    "That input is not valid.",
    "Check the token ID: whole numbers only.",
  ],
  SIGN_IN_REQUIRED: [
    "Sign in again.",
    "Your session ended. No action was used.",
  ],
  NOT_CURRENT_OWNER: [
    "This wallet no longer owns this Chog.",
    "You can still read its chronicle. Refresh ownership to confirm.",
  ],
  TOKEN_NOT_FOUND: [
    "No such token exists.",
    "Try another ID or play the practice scenario.",
  ],
  STATE_CHANGED: [
    "The Chog changed while you were deciding.",
    "Review the refreshed state and choose again.",
  ],
  CHOICE_UNAVAILABLE: [
    "That choice is no longer available.",
    "Its requirement is no longer met. Pick another.",
  ],
  DAILY_LIMIT: [
    "All three daily decisions are used.",
    "The allowance belongs to the Chog and resets at the time shown.",
  ],
  RATE_LIMITED: [
    "Too many requests.",
    "Wait a moment, then retry. Nothing was spent.",
  ],
  CHAIN_UNAVAILABLE: [
    "Ownership can’t be verified right now.",
    "Decisions are paused until ownership can be verified.",
  ],
  STORAGE_UNAVAILABLE: [
    "We couldn’t confirm this save.",
    "Retry to check the result. The same request cannot spend an action twice.",
  ],
  ORIGIN_DENIED: [
    "This request was blocked for security.",
    "Open the app from its own address — the server only accepts writes from its configured app origin.",
  ],
};
export function ErrorNotice({
  code,
  detail,
  onRetry,
}: {
  code: ErrorCode;
  detail?: string;
  onRetry?: () => void;
}) {
  const [title, description] = MSG[code];
  return (
    <div className={s.err} role="alert">
      <Icon name="flag" />
      <div>
        <b>{title}</b>
        <p>{description}</p>
        {detail && <p>{detail}</p>}
        <small>{code}</small>
      </div>
      {onRetry && (
        <button className={s.btn2} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Meter({
  label,
  v,
  min,
  max,
  after,
}: {
  label: string;
  v: number;
  min: number;
  max: number;
  after?: number;
}) {
  const pc = (n: number) =>
    Math.max(0, Math.min(100, ((n - min) / (max - min)) * 100));
  const changed = after !== undefined && after !== v;
  return (
    <div className={s.meter} data-stat={label.toLowerCase()}>
      <div className={s.mh}>
        <span>
          <Icon name={label === "Trust" ? "leaf" : "spark"} size={17} />
          {label}
        </span>
        <b>
          {ST(v)}
          {changed && (
            <>
              {" "}
              <span className={s.after}>→ {ST(after!)}</span>
            </>
          )}
        </b>
      </div>
      <div
        className={s.track}
        role="img"
        aria-label={`${label} ${v}${changed ? `, becomes ${after}` : ""}, range ${min} to ${max}`}
      >
        <span className={s.fill} style={{ width: `${pc(v)}%` }} />
        {min < 0 && <i className={s.zero} />}
        <i className={s.mark} style={{ left: `${pc(v)}%` }} />
        {changed && (
          <i className={s.ghost} style={{ left: `${pc(after!)}%` }} />
        )}
      </div>
    </div>
  );
}
export function Ledger({ st, after }: { st: Stats; after?: Stats }) {
  return (
    <div className={s.ledger}>
      <Meter
        label="Trust"
        v={st.trust}
        min={-100}
        max={100}
        after={after?.trust}
      />
      <Meter
        label="Notoriety"
        v={st.notoriety}
        min={0}
        max={100}
        after={after?.notoriety}
      />
      <div className={s.meter}>
        <div className={s.mh}>
          <span>
            <Icon name="bag" size={17} />
            Supplies
          </span>
          <b>
            {st.supplies}
            {after && after.supplies !== st.supplies && (
              <span className={s.after}> → {after.supplies}</span>
            )}
            <small> / 10</small>
          </b>
        </div>
        <div className={s.pips} aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} className={i < st.supplies ? s.on : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}
export function Portrait({
  url,
  fallbackUrls,
  name,
  practice = false,
}: {
  url?: string;
  fallbackUrls?: string[];
  name: string;
  practice?: boolean;
}) {
  const [bad, setBad] = useState(false);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setBad(false);
    setIdx(0);
  }, [url, practice, fallbackUrls]);
  const candidates = practice
    ? [art as string]
    : [url, ...(fallbackUrls ?? [])].filter((u): u is string => !!u);
  const src = candidates[idx];
  return src && !bad ? (
    <img
      className={s.portrait}
      src={src}
      alt={
        practice
          ? "Ashen, an illustrated fictional practice character with a lantern and map"
          : name
      }
      onError={() => {
        if (idx + 1 < candidates.length) setIdx(idx + 1);
        else setBad(true);
      }}
    />
  ) : (
    <div
      className={`${s.portrait} ${s.portraitFallback}`}
      role="img"
      aria-label="No image available for this Chog"
    >
      <Icon name="book" size={56} />
      <span>Portrait unavailable</span>
      <small>Its story is still here.</small>
    </div>
  );
}

const VIEW: Record<Viewer, string> = {
  visitor: "Explore freely. Connect when you want to play your Chog.",
  connected: "Wallet connected. Sign in to continue.",
  awaiting: "Waiting for your signature…",
  cancelled: "Signature cancelled. You’re viewing read-only.",
  signed: "Signed in. Open a Chog to check ownership.",
  owner: "Signed in, owns this Chog",
  "non-owner": "Signed in, does not own this Chog",
  expired: "Your session expired. Sign in again.",
  unsupported: "Switch your wallet to the app’s network, then retry sign-in.",
  switched: "Your wallet account changed. Sign in again.",
};
export function SessionBar({
  v,
  h,
  address,
  note,
}: {
  v: Viewer;
  h: Handlers;
  address?: string;
  note?: string | null;
}) {
  const wallet =
    Boolean(address) ||
    [
      "connected",
      "awaiting",
      "cancelled",
      "owner",
      "non-owner",
      "signed",
      "switched",
    ].includes(v);
  const signed = ["signed", "owner", "non-owner"].includes(v);
  return (
    <section className={s.session} aria-label="Wallet and session">
      <div className={s.sessionTop}>
        <span className={s.sessionIcon}>
          <Icon name="wallet" />
        </span>
        <div className={s.sessionText}>
          <b>{address ? short(address) : "Your wallet"}</b>
          <p role="status">{VIEW[v]}</p>
        </div>
        <div className={s.row}>
          {v === "visitor" && (
            <button className={s.btn2} onClick={h.onConnect}>
              Connect wallet
            </button>
          )}
          {[
            "connected",
            "cancelled",
            "expired",
            "switched",
            "unsupported",
          ].includes(v) && (
            <button className={s.btn} onClick={h.onSignIn}>
              {v === "unsupported" ? "Retry sign-in" : "Sign in"}
            </button>
          )}
          {v === "awaiting" && (
            <button className={s.btn2} onClick={h.onCancelSignIn}>
              Cancel
            </button>
          )}
          {v !== "visitor" && v !== "awaiting" && (
            <button className={s.link} onClick={h.onDisconnect}>
              {signed ? "Log out" : "Disconnect"}
            </button>
          )}
        </div>
      </div>
      <ul className={s.chips}>
        <li data-on={wallet}>
          {wallet ? "Wallet connected" : "Wallet not connected"}
        </li>
        <li data-on={signed}>{signed ? "Signed in" : "Not signed in"}</li>
        <li data-on={v === "owner"}>
          {v === "owner"
            ? "Owns this Chog"
            : v === "non-owner"
              ? "Does not own this Chog"
              : "Ownership not confirmed"}
        </li>
      </ul>
      {note && (
        <p className={s.warn} role="status">
          {note}
        </p>
      )}
      {["connected", "awaiting"].includes(v) && (
        <p className={s.fine}>
          Sign a free message to prove this wallet is yours. No transaction,
          approval or funds moved.
        </p>
      )}
    </section>
  );
}

export function Entry({
  h,
  error,
  notice,
}: {
  h: Handlers;
  error?: ErrorCode;
  notice?: string;
}) {
  const [id, setId] = useState("");
  const ok = /^\d+$/.test(id);
  return (
    <main className={`${s.page} ${s.entryPage}`} id="main-content">
      <section className={s.hero}>
        <div className={s.heroCopy}>
          <p className={s.eyebrow}>
            <span className={s.tinyStar}>✦</span> Little creature. Lasting
            consequences.
          </p>
          <h1 className={s.heroTitle}>
            A little Chog.
            <br />A <em>long story.</em>
          </h1>
          <p className={s.heroText}>
            A reputation to inherit. A choice to make.
            <br className={s.desktopBreak} /> Give your Chog a story that stays
            with it.
          </p>
          <div className={s.heroActions}>
            <button className={s.btn} onClick={h.onStartPractice}>
              Start practice <Icon name="arrow" />
            </button>
            <a className={s.textLink} href="#find-chog">
              Find your Chog <Icon name="arrow" size={17} />
            </a>
          </div>
          <p className={s.heroNote}>
            <Icon name="check" size={15} /> No wallet needed for practice{" "}
            <span>·</span> Free to try
          </p>
          <div className={s.heroPromise}>
            <Icon name="book" size={28} />
            <p>
              The Chog keeps its past.
              <br />
              <b>You choose its next chapter.</b>
            </p>
          </div>
        </div>
        <div className={s.heroVisual}>
          <span className={s.orbitStamp}>
            EVERY CHOG
            <br />
            HAS A PAST <Icon name="spark" size={19} />
          </span>
          <div className={s.heroArt}>
            <img
              src={art}
              alt="Ashen, our fictional practice Chog, exploring a woodland with a lantern and map"
              fetchPriority="high"
            />
            <div className={s.artLabel}>
              <span>Meet Ashen</span>
              <small>Our fictional practice Chog</small>
            </div>
          </div>
          <div className={s.floatingNote}>
            <span className={s.iconTile}>
              <Icon name="book" />
            </span>
            <p>
              A new owner.
              <br />
              <b>The same unfolding story.</b>
            </p>
            <Icon name="spark" size={17} />
          </div>
        </div>
      </section>
      <section
        className={s.howSection}
        id="how-it-works"
        aria-labelledby="how-title"
      >
        <div className={s.sectionHeading}>
          <div>
            <p className={s.eyebrow}>A small daily adventure</p>
            <h2 id="how-title">Your choices leave a mark.</h2>
          </div>
          <span className={s.fine}>
            Three decisions. A little more history.
          </span>
        </div>
        <div className={s.steps}>
          {[
            {
              n: "01",
              icon: "book" as const,
              title: "Meet the past",
              text: "Discover the reputation and chapters your Chog already carries.",
            },
            {
              n: "02",
              icon: "leaf" as const,
              title: "Make your choice",
              text: "Earn trust, build notoriety, or spend supplies. See the effect before you commit.",
            },
            {
              n: "03",
              icon: "swap" as const,
              title: "Pass on the story",
              text: "When ownership changes, the Chog keeps its stats, history and daily allowance.",
            },
          ].map((x) => (
            <article key={x.n} className={s.step}>
              <div className={s.stepTop}>
                <Icon name={x.icon} size={24} />
                <span>{x.n}</span>
              </div>
              <h3>{x.title}</h3>
              <p>{x.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className={s.lookupPanel} id="find-chog">
        <div>
          <p className={s.eyebrow}>Already have a character in mind?</p>
          <h2>Open their story.</h2>
          <p className={s.fine}>
            Look up any real Chog. Public profiles need no wallet.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) h.onLookup(id);
          }}
        >
          <label htmlFor="tok">Chog token ID</label>
          <div className={s.lookupInput}>
            <span aria-hidden="true">#</span>
            <input
              id="tok"
              inputMode="numeric"
              value={id}
              placeholder="1425"
              aria-invalid={!!id && !ok}
              aria-describedby="tokh"
              onChange={(e) => setId(e.target.value.trim())}
            />
            <button className={s.btn} disabled={!ok} type="submit">
              Open profile <Icon name="arrow" size={17} />
            </button>
          </div>
          <p id="tokh" className={s.fine}>
            {id && !ok
              ? "Use whole numbers only, like 1425."
              : "Real NFT ownership · Story progress saved in the app"}
          </p>
        </form>
        {error && <ErrorNotice code={error} />}{" "}
        {notice && (
          <p className={s.warn} role="status">
            {notice}
          </p>
        )}
      </section>
    </main>
  );
}

export function QuotaPanel({ used, next }: { used: number; next: string }) {
  const left = 3 - used;
  return (
    <div className={s.quota}>
      <div className={s.quotaTop}>
        <span className={s.eyebrow}>Today’s chapter</span>
        <span className={s.actionPips} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <i key={i} data-filled={i < left} />
          ))}
        </span>
      </div>
      <b>
        {left === 0
          ? "No decisions left today"
          : `${left} of 3 decisions left today`}
      </b>
      <small>
        <Icon name="clock" size={13} /> Resets {next}
      </small>
      <small>The allowance stays with the Chog across owners.</small>
    </div>
  );
}
export function CopyProfileLink() {
  const [status, setStatus] = useState("");
  return (
    <>
      <button
        className={s.link}
        onClick={() => {
          if (!navigator.clipboard) {
            setStatus("Copy the address from your browser.");
            return;
          }
          void navigator.clipboard.writeText(location.href).then(
            () => setStatus("Link copied."),
            () => setStatus("Copy the address from your browser."),
          );
        }}
      >
        <Icon name="copy" size={15} /> Copy profile link
      </button>
      <span className={s.fine} role="status">
        {status}
      </span>
    </>
  );
}
export function ProfileView({
  p,
  v,
  h,
  onPlay,
  onSetIntention,
  busy,
}: {
  p: Profile;
  v: Viewer;
  h: Handlers;
  onPlay(): void;
  onSetIntention?(): void;
  busy?: boolean;
}) {
  const o = p.owner,
    stale = o.status !== "fresh";
  const canPlay = v === "owner" && !stale && p.actionsUsed < 3 && !busy;
  return (
    <main className={`${s.page} ${s.profilePage}`} id="main-content">
      <div className={s.pageHeading}>
        <div>
          <p className={s.eyebrow}>
            {p.mode === "practice"
              ? "The practice journal"
              : "The character journal"}
          </p>
          <h1 className={s.display}>Every chapter counts.</h1>
        </div>
        <span className={s.pageHeadingNote}>
          A reputation is a story in progress.
        </span>
      </div>
      <div className={s.profileGrid}>
        <aside className={s.characterCard}>
          <div className={s.characterArt}>
            <Portrait
              url={p.imageUrl}
              name={p.name}
              practice={p.mode === "practice"}
            />
            <span className={s.characterBadge}>
              {p.mode === "practice"
                ? "Fictional character"
                : `Token #${p.tokenId}`}
            </span>
          </div>
          <div className={s.characterBody}>
            <p className={s.eyebrow}>
              {p.mode === "practice" ? "Practice character" : "Monad mainnet"}
            </p>
            <h2>{displayName(p)}</h2>
            <p className={s.title}>
              <Icon name="spark" size={16} />
              {p.started ? p.title : "The story is unwritten"}
            </p>
            {p.mode === "practice" && (
              <p className={s.characterDescription}>
                A familiar face. A complicated reputation. What will the next
                chapter say?
              </p>
            )}
            {p.mode === "real" && (
              <details className={s.details}>
                <summary>Character traits</summary>
                <p className={s.fine}>
                  {p.traits?.length
                    ? p.traits.join(" · ")
                    : "Traits unavailable right now."}
                </p>
              </details>
            )}
            <div className={s.ownerMini}>
              <span className={s.eyebrow}>
                {p.mode === "practice"
                  ? "Simulated controller"
                  : "On-chain owner"}
              </span>
              <b title={o.label}>
                {short(o.label).replace(" — simulated", "")}
              </b>
              <p className={stale ? s.warn : s.fine} role="status">
                {o.status === "fresh"
                  ? `Verified ${o.observedAt}`
                  : o.status === "stale"
                    ? `Stale · last verified ${o.observedAt}`
                    : "Ownership unavailable"}
              </p>
              {p.mode === "real" && (
                <button className={s.link} onClick={h.onRefreshOwner}>
                  <Icon name="refresh" size={14} /> Refresh ownership
                </button>
              )}
            </div>
          </div>
        </aside>
        <div className={s.profileMain}>
          <section className={s.card} aria-labelledby="gp">
            <div className={s.sectionHeading}>
              <div>
                <p className={s.eyebrow}>The story so far</p>
                <h2 id="gp">
                  {p.started
                    ? "A reputation that stays."
                    : "A blank page awaits."}
                </h2>
              </div>
              <Icon name="book" size={26} />
            </div>
            <p className={s.fine}>
              Saved gameplay ·{" "}
              {p.mode === "practice" ? "local simulation" : "in-app fiction"}
            </p>
            {p.started ? (
              <>
                <Ledger st={p.stats} />
                <QuotaPanel used={p.actionsUsed} next={p.nextResetLocal} />
              </>
            ) : (
              <p>
                Your Chog begins with neutral stats. Its chain history stays
                separate from its story.
              </p>
            )}
            <div className={s.profileActions}>
              {canPlay && (
                <button className={s.btn} onClick={onPlay}>
                  {p.started ? "Continue the story" : "Start the story"}{" "}
                  <Icon name="arrow" />
                </button>
              )}
              {v === "owner" && stale && (
                <p className={s.warn} role="alert">
                  Refresh ownership before playing. Decisions are paused.
                </p>
              )}
              {v === "owner" && !stale && p.actionsUsed >= 3 && (
                <p className={s.fine}>
                  That’s today’s chapter. Come back after the reset.
                </p>
              )}
              {v === "non-owner" && (
                <p className={s.fine}>
                  This wallet doesn’t own this Chog. You’re viewing read-only.
                </p>
              )}
              {p.started &&
                v === "owner" &&
                p.intention === null &&
                onSetIntention && (
                  <button className={s.link} onClick={onSetIntention}>
                    Choose chapter intention (optional)
                  </button>
                )}
              {p.intention && (
                <p className={s.fine}>
                  Intention:{" "}
                  {p.intention === "embrace"
                    ? "lean into the legend"
                    : "begin a redemption chapter"}
                  . Framing only.
                </p>
              )}
            </div>
          </section>
          <Chronicle p={p} h={h} />
          <div className={s.row}>
            <CopyProfileLink />
          </div>
        </div>
      </div>
    </main>
  );
}

export function Activation({
  onActivate,
  onCancel,
}: {
  onActivate(): void;
  onCancel(): void;
}) {
  return (
    <section className={`${s.page} ${s.centerPage}`}>
      <div className={s.chapterSeal}>
        <Icon name="book" size={32} />
      </div>
      <p className={s.eyebrow}>Chapter one</p>
      <h1 className={s.display}>Every legacy starts somewhere.</h1>
      <p className={s.lede}>
        Begin this Chog’s story with trust 0, notoriety 0 and 3 supplies.
        Earlier chain transfers stay as provenance, separate from gameplay.
      </p>
      <div className={s.card}>
        <Ledger st={{ trust: 0, notoriety: 0, supplies: 3 }} />
      </div>
      <p className={s.fine}>
        Activation creates its app history. No blockchain transaction.
      </p>
      <div className={s.row}>
        <button className={s.btn} onClick={onActivate}>
          Activate <Icon name="arrow" />
        </button>
        <button className={s.btn2} onClick={onCancel}>
          Stay read-only
        </button>
      </div>
    </section>
  );
}

export function Inheritance({
  p,
  onSetIntention,
  onContinue,
  error,
  errorDetail,
}: {
  p: Profile;
  onSetIntention?(i: "embrace" | "redeem"): Promise<void>;
  onContinue(): void;
  error?: ErrorCode;
  errorDetail?: string;
}) {
  const [pick, setPick] = useState<"embrace" | "redeem" | "skip">(
    p.intention ?? "skip",
  );
  const [phase, setPhase] = useState<"idle" | "saving" | "error">("idle");
  const inh = p.inheritedFrom,
    alreadySet = p.intention !== null;
  const cont = async () => {
    if (phase === "saving") return;
    if (pick !== "skip" && !alreadySet) {
      if (!onSetIntention) {
        onContinue();
        return;
      }
      setPhase("saving");
      try {
        await onSetIntention(pick);
      } catch {
        setPhase("error");
        return;
      }
      setPhase("idle");
    }
    onContinue();
  };
  return (
    <section className={`${s.page} ${s.inheritancePage}`}>
      <div className={s.chapterIntro}>
        <div className={s.chapterSeal}>
          <Icon name="swap" size={30} />
        </div>
        <p className={s.eyebrow}>
          {inh
            ? "A new keeper. The same legacy."
            : "The next chapter is yours."}
        </p>
        <h1 className={s.display}>
          {inh
            ? p.title === "The Feared"
              ? "A feared name. A fresh chapter."
              : "You inherited a Chog with a past."
            : "What kind of chapter will you write?"}
        </h1>
        <p className={s.lede}>
          {inh
            ? "The story didn’t start with you. Where it goes next is your choice."
            : "Choose a direction for the story. Change its reputation through your decisions."}
        </p>
      </div>
      <div className={s.inheritanceGrid}>
        <section className={s.card}>
          <p className={s.eyebrow}>What carries forward</p>
          <h2>{p.title}</h2>
          <Ledger st={p.stats} />
          <ul className={s.keeps}>
            <li>
              <Icon name="check" size={16} /> Stats, supplies and title
            </li>
            <li>
              <Icon name="check" size={16} /> Earlier chapters (
              {inh?.priorChapters ?? 0} before yours)
            </li>
            <li>
              <Icon name="check" size={16} /> Today’s actions (
              {3 - p.actionsUsed} left)
            </li>
          </ul>
          <p className={s.fine}>
            Choosing an intention doesn’t reset anything.
          </p>
        </section>
        <section className={`${s.card} ${s.journal}`}>
          <p className={s.eyebrow}>Footprints in the journal</p>
          <h2>Last three choices</h2>
          <ol className={s.log}>
            {(
              inh?.lastThree ??
              p.chronicle.filter((e) => e.kind === "game").slice(0, 3)
            ).map((e) => (
              <li key={e.id}>
                <b>{short(e.who)}</b>
                <p>{e.text}</p>
                {e.fixture && <span className={s.fx}>Simulated</span>}
              </li>
            ))}
          </ol>
        </section>
      </div>
      {alreadySet ? (
        <section className={s.card}>
          <h2>Chapter intention already set</h2>
          <p>
            {p.intention === "embrace"
              ? "Lean into the legend"
              : "Begin a redemption chapter"}
            . This frames the story only; stats change through decisions.
          </p>
        </section>
      ) : (
        <fieldset className={s.intentionField} disabled={phase === "saving"}>
          <legend>
            Your intention <span>(optional)</span>
          </legend>
          <p className={s.fine}>
            Story framing only. Choose once per ownership; “Decide later” keeps
            it open.
          </p>
          <div className={s.intentionGrid}>
            {(
              [
                [
                  "embrace",
                  "spark",
                  "Lean into the legend",
                  "There’s power in a name they remember.",
                ],
                [
                  "redeem",
                  "leaf",
                  "Begin a redemption chapter",
                  "Let your next choices tell a different story.",
                ],
                [
                  "skip",
                  "book",
                  "Decide later",
                  "Keep the page open. Let your actions speak.",
                ],
              ] as const
            ).map(([k, icon, title, desc]) => (
              <label
                key={k}
                className={`${s.intentionOption} ${pick === k ? s.sel : ""}`}
              >
                <div>
                  <Icon name={icon} size={23} />
                  <input
                    type="radio"
                    name="int"
                    checked={pick === k}
                    onChange={() => setPick(k)}
                  />
                </div>
                <b>{title}</b>
                <span>{desc}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {phase === "error" && (
        <ErrorNotice
          code={error ?? "STORAGE_UNAVAILABLE"}
          detail={errorDetail}
          onRetry={() => {
            setPhase("idle");
            void cont();
          }}
        />
      )}
      <div className={s.centerActions}>
        <button
          className={s.btn}
          disabled={phase === "saving"}
          onClick={() => void cont()}
        >
          {phase === "saving"
            ? "Saving intention…"
            : "Continue to today’s encounter"}
          <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
}

export function EncounterView({
  e,
  st,
  used,
  next,
  save,
  error,
  errorDetail,
  onSubmit,
  onRetry,
  profile,
  onBack,
}: {
  e: Encounter;
  st: Stats;
  used: number;
  next: string;
  save: SaveState;
  error?: ErrorCode;
  errorDetail?: string;
  onSubmit(choiceId: string): void | Promise<void>;
  onRetry?(): void;
  profile?: Profile;
  onBack?(): void;
}) {
  const [sel, setSel] = useState<string>();
  const pending = save === "pending";
  const submitLock = useRef(false);
  useEffect(() => {
    setSel(undefined);
    submitLock.current = false;
  }, [e.instanceId]);
  useEffect(() => {
    if (sel && !e.choices.some((c) => c.id === sel && c.eligible))
      setSel(undefined);
  }, [e.choices, sel]);
  const ch = e.choices.find((c) => c.id === sel && c.eligible);
  const submit = async () => {
    if (!ch || pending || submitLock.current) return;
    submitLock.current = true;
    try {
      await onSubmit(ch.id);
    } finally {
      submitLock.current = false;
    }
  };
  return (
    <section className={`${s.page} ${s.encounterPage}`}>
      <div className={s.encounterTop}>
        {onBack ? (
          <button className={s.link} onClick={onBack} disabled={pending}>
            <Icon name="back" size={16} /> Back to journal
          </button>
        ) : (
          <span className={s.eyebrow}>Today’s encounter</span>
        )}
        <span className={s.decisionBadge}>Decision {used + 1} of 3 today</span>
      </div>
      <div className={s.encounterGrid}>
        <aside className={s.encounterAside}>
          <div className={s.miniCharacter}>
            {profile ? (
              <>
                <Portrait
                  url={profile.imageUrl}
                  name={profile.name}
                  practice={profile.mode === "practice"}
                />
                <div>
                  <span className={s.eyebrow}>
                    {profile.mode === "practice"
                      ? "Fictional practice Chog"
                      : "Your Chog"}
                  </span>
                  <h2>{displayName(profile)}</h2>
                  <p className={s.title}>{profile.title}</p>
                </div>
              </>
            ) : (
              <>
                <Icon name="book" size={30} />
                <h2>Your reputation</h2>
              </>
            )}
          </div>
          <div className={s.asideLedger}>
            <p className={s.eyebrow}>The weight of your choices</p>
            <Ledger st={st} after={ch?.preview} />
            <p className={s.fine}>
              {ch
                ? "Dashed marks show the exact result of this choice."
                : "Select a choice to preview its exact effect."}
            </p>
            <QuotaPanel used={used} next={next} />
          </div>
        </aside>
        <article className={s.encounterPaper}>
          <div className={s.storyHeader}>
            <span className={s.eyebrow}>
              <Icon name="book" size={16} /> A moment in your story
            </span>
            <span className={s.chapterNumber}>
              {String(used + 1).padStart(2, "0")}
            </span>
          </div>
          <h1 className={s.encounterTitle}>{e.title}</h1>
          <p className={s.storyText}>{e.text}</p>
          <div className={s.storyDivider}>
            <span />
            <Icon name="leaf" size={18} />
            <span />
          </div>
          <fieldset className={s.choices} disabled={pending}>
            <legend>How will you respond?</legend>
            {e.choices.map((c, i) => (
              <ChoiceRow
                key={c.id}
                c={c}
                before={st}
                index={i}
                sel={sel === c.id}
                onPick={() => setSel(c.id)}
              />
            ))}
          </fieldset>
          {error && (
            <ErrorNotice code={error} detail={errorDetail} onRetry={onRetry} />
          )}
          <div className={s.commitArea} aria-live="polite">
            <div>
              <b>
                {pending
                  ? "Writing this chapter…"
                  : ch
                    ? "Ready to leave your mark?"
                    : "Every choice leaves a trace."}
              </b>
              <p className={s.fine}>
                {pending
                  ? "Waiting for save confirmation."
                  : profile?.mode === "practice"
                    ? "Practice saves in this browser."
                    : "Your choice saves after server confirmation."}
              </p>
            </div>
            <button
              className={s.btn}
              disabled={!ch || pending}
              onClick={() => void submit()}
              aria-label={
                pending
                  ? "Saving…"
                  : ch
                    ? `Confirm: ${ch.label}`
                    : "Select a choice"
              }
            >
              {pending ? "Saving…" : "Confirm choice"}
              <Icon name={pending ? "clock" : "arrow"} size={18} />
            </button>
          </div>
          <p className={s.fine}>Leaving this unresolved costs nothing.</p>
        </article>
      </div>
    </section>
  );
}
function ChoiceRow({
  c,
  before,
  index,
  sel,
  onPick,
}: {
  c: Choice;
  before: Stats;
  index: number;
  sel: boolean;
  onPick(): void;
}) {
  return (
    <label
      className={`${s.choice} ${sel ? s.sel : ""} ${c.eligible ? "" : s.locked}`}
    >
      <input
        type="radio"
        name="choice"
        disabled={!c.eligible}
        checked={sel}
        onChange={onPick}
        aria-describedby={`d-${c.id}`}
      />
      <span className={s.choiceLetter} aria-hidden="true">
        {c.eligible ? (
          String.fromCharCode(65 + index)
        ) : (
          <Icon name="lock" size={16} />
        )}
      </span>
      <span className={s.choiceCopy}>
        <b>{c.label}</b>
        <span className={s.blurb}>{c.blurb}</span>
        <span id={`d-${c.id}`} className={s.fx2}>
          {c.eligible ? (
            <>
              <span>
                Trust {ST(before.trust)} → {ST(c.preview.trust)}
              </span>
              <span>
                Notoriety {before.notoriety} → {c.preview.notoriety}
              </span>
              <span>
                Supplies {before.supplies} → {c.preview.supplies}
              </span>
            </>
          ) : (
            `Locked: ${c.lockReason}`
          )}
        </span>
      </span>
      <span className={s.choiceCheck} aria-hidden="true">
        {sel && <Icon name="check" size={14} />}
      </span>
    </label>
  );
}

export function Outcome({
  before,
  after,
  titleBefore,
  titleAfter,
  text,
  left,
  next,
  receipt,
  onNext,
  onChronicle,
  dup,
  mode = "real",
}: {
  before: Stats;
  after: Stats;
  titleBefore: string;
  titleAfter: string;
  text: string;
  left: number;
  next: string;
  receipt: string;
  onNext(): void;
  onChronicle(): void;
  dup?: boolean;
  mode?: "real" | "practice";
}) {
  return (
    <section className={`${s.page} ${s.outcomePage}`}>
      <div className={s.chapterSeal}>
        <Icon name="check" size={34} />
      </div>
      <p className={s.ok} role="status">
        Saved.{" "}
        {dup
          ? "Already recorded; nothing spent twice."
          : "A new line in the chronicle."}
      </p>
      <p className={s.eyebrow}>And so the story goes…</p>
      <h1 className={s.display}>{text}</h1>
      <div className={s.outcomeLedger}>
        <div className={s.sectionHeading}>
          <h2>The mark you left</h2>
          <Icon name="book" />
        </div>
        <Ledger st={before} after={after} />
        {titleBefore !== titleAfter && (
          <p className={s.title}>
            Title changed: {titleBefore} → {titleAfter}
          </p>
        )}
      </div>
      <div className={s.centerActions}>
        {left > 0 ? (
          <button className={s.btn} onClick={onNext}>
            Next encounter ({left} left)
            <Icon name="arrow" />
          </button>
        ) : (
          <p>All decisions used. Next reset {next}.</p>
        )}
        <button className={s.btn2} onClick={onChronicle}>
          <Icon name="book" size={18} />
          Open chronicle
        </button>
      </div>
      <details className={s.receipt}>
        <summary>View save receipt</summary>
        <p>{receipt}</p>
        <p>
          {mode === "practice"
            ? "Saved in this browser’s practice simulation."
            : "This is an app save, not a blockchain transaction."}
        </p>
      </details>
    </section>
  );
}

const KIND = {
  game: "Story",
  chain: "Chain",
  ownership: "Ownership",
  intention: "Intention",
} as const;
const PAGE_SIZE = 5;
export function Chronicle({
  p,
  h,
}: {
  p: Profile;
  h?: Pick<Handlers, "onPage" | "onFilter">;
}) {
  const [kind, setKind] = useState<Entry["kind"] | "all">("all"),
    [page, setPage] = useState(0);
  useEffect(() => setPage(0), [kind, p.tokenId, p.mode]);
  const filtered = useMemo(
    () =>
      kind === "all" ? p.chronicle : p.chronicle.filter((e) => e.kind === kind),
    [p.chronicle, kind],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    safePage = Math.min(page, pageCount - 1),
    slice = filtered.slice(
      safePage * PAGE_SIZE,
      safePage * PAGE_SIZE + PAGE_SIZE,
    );
  const changePage = (dir: "prev" | "next") => {
    setPage((x) =>
      Math.min(pageCount - 1, Math.max(0, x + (dir === "next" ? 1 : -1))),
    );
    h?.onPage(dir);
  };
  const coverage =
    p.mode === "practice"
      ? "Simulated story entries. Nothing here is on-chain."
      : p.coverage === "complete"
        ? "Chain history is complete."
        : p.coverage === "partial"
          ? `Partial chain history · indexed to block ${p.lastIndexedBlock}. Saved gameplay is retained.`
          : "No chain history imported yet.";
  return (
    <section className={`${s.card} ${s.journal}`} aria-labelledby="chr">
      <div className={s.sectionHeading}>
        <div>
          <p className={s.eyebrow}>The pages so far</p>
          <h2 id="chr">Chronicle</h2>
        </div>
        <label className={s.filterLabel}>
          Show
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Entry["kind"] | "all");
              h?.onFilter(e.target.value as Entry["kind"] | "all");
            }}
          >
            <option value="all">Everything</option>
            <option value="game">Story chapters</option>
            <option value="chain">Chain events</option>
            <option value="ownership">Ownership</option>
            <option value="intention">Intention</option>
          </select>
        </label>
      </div>
      <p className={s.fine}>{coverage}</p>
      <ol className={s.log}>
        {slice.map((e) => (
          <li key={e.id} data-kind={e.kind}>
            <div className={s.logMeta}>
              <span className={s.kind}>{KIND[e.kind]}</span>
              <b title={e.who}>{short(e.who).replace(" — simulated", "")}</b>
              {e.fixture && <span className={s.fx}>Simulated</span>}
            </div>
            <p>{e.text}</p>
            <time>{e.when}</time>
            {e.txHash && !e.fixture && (
              <a href={`https://monadscan.com/tx/${e.txHash}`} rel="noreferrer">
                View transaction (block {e.block}){" "}
                <Icon name="external" size={12} />
              </a>
            )}
          </li>
        ))}
      </ol>
      {filtered.length === 0 && (
        <div className={s.emptyState}>
          <Icon name="book" size={28} />
          <p>No entries in this filter.</p>
          <span className={s.fine}>
            The next chapter is still waiting to be written.
          </span>
        </div>
      )}
      <div className={s.pagination}>
        <button
          className={s.btn2}
          disabled={safePage <= 0}
          onClick={() => changePage("prev")}
        >
          <Icon name="back" size={14} />
          Newer
        </button>
        <span className={s.fine} role="status">
          Page {safePage + 1} of {pageCount} · {filtered.length}{" "}
          {filtered.length === 1 ? "entry" : "entries"}
        </span>
        <button
          className={s.btn2}
          disabled={safePage >= pageCount - 1}
          onClick={() => changePage("next")}
        >
          Older
          <Icon name="arrow" size={14} />
        </button>
      </div>
    </section>
  );
}
