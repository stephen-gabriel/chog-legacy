# Chog Legacy — specification pack

Version 1.0 · 9 October 2026 · Prepared for Stephen

**Every owner writes another chapter. The Chog keeps the consequences.**

This is a build specification, not a visual design or application implementation. The chosen direction is a compact asynchronous story game with token-bound reputation and ownership inheritance. It is intentionally smaller than an open world or AI companion platform.

## Files and reading order

| File | Purpose |
| --- | --- |
| `PROJECT_BRAIN.md` | Durable project context, decisions, pitch, constraints and unresolved verification |
| `PRD.md` | What to build, why it matters, player loop, scope and release criteria |
| `FRD.md` | Exact behavior, deterministic game rules, permissions and acceptance criteria |
| `ARCHITECTURE.md` | Stack, data model, APIs, ownership verification and environment separation |
| `UI_HANDOFF.md` | Screens, information and interaction states for the separate design AI; no visual design prescribed |
| `BUILD_AND_TEST_PLAN.md` | Implementation order, verification gates, tests and demo plan |

If a later implementation decision conflicts with these documents, update the relevant documents and the decision log together. Do not silently let a design prototype change the game rules or wallet permissions. FRD governs functional behavior; architecture governs implementation boundaries; UI handoff governs required interaction coverage. Visual decisions belong to the design AI.

## Start with the design AI

Give it `PROJECT_BRAIN.md`, `PRD.md`, `FRD.md` and `UI_HANDOFF.md`. Use this prompt:

> Design the user interface for Chog Legacy using the attached specifications. You own the visual design, responsive layouts and interaction presentation. Cover every required screen and state in UI_HANDOFF.md. Preserve the functional rules in FRD.md. Use React + TypeScript with plain CSS or CSS Modules, not Tailwind. Supply an implementable component and styling package, including meaningful loading, error, read-only and practice states. Use clearly labeled fixture data only. Do not implement blockchain authentication, invent API behavior, add transactions, introduce $CHOG, or expand the feature scope. Include a route/component inventory, asset inventory and a short integration guide for OpenCode. The real backend and wallet integrations will be built separately.

## Then use OpenCode

Give OpenCode the entire specification pack and the design AI's outputs. Use this prompt:

> Build Chog Legacy according to these documents and integrate the supplied UI implementation. Read all documents before editing. Start with Gate 0 in BUILD_AND_TEST_PLAN.md, then implement one working vertical slice at a time. Preserve a $0 core, mainnet reads only, gasless sign-in, token-bound state and strict separation of practice versus real data. Do not request NFT approvals or send production transactions. Implement deterministic gameplay before optional AI narration. Verify each milestone using the specified acceptance criteria. Record completed work and blockers in a local progress file after each milestone. Keep secrets out of source and browser bundles. If a verified integration contradicts the spec, document the evidence and update the affected contract/configuration assumptions rather than inventing working data. Do not deploy or claim mainnet validation until the release gates pass.

## Important boundaries

- No NFT purchase, $CHOG integration, paid AI dependency or player transaction is required.
- Mainnet play uses actual current ownership; a signature proves a wallet, while `ownerOf` proves ownership.
- Public visitors can inspect real Chogs and play an isolated practice scenario without an NFT.
- Gameplay history is saved in the application's database. Only ownership/provenance facts are on-chain. Do not advertise the gameplay database as immutable or permanent.
- Mainnet metadata, historical-log access and the hackathon's current official rules still need integration verification. The previous claim about 488 registered apps is not evidence and is excluded.
- The supplied rubric guides scope; a winning score or NFT-essentiality decision is not guaranteed.

No colors, typography, layout, animation style, visual assets or mockups are specified in this pack.
