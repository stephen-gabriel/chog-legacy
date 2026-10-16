import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as C from "@/ui/components";
import s from "@/ui/ui.module.css";
import type { Handlers } from "@/ui/types";
import { usePractice } from "./usePractice";

const noop = () => {};

export function PracticePage() {
  const p = usePractice();
  const nav = useNavigate();

  useEffect(() => {
    const heading = document.querySelector<HTMLElement>("#content h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [p.view]);

  const h: Handlers = {
    onConnect: noop,
    onSignIn: noop,
    onCancelSignIn: noop,
    onDisconnect: noop,
    onLookup: noop,
    onStartPractice: noop,
    onRefreshOwner: noop,
    onActivate: noop,
    onIntention: noop,
    onSubmitChoice: noop,
    onPage: noop,
    onFilter: noop,
    onPracticeReset: () => {
      if (
        window.confirm(
          "Reset practice? This clears the simulated history saved in this browser and reseeds the feared Chog.",
        )
      ) {
        p.reset();
      }
    },
    onPracticeHandoff: () => p.handoff(),
    onLeavePractice: () => nav("/"),
  };

  const continueAfterInheritance = () => {
    if (p.profile.actionsUsed < 3) p.openPlay();
    else {
      p.openProfile();
    }
  };

  return (
    <>
      <C.PracticeBar
        h={h}
        controller={p.controller}
        actionsUsed={p.profile.actionsUsed}
      />
      {p.note && (
        <div className={s.page} style={{ paddingBottom: 0 }}>
          <p className={s.ok} role="status">
            {p.note}{" "}
            <button className={s.link} onClick={p.clearNote}>
              Dismiss
            </button>
          </p>
        </div>
      )}
      {p.view === "profile" && (
        <C.ProfileView
          p={p.profile}
          v="owner"
          h={h}
          onPlay={p.openPlay}
          onSetIntention={p.openIntention}
        />
      )}
      {p.view === "encounter" && p.play?.encounter && (
        <C.EncounterView
          e={p.play.encounter}
          profile={p.profile}
          onBack={p.openProfile}
          st={p.play.stats}
          used={p.play.actionsUsed}
          next={p.profile.nextResetLocal}
          save={p.saveState}
          error={p.errorCode ?? undefined}
          onSubmit={(choiceId) => p.submitChoice(choiceId)}
          onRetry={p.clearError}
        />
      )}
      {p.view === "encounter" && !p.play?.encounter && (
        <div className={s.page}>
          <C.ErrorNotice code="STATE_CHANGED" onRetry={p.openProfile} />
          <p className={s.fine}>
            The current encounter could not be loaded. Return to the profile and
            continue from there.
          </p>
        </div>
      )}
      {p.view === "outcome" && p.outcome && (
        <C.Outcome
          mode="practice"
          before={p.outcome.before}
          after={p.outcome.after}
          titleBefore={p.outcome.titleBefore}
          titleAfter={p.outcome.titleAfter}
          text={p.outcome.text}
          left={p.outcome.left}
          next={p.profile.nextResetLocal}
          receipt={p.outcome.receiptId}
          dup={p.outcome.duplicate}
          onNext={p.nextAfterOutcome}
          onChronicle={p.openProfile}
        />
      )}
      {p.view === "inheritance" && (
        <C.Inheritance
          p={p.profile}
          onSetIntention={(i) => p.setIntention(i)}
          onContinue={continueAfterInheritance}
        />
      )}
    </>
  );
}
