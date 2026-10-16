# Validation — UI refresh, 16 October 2026

This package is a frontend redesign based on the uploaded Desktop.zip. It has not been pushed or deployed.

## Passed here

| Check | Result and scope |
| --- | --- |
| TypeScript | Strict `tsc --noEmit` over supplied src, TypeScript 5.9.3, isolated alias/JSX configuration: clean. |
| Frontend production bundle | Vite 8.3.4, React plugin, 47 modules: clean. Approximately 349 KB JS and 42 KB CSS before gzip, plus the supplied static PNG. |
| Browser assertions | 28 passed in headless Chromium: input validation; wallet popover Escape; required selection and heading focus; keyboard choice/save; inheritance preservation; skip intention remains reopenable; refresh persistence; chronicle filter/page; quota exhaustion; handoff cannot reset quota; confirmed reset; responsive overflow; real-profile fallback and refresh error preservation; zero uncaught page errors. |
| Responsive checks | Home, practice profile and encounter: zero horizontal overflow at 320, 390, 768 and 1440px. Real-profile fixture: zero overflow at 390px. Screenshots were visually reviewed internally. |
| Accessibility scan | Eight sampled screens with axe WCAG 2 A/AA and 2.1 AA tags: zero remaining violations after contrast corrections. Samples: desktop home, practice profile, selected encounter, saved outcome, inheritance, mobile home/encounter and real-profile fallback. This is a sampled automated scan, not a complete accessibility certification. |
| Mapping regression assertions | Numeric chronological order across September/October; observed current owner rather than old gameplay controller. Both passed in a bundled Node check; equivalent Vitest tests included for the full repository. |
| Offline preview | PREVIEW.html opens via file URL, enters practice, selects and saves a choice. No external requests required. Uses a separate design-preview localStorage key. |

The practice browser journey used the existing supplied GameService and browser persistence. Auth/health and real-profile responses were intercepted fixtures in the external QA harness. Those fixtures are not part of the production source or the apply/ directory. Real NFT image failure was intentionally simulated for fallback testing.

## What these results do not prove

The uploaded export omitted root server/, db/, tests/, tsconfig, Vite configuration and index.html. Therefore the actual full repository's npm test, npm run test:db, production server build and live wallet/backend flows could not be rerun here. Temporary frontend configurations and dependencies were used only to validate the available source; none replace the project's own configuration or lockfile.

After integration, OpenCode must run the existing project's pinned toolchain and complete scripts, then check the production bundle with its actual API/DB. Existing tests may need accessible-label or copy selector updates; behavior assertions must remain intact.

The user's earlier reports of 136 unit tests, 46 DB tests and live RPC/browser evidence are historical context, not new claims from this pass. A real-holder authenticated saved choice remains unverified here. No on-chain transaction, wallet signature, database mutation, remote commit or deployment was performed by this UI work.

## Changes that deserve review during integration

- Header wallet controls moved into a popover; actual auth handlers are reused.
- Real public profile now composes the shared visual ledger and chronicle. Numeric sorting happens before locale formatting; current owner label comes from the ownership observation.
- Encounter adds optional profile/back props; practice passes them through. Existing submit/save APIs stay unchanged.
- Practice scene changes focus the heading and scroll to the top.
- Generated artwork is static and fictional-practice-only; real image metadata and fallback remain distinct.
- The offline preview is a separate inspection artifact. Do not ship it in public/ or use it as the production application.
