# Chog Legacy — The Milkwood Journal

Version 2.0 · 16 October 2026 · Current visual specification

The user requested a full redesign of the original night-ledger UI: creamy, inviting and recognizably a story game. This is the selected implementation direction for this handoff. Functional authority stays with FRD.md; this document governs presentation. Runtime source is `src/ui/`, `src/App.tsx`, and the route components. `_build_plan/ui-design/` is the retired first designer's snapshot, not code to copy back into the app.

## The visual idea

A little illustrated adventure inside a well-kept character journal. Warm milk-colored paper, cocoa ink, sage accents and quiet apricot details. A Chog and its story should be the memorable elements. Avoid a financial-dashboard appearance, neon panels, glass effects, huge empty boxes or excessive decoration.

The design name is **The Milkwood Journal**; the product remains **Chog Legacy**.

## Palette and type

| Role | Value |
| --- | --- |
| Page | `#f8f5ed` |
| Paper panel | `#fffdf8` |
| Primary ink | `#332d26` |
| Secondary text | `#686152` |
| Hairline | `#e4decf` |
| Green accent/focus | `#41634e` / `#476c59` |
| Warm reputation accent | `#954b28` |
| Practice ribbon | `#e8eddc` |

Use Georgia/Times for editorial headings and Trebuchet MS/Segoe UI/system sans for controls and text. No font requests or new runtime dependency. Typography should survive different system fonts; verify on the user's Windows browser. Helpers must remain readable at normal zoom. Letter spacing is for short labels only.

Buttons use cocoa fill, cream text, a small pressed edge and restrained hover movement. Secondary controls use cream borders. Ordinary panels use a thin border and rounded corners; no repeating heavy shadows. Focus is visible. Motion is optional and respects reduced motion.

## Screens and composition

### Entry

A compact book-mark logo and useful navigation. A two-column hero: “A little Chog. A long story.” beside the original woodland practice illustration in an arched card. The caption explicitly identifies the fictional practice character. One primary practice action and a quieter real-token lookup link. A three-step explanation leads to a token lookup form. The wallet opens from a compact header control rather than dominating the page.

### Journal/profile

Character art and identity form a narrow left column. Reputation, today's decisions and chronicle occupy the wider column. Real NFT metadata and ownership observations remain distinct from saved gameplay. Show observed owner and freshness, not a historical game controller as current owner. A missing real NFT image gets a neutral book fallback, never the fictional practice art.

Practice uses Ashen, a clearly fictional character. A persistent sage ribbon identifies the simulation, controller, browser-local progress, and the simulated handoff. Reset/leave controls sit in a small options menu. No simulated handoff appears in real play.

### Encounter

A reputation sidebar sits beside a story page. The authored encounter title and situation lead; three native radio-card choices follow. Each eligible choice shows the supplied exact before/after values. Selection adds a visible check and dashed preview marker. Locked choices remain visible with their supplied reason. Confirm stays disabled without an eligible selection and while saving. Leaving unresolved spends nothing.

On phones the reputation panel precedes the story; choices stack, and confirm spans the available width. Do not hide exact previews to make the page shorter.

### Saved chapter

Show the confirmed outcome as the main heading, followed by before/after reputation and the next action. Put technical receipt details in a disclosure. Practice receipts say browser simulation; real receipts say app save, not a blockchain transaction. Never render this surface as a substitute for an awaited save.

### Inheritance

A chapter transition, carried-forward state, and the last three choices. Present embrace/redeem/decide-later as optional framing cards. “Decide later” leaves the intention unset and reopenable. No stat changes or quota reset from framing or handoff. The heading also works when choosing an intention without a transfer.

### Chronicle

A readable vertical journal with text event labels, actor, time and entry. Filtering and local pagination reflect the entries actually loaded. Genuine non-fixture chain records alone have explorer links. Keep partial chain coverage visible; do not claim the current client list includes every server event.

## Responsive and interaction rules

Desktop content is capped near 1192px. Profile sidebars are approximately 310px, collapsing on small screens. Mobile uses roughly 20px page gutters. Header navigation simplifies at narrow widths, retaining home, wallet and contextual game controls. The landing page still exposes practice and lookup.

Use semantic headings, native radio groups, label every input, provide descriptive image alternatives, keep keyboard focus visible, and announce errors/save outcomes. Practice view changes return focus to the new heading. Wallet popover closes on Escape/outside click. Keep touch targets usable and avoid horizontal scrolling at 320, 390, 768 and 1440px.

## Boundaries

No 3D engine, moving 3D character, AI calls, marketplace, paid assets, token rewards, multiplayer, invented quests or new story systems. The illustration is a static original asset. Preserve the actual rules, wallet/SIWE logic, owner checks, API contracts, receipts, quota and persistence. Existing game hooks and services remain authoritative.

Connected story consequences and inherited unfinished obligations are separate future gameplay work. This visual refresh does not claim those features are implemented.

## Integration

Use the supplied runtime changes. Do not rebuild the page loosely from this prose or restore the old designer components. Merge against current local source so later backend integration work is retained. The original PRD, FRD and architecture remain the game contract; this file replaces their delegation of visual decisions to the previous designer. See UI_ASSETS.md and the package's OPENCODE_PROMPT.md and VALIDATION.md.
