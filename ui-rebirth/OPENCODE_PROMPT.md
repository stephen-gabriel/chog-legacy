# OpenCode — integrate Chog Legacy's Milkwood Journal UI

Implement this redesign in the **existing full Chog Legacy repository**. This is a visual and interaction refinement pass, not a new application. The user wants the supplied cream/sage storybook design implemented faithfully. Complete the work and verify it; do not stop at a plan.

## Read first

Read the root AGENTS.md if present, existing `_build_plan/IMPLEMENTATION_PROGRESS.md`, FRD.md, ARCHITECTURE.md, and this package's START_HERE.md, VALIDATION.md and PATCH_MANIFEST.json. Then read `apply/_build_plan/UI_DESIGN.md`, `UI_ASSETS.md`, and the changed runtime source. Open PREVIEW.html in a browser if possible; it demonstrates the intended presentation and practice interaction.

## Apply the implementation

1. Inspect git status and preserve all existing user work. Create an isolated branch or a local checkpoint when appropriate; do not discard unrelated edits.
2. `apply/` mirrors project-relative paths. Apply its additions/replacements to the real project. The manifest includes SHA-256 hashes of the uploaded baseline. If a current file differs from its baseline, merge the redesign into the newer file rather than overwriting newer auth, API, gameplay or UI fixes. For new files, check for existing local work before replacing.
3. This package is based on a partial source export. **Keep the actual project's package.json, lockfile, tsconfig, Vite config, index.html, server/, db/, tests/, deployment configuration and environment files.** No runtime dependency is added by the redesign. Do not copy preview tooling or preview mocks into production.
4. The current visual source is runtime `src/ui/` and `_build_plan/UI_DESIGN.md`. Retire the old `_build_plan/ui-design/` prototype as documented; never copy those old components back into runtime. Merge doc annotations with the latest progress history, preserving all genuine newer evidence.
5. Copy `public/art/ashen-storybook.png` and verify `/art/ashen-storybook.png` works in both Vite and the production server. Preserve the original art and the explicit fictional-practice labeling. Real NFT metadata portraits must never be replaced with this art.
6. Preserve the supplied layouts and components. Do not reinterpret the design into a generic card dashboard or revert to the violet theme. Match the cream paper, cocoa type, sage accents, journal layout and arched hero artwork. No Tailwind, 3D engine, extra animation framework, external font service, paid service or new story feature.

## Keep the application honest

Keep existing wallet/SIWE/session handlers, ownership verification, API contracts, database persistence, gameplay rules, server previews, save receipts, idempotency and daily quotas authoritative. Real play must stay fail-closed on invalid or stale ownership/session state. Wallet connection, authentication and NFT ownership remain separate. No action can be spent by merely opening a profile.

Practice stays in its existing isolated browser namespace and exposes the only simulated controller handoff. The offline PREVIEW.html has its own namespace and belongs only in this handoff folder, never production public/.

Encounter selection must show supplied exact clamped previews and locked-choice reasons. Pending prevents duplicate UI submissions; saved outcome appears only after confirmation. A failed/uncertain save must not imply success. Skip intention stays unset/reopenable, and inheritance preserves stats, history, supplies and remaining allowance.

Two presentation mapping fixes are included: sort chronology numerically before formatting timestamps; display observed current owner instead of historical gameplay controller. Port the included `verification/realMapping.test.ts` to the existing test layout and run it with the project runner.

## Verification before finishing

Use the repository's installed/pinned versions and actual scripts:

- `npm run typecheck`
- `npm test`
- `npm run test:db` using the existing local test database setup
- `npm run build` including the server bundle

Do not upgrade dependencies merely because the isolated preview used different tool versions. If UI copy/markup changes require updating selectors in existing tests, preserve every meaningful behavior assertion. Never delete or skip tests just to get green. Report any environment blocker honestly, with exact commands/results.

Run the actual production bundle locally, with the real existing API and database. Check desktop and mobile entry, practice profile, encounter (eligible/locked, preview, pending, failure, confirmed outcome), inheritance/skip/reopen, chronicle filter/pagination, persistence/reset and exhausted quota. Check at 320/390/768/1440px for overflow, visible focus, Tab/Space/Enter, wallet popover Escape, and reduced motion. Run the existing browser tests and an accessibility scan if available.

Check real profiles: authentic NFT image and fallback, on-chain versus gameplay labels, fresh/stale/unavailable ownership, refresh pending/error without losing data, unstarted/owner/non-owner and session-expired states. Verify actual wallet connection/sign-in, account/network changes, logout and existing fail-closed gates. Review the real owner play screen with the new shared layout. These need the full project because root server/tests were absent from the handoff export.

Do not claim a consenting real-holder save is proven by practice, mocks or a non-owner wallet. Preserve that evidence gate until actually completed. Connected story consequences and inherited unfinished obligations remain separate gameplay work.

Keep this temporary handoff folder out of production/public assets; do not upload the offline preview into the website. Update the implementation progress with exact changes, commands and remaining limitations. Finish with the local URL, file summary, test results and any remaining genuine blockers. **Do not push or deploy yet.**
