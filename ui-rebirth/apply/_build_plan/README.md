# Chog Legacy — build documents

Updated 16 October 2026 · UI refresh handoff

**Every owner writes another chapter. The Chog keeps the consequences.**

The app has already been implemented and the user reports deployment. Continue from the current repository; do not restart the project from the original planning baseline.

| File | Authority |
| --- | --- |
| PROJECT_BRAIN.md | Product context, constraints and decisions |
| PRD.md | Product scope and purpose |
| FRD.md | Functional behavior and acceptance criteria |
| ARCHITECTURE.md | APIs, identity, persistence and ownership boundaries |
| BUILD_AND_TEST_PLAN.md | Functional verification gates |
| IMPLEMENTATION_PROGRESS.md | Implementation history; distinguish reported prior evidence from this UI pass |
| UI_HANDOFF.md | Required screens, states and interaction coverage |
| UI_DESIGN.md | Current Milkwood Journal visual design |
| UI_ASSETS.md | Supplied artwork, icon and type inventory |

Runtime UI lives in `src/ui/`, `src/App.tsx`, and the route components. `_build_plan/ui-design/` retains the retired initial designer package for reference only; never copy it over the runtime. There is one current visual authority: UI_DESIGN.md. Existing PRD/FRD/architecture remain authoritative for behavior.

The UI refresh package contains exact replacement/addition paths and an OpenCode prompt. Apply those changes to the existing full project, preserve newer work, then run its full tests and production build. Do not replace deployment files, secrets, backend, database migrations or game rules with a partial frontend preview.

The real-holder saved-choice walkthrough remains a separate evidence gate unless completed and recorded in the full repository. A successful practice demo is not proof of real-holder authorization.
