import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as C from "@/ui/components";
import s from "@/ui/ui.module.css";
import type { ErrorCode, Handlers, Viewer } from "@/ui/types";
import type { ApiProfile } from "@/shared/apiTypes";
import { useAuth } from "@/auth/AuthContext";
import { sessionHandlers } from "@/auth/sessionHandlers";
import { formatResetLocal } from "@/app/format";
import { lookupRealToken, refreshRealToken } from "./realApi";
import { apiProfileToUi, ipfsHttp, ipfsHttpAll, shortAddress } from "./realMapping";
import { useRealGame } from "./useRealGame";

type State =
  | { status: "loading" }
  | { status: "error"; code: ErrorCode; detail: string }
  | {
      status: "ready";
      profile: ApiProfile;
      notice: { code: ErrorCode; detail: string } | null;
      refreshing: boolean;
    };

function short(addr: string): string {
  return shortAddress(addr);
}

function tokenViewer(
  authViewer: Viewer,
  profile: ApiProfile | null,
  wallet: string | null,
): Viewer {
  if (authViewer !== "signed") return authViewer;
  if (!profile) return "signed";
  const owner = profile.ownership.owner;
  if (!wallet || !owner) return "non-owner";
  return owner.toLowerCase() === wallet ? "owner" : "non-owner";
}

function noop(): void {}

const IDLE_HANDLERS: Handlers = {
  onConnect: noop,
  onSignIn: noop,
  onCancelSignIn: noop,
  onDisconnect: noop,
  onSwitchNetwork: noop,
  onPickWallet: noop,
  onLookup: noop,
  onStartPractice: noop,
  onRefreshOwner: noop,
  onActivate: noop,
  onIntention: noop,
  onSubmitChoice: noop,
  onPage: noop,
  onFilter: noop,
  onPracticeReset: noop,
  onPracticeHandoff: noop,
  onLeavePractice: noop,
};

export function RealProfilePage() {
  const { tokenId = "" } = useParams();
  const nav = useNavigate();
  const auth = useAuth();
  const [state, setState] = useState<State>({ status: "loading" });

  const load = () => {
    setState({ status: "loading" });
    void lookupRealToken(tokenId).then((r) => {
      if (r.ok && r.profile)
        setState({
          status: "ready",
          profile: r.profile,
          notice: null,
          refreshing: false,
        });
      else
        setState({
          status: "error",
          code: r.errorCode ?? "CHAIN_UNAVAILABLE",
          detail: r.detail ?? "Lookup failed.",
        });
    });
  };

  useEffect(() => {
    if (!/^\d+$/.test(tokenId)) return;
    load();
  }, [tokenId]);

  const profile =
    state.status === "ready"
      ? state.profile
      : state.status === "error"
        ? null
        : null;
  const viewer = tokenViewer(
    auth.viewer,
    profile,
    auth.session?.authenticated ? auth.session.wallet : null,
  );

  const refresh = () => {
    if (state.status !== "ready" || state.refreshing) return;
    setState({ ...state, refreshing: true });
    void refreshRealToken(tokenId).then((r) => {
      if (r.ok && r.profile)
        setState({
          status: "ready",
          profile: r.profile,
          notice: null,
          refreshing: false,
        });
      else
        setState({
          status: "ready",
          profile: state.profile,
          notice: {
            code: r.errorCode ?? "CHAIN_UNAVAILABLE",
            detail: r.detail ?? "Refresh failed.",
          },
          refreshing: false,
        });
    });
  };

  const h: Handlers = {
    ...IDLE_HANDLERS,
    ...sessionHandlers(auth),
    onLookup: (id) => nav(`/chog/${encodeURIComponent(id)}`),
    onStartPractice: () => nav("/practice"),
    onRefreshOwner: refresh,
    onLeavePractice: () => nav("/"),
  };

  if (!/^\d+$/.test(tokenId)) {
    return (
      <main className={s.page}>
        <SessionSection viewer={viewer} auth={auth} h={h} />
        <h1 className={s.display}>Invalid token ID</h1>
        <C.ErrorNotice code="INVALID_INPUT" />
        <p>
          <Link className={s.link} to="/">
            Back to entry
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <SessionSection viewer={viewer} auth={auth} h={h} />
      <p className={s.tag}>Real Chog · Monad mainnet · token {tokenId}</p>
      <h1 className={s.display}>The character journal.</h1>

      {state.status === "loading" && (
        <section className={s.card} role="status">
          <h2>Loading chain facts…</h2>
          <p className={s.fine}>
            Reading ownership and metadata. Real profiles never initialize
            gameplay or spend a daily action during lookup.
          </p>
        </section>
      )}

      {state.status === "error" && (
        <>
          <section className={s.card} role="alert">
            <h2>Profile unavailable</h2>
            <p>{state.detail}</p>
            <p className={s.fine}>
              <code>{state.code}</code>
            </p>
            <div className={s.row}>
              <button className={s.btn} onClick={load}>
                Retry
              </button>
              <button className={s.btn2} onClick={() => nav("/practice")}>
                Play the practice scenario
              </button>
              <Link className={s.btn2} to="/">
                Back to entry
              </Link>
            </div>
          </section>
        </>
      )}

      {state.status === "ready" && (
        <ReadyProfile
          state={state}
          tokenId={tokenId}
          viewer={viewer}
          onRefresh={refresh}
        />
      )}

      <p className={s.fine}>
        Public lookup requires no wallet and creates no game record.
      </p>
    </main>
  );
}

function SessionSection({
  viewer,
  auth,
  h,
}: {
  viewer: Viewer;
  auth: ReturnType<typeof useAuth>;
  h: Handlers;
}) {
  return (
    <C.SessionBar
      v={viewer}
      h={h}
      address={auth.address ?? auth.session?.wallet ?? undefined}
      note={auth.notice}
      wallets={auth.wallets}
      pickerOpen={auth.pickerOpen}
    />
  );
}

function ReadyProfile({
  state,
  tokenId,
  viewer,
  onRefresh,
}: {
  state: Extract<State, { status: "ready" }>;
  tokenId: string;
  viewer: Viewer;
  onRefresh: () => void;
}) {
  const p = state.profile,
    o = p.ownership,
    g = p.game;
  const ui = apiProfileToUi(p);
  return (
    <>
      {state.notice && (
        <C.ErrorNotice
          code={state.notice.code}
          detail={state.notice.detail}
          onRetry={onRefresh}
        />
      )}
      <div className={s.realProfileGrid}>
        <aside className={s.characterCard}>
          <div className={s.characterArt}>
            <C.Portrait
              url={ipfsHttp(p.metadata?.imageUri)}
              fallbackUrls={ipfsHttpAll(p.metadata?.imageUri).slice(1)}
              name={p.metadata?.name ?? `Chog #${tokenId}`}
            />
            <span className={s.characterBadge}>Token #{tokenId} · Monad</span>
          </div>
          <div className={s.characterBody}>
            <p className={s.eyebrow}>Chog Genesis</p>
            <h2>{p.metadata?.name ?? `Chog #${tokenId}`}</h2>
            {p.metadata?.error ? (
              <p className={s.warn} role="alert">
                Metadata fetch failed
                {p.metadata.name || p.metadata.imageUri
                  ? " — showing the last successful copy"
                  : ""}
                . It retries automatically when the profile opens; Refresh
                chain data retries now.
              </p>
            ) : !p.metadata ? (
              <p className={s.warn} role="alert">
                Metadata has not loaded yet. It retries automatically when the
                profile opens.
              </p>
            ) : p.metadata.stale ? (
              <p className={s.warn}>Showing cached metadata.</p>
            ) : null}
            <p className={s.title}>{g?.title ?? "The story is unwritten"}</p>
            <div className={s.ownerMini}>
              <p className={s.eyebrow}>On-chain facts</p>
              <b>
                Current owner: {o.owner ? short(o.owner) : "not observed yet"}
              </b>
              <p
                className={o.status === "fresh" ? s.fine : s.warn}
                role="status"
              >
                Ownership {o.status === "never" ? "not yet observed" : o.status}
                {o.observedAt && (
                  <> · {new Date(o.observedAt).toLocaleString()}</>
                )}
              </p>
              {o.chainError && (
                <p className={s.warn} role="alert">
                  {o.chainError}
                </p>
              )}
              <button
                className={s.btn2}
                onClick={onRefresh}
                disabled={state.refreshing}
              >
                {state.refreshing ? "Refreshing…" : "Refresh chain data"}
              </button>
            </div>
            <details className={s.details}>
              <summary>Traits & provenance</summary>
              <ul className={s.realTraits}>
                {p.metadata?.traits?.map((trait, i) => (
                  <li key={`${trait.trait_type}-${i}`}>
                    {trait.trait_type}: {trait.value}
                  </li>
                ))}
              </ul>
              {!p.metadata?.traits?.length && (
                <p className={s.fine}>Traits unavailable right now.</p>
              )}
              {o.verificationBlock !== null && (
                <p className={s.fine}>
                  Ownership observed at block{" "}
                  {o.verificationBlock.toLocaleString()}.
                </p>
              )}
              {p.metadata?.tokenUri && (
                <a
                  className={s.link}
                  href={ipfsHttp(p.metadata.tokenUri)}
                  rel="noreferrer"
                >
                  Metadata source
                </a>
              )}
              {p.metadata?.stale && (
                <p className={s.warn}>Showing cached metadata.</p>
              )}
              {p.metadata?.error && (
                <p className={s.warn}>{p.metadata.error}</p>
              )}
              <p className={s.fine}>
                Refresh checks current ownership and metadata, then reads a
                bounded page of chain history. It never starts gameplay.
              </p>
            </details>
          </div>
        </aside>
        <div className={s.realProfileMain}>
          <section className={s.card}>
            <p className={s.eyebrow}>Saved gameplay · in-app fiction</p>
            <h2>{g ? "The story so far." : "A blank page awaits."}</h2>
            {g ? (
              <>
                <p className={s.title}>{g.title}</p>
                <C.Ledger st={g.stats} />
                <C.QuotaPanel
                  used={g.actionsUsedToday}
                  next={formatResetLocal(g.nextResetUtc)}
                />
                <p className={s.fine}>
                  {g.gameEventCount} story events · {g.epochCount} ownership
                  chapter{g.epochCount === 1 ? "" : "s"}
                  {g.intention && <> · intention: {g.intention}</>}
                </p>
              </>
            ) : (
              <p className={s.lede}>
                No chapters yet. Its first verified owner can begin the story
                with neutral stats.
              </p>
            )}
            <div className={s.row}>
              <Link
                className={s.btn}
                to={`/chog/${encodeURIComponent(tokenId)}/play`}
              >
                {viewer === "owner"
                  ? g
                    ? "Continue the story"
                    : "Begin the story"
                  : "Open mainnet play"}
              </Link>
              {!g && (
                <Link className={s.btn2} to="/practice">
                  Try practice
                </Link>
              )}
            </div>
            <p className={s.fine}>
              {viewer === "non-owner"
                ? "This wallet does not own this Chog. You can read its history; gameplay is read-only."
                : "Playing requires a signed-in owner. Ownership is checked before every save."}
            </p>
          </section>
          <C.Chronicle p={ui} />
          <details className={s.details}>
            <summary>About chain history</summary>
            <p className={s.fine}>
              {p.historySync
                ? `Indexed from block ${p.historySync.startBlock.toLocaleString()} to ${p.historySync.lastIndexedBlock.toLocaleString()}. Coverage: ${p.historySync.status}. Each refresh advances a bounded page; history may be incomplete.`
                : "No transfer history imported yet. Refresh chain data to check for available provenance."}
            </p>
          </details>
          <div className={s.row}>
            <C.CopyProfileLink />
          </div>
        </div>
      </div>
    </>
  );
}

export function RealPlayPage() {
  const { tokenId = "" } = useParams();
  const nav = useNavigate();
  const auth = useAuth();
  const g = useRealGame(tokenId);
  const valid = /^\d+$/.test(tokenId);

  useEffect(() => {
    if (valid) void g.load();
  }, [valid, tokenId]);

  const sessionWallet = auth.session?.authenticated
    ? auth.session.wallet
    : null;
  const profile = g.profile;
  const viewer = tokenViewer(auth.viewer, profile, sessionWallet);

  useEffect(() => {
    if (!sessionWallet) return;
    const onFocus = () => {
      void g.refreshOwner(true);
    };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      void g.refreshOwner(true);
    }, 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [sessionWallet, g.refreshOwner]);

  const h: Handlers = useMemo(
    () => ({
      ...IDLE_HANDLERS,
      ...sessionHandlers(auth),
      onLookup: (id) => nav(`/chog/${encodeURIComponent(id)}`),
      onStartPractice: () => nav("/practice"),
      onRefreshOwner: () => void g.refreshOwner(),
      onLeavePractice: () => nav(`/chog/${encodeURIComponent(tokenId)}`),
    }),
    [auth, nav, g.refreshOwner, tokenId],
  );

  const handleActivate = async () => {
    const res = await g.activate();
    if (res === "play") await g.openPlay();
  };

  const continueAfterInheritance = () => {
    const used = g.profile?.game?.actionsUsedToday ?? 0;
    if (used < 3) void g.openPlay();
    else g.openProfile();
  };

  const owner = profile?.ownership.owner ?? null;
  const ownerMatch =
    !!sessionWallet && !!owner && sessionWallet === owner.toLowerCase();
  const game = profile?.game ?? null;
  const controller = game?.controller.toLowerCase() ?? "";

  if (!valid) {
    return (
      <main className={s.page}>
        <SessionSection viewer={viewer} auth={auth} h={h} />
        <h1 className={s.display}>Invalid token ID</h1>
        <C.ErrorNotice code="INVALID_INPUT" />
        <p>
          <Link className={s.link} to="/">
            Back to entry
          </Link>
        </p>
      </main>
    );
  }

  const bar = <SessionSection viewer={viewer} auth={auth} h={h} />;

  if (g.view === "loading") {
    return (
      <main className={s.page}>
        {bar}
        <p className={s.tag}>Real Chog #{tokenId} · mainnet play</p>
        <section className={s.card} role="status">
          <h2>Loading {g.profile ? "today’s state…" : "chain facts…"}</h2>
          <p className={s.fine}>
            Reading public profile facts. Gameplay state loads only after
            sign-in and ownership confirmation.
          </p>
        </section>
      </main>
    );
  }

  if (g.view === "error" && g.loadError) {
    return (
      <main className={s.page}>
        {bar}
        <h1 className={s.display}>Chog #{tokenId}</h1>
        <section className={s.card} role="alert">
          <h2>Profile unavailable</h2>
          <p>{g.loadError.detail}</p>
          <p className={s.fine}>
            <code>{g.loadError.code}</code>
          </p>
          <div className={s.row}>
            <button className={s.btn} onClick={() => void g.load()}>
              Retry
            </button>
            <Link
              className={s.btn2}
              to={`/chog/${encodeURIComponent(tokenId)}`}
            >
              Back to profile
            </Link>
            <button className={s.btn2} onClick={() => nav("/practice")}>
              Play practice instead
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!sessionWallet) {
    return (
      <main className={s.page}>
        {bar}
        <p className={s.tag}>Real Chog #{tokenId} · mainnet play</p>
        <h1 className={s.display}>Sign in to play this Chog</h1>
        <section className={s.card}>
          <p>
            Sign a free message to prove this wallet is yours. The current owner
            can play; everyone can read the story. Signing moves no funds and
            grants no token approvals.
          </p>
          <p className={s.fine}>
            Every decision is saved only after the server re-verifies ownership.
            Your wallet stays in control; nothing is approved or moved.
          </p>
          <div className={s.row}>
            <Link
              className={s.btn2}
              to={`/chog/${encodeURIComponent(tokenId)}`}
            >
              Back to profile
            </Link>
            <button className={s.btn2} onClick={() => nav("/practice")}>
              Play practice instead
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!ownerMatch) {
    return (
      <main className={s.page}>
        {bar}
        <p className={s.tag}>Real Chog #{tokenId} · mainnet play</p>
        <h1 className={s.display}>This wallet doesn’t own this Chog</h1>
        <section className={s.card}>
          <p>
            Current owner:{" "}
            <code>{owner ? short(owner) : "not observed yet"}</code>. Signed-in
            wallet: <code>{short(sessionWallet)}</code>.
          </p>
          <p className={s.fine}>
            Ownership is checked fresh from the chain before every save. You can
            read the full chronicle; gameplay stays read-only for non-owners. If
            you transferred it, the new owner must sign in with their own
            wallet.
          </p>
          <div className={s.row}>
            <button className={s.btn} onClick={() => void g.refreshOwner()}>
              Refresh ownership
            </button>
            <Link
              className={s.btn2}
              to={`/chog/${encodeURIComponent(tokenId)}`}
            >
              Back to profile
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const notice = g.notice ? (
    <p className={s.ok} role="status">
      {g.notice}{" "}
      <button className={s.link} onClick={g.clearNotice}>
        Dismiss
      </button>
    </p>
  ) : null;

  if (g.view === "inheritance") {
    return (
      <main className={s.page}>
        {bar}
        {notice}
        <C.Inheritance
          p={apiProfileToUi(profile!)}
          onSetIntention={(i) => g.setIntention(i)}
          onContinue={continueAfterInheritance}
          error={g.errorCode ?? undefined}
          errorDetail={g.errorDetail ?? undefined}
        />
      </main>
    );
  }

  if (g.view === "outcome" && g.outcome) {
    const o = g.outcome;
    return (
      <main className={s.page}>
        {bar}
        <C.Outcome
          before={o.before}
          after={o.after}
          titleBefore={o.titleBefore}
          titleAfter={o.titleAfter}
          text={o.text}
          left={o.left}
          next={formatResetLocal(o.nextResetUtc)}
          receipt={o.receiptId}
          dup={o.duplicate}
          onNext={() => void g.openPlay()}
          onChronicle={() => nav(`/chog/${encodeURIComponent(tokenId)}`)}
        />
      </main>
    );
  }

  if (g.view === "encounter") {
    const pv = g.play;
    if (pv?.encounter) {
      return (
        <main className={s.page}>
          {bar}
          {notice}
          <C.EncounterView
            e={pv.encounter}
            profile={apiProfileToUi(profile!)}
            onBack={g.openProfile}
            st={pv.stats}
            used={pv.actionsUsed}
            next={formatResetLocal(pv.nextResetUtc)}
            save={g.saveState}
            error={g.errorCode ?? undefined}
            errorDetail={g.errorDetail ?? undefined}
            onSubmit={(choiceId) => g.submitChoice(choiceId)}
            onRetry={() => {
              g.clearError();
              void g.openPlay();
            }}
          />
        </main>
      );
    }
    if (g.errorCode) {
      return (
        <main className={s.page}>
          {bar}
          <section className={s.card}>
            <C.ErrorNotice
              code={g.errorCode}
              detail={g.errorDetail ?? undefined}
              onRetry={() => {
                g.clearError();
                void g.openPlay();
              }}
            />
            <div className={s.row}>
              <Link
                className={s.btn2}
                to={`/chog/${encodeURIComponent(tokenId)}`}
              >
                Back to profile
              </Link>
            </div>
          </section>
        </main>
      );
    }
    return (
      <main className={s.page}>
        {bar}
        <section className={s.card} role="status">
          <h2>Loading today’s encounter…</h2>
          <p className={s.fine}>
            The server is verifying ownership and loading your saved state.
            Nothing is spent while this loads.
          </p>
        </section>
      </main>
    );
  }

  // view === 'ready'
  return (
    <main className={s.page}>
      {bar}
      <p className={s.tag}>Real Chog #{tokenId} · mainnet play</p>
      {notice}
      {g.errorCode && (
        <C.ErrorNotice
          code={g.errorCode}
          detail={g.errorDetail ?? undefined}
          onRetry={g.clearError}
        />
      )}
      {!game && (
        <C.Activation
          onActivate={() => void handleActivate()}
          onCancel={() => nav(`/chog/${encodeURIComponent(tokenId)}`)}
        />
      )}
      {game && controller !== sessionWallet && (
        <section className={s.card}>
          <h1 className={s.display}>You own this Chog — take control</h1>
          <p>
            Its chapter is still attached to the previously observed controller{" "}
            <code>{short(controller)}</code>. Continue to confirm your ownership
            on-chain and open the chapter: stats, title, chronicle, supplies and
            today’s remaining actions all carry over unchanged.
          </p>
          <div className={s.row}>
            <button
              className={s.btn}
              disabled={g.busy}
              onClick={() => void handleActivate()}
            >
              {g.busy ? "Verifying ownership…" : "Take control and continue"}
            </button>
            <Link
              className={s.btn2}
              to={`/chog/${encodeURIComponent(tokenId)}`}
            >
              Back to profile
            </Link>
          </div>
        </section>
      )}
      {game && controller === sessionWallet && (
        <>
          <section className={s.card}>
            <h2>{game.title}</h2>
            <C.Ledger st={game.stats} />
            <C.QuotaPanel
              used={game.actionsUsedToday}
              next={formatResetLocal(game.nextResetUtc)}
            />
            {game.intention && (
              <p className={s.fine}>
                Chapter intention:{" "}
                {game.intention === "embrace"
                  ? "lean into the legend"
                  : "begin a redemption chapter"}
                .
              </p>
            )}
            <p className={s.fine}>
              Playing as <code>{short(sessionWallet)}</code> · ownership is
              checked before each save.
            </p>
            <div className={s.row}>
              {game.actionsUsedToday < 3 ? (
                <button
                  className={s.btn}
                  disabled={g.busy}
                  onClick={() => void g.openPlay()}
                >
                  Continue the story
                </button>
              ) : (
                <p className={s.fine}>
                  Come back after the reset. Past chapters stay readable on the
                  profile.
                </p>
              )}
              {game.intention === null && (
                <button className={s.btn2} onClick={g.openIntention}>
                  Chapter intention (optional)
                </button>
              )}
              <Link
                className={s.btn2}
                to={`/chog/${encodeURIComponent(tokenId)}`}
              >
                Open chronicle
              </Link>
            </div>
          </section>
        </>
      )}
      <p className={s.fine}>
        Leaving an encounter unresolved costs nothing. Daily decisions belong to
        the Chog and survive owner changes.
      </p>
    </main>
  );
}
