# RETIRED — original night-ledger prototype

Superseded on 16 October 2026 by `_build_plan/UI_DESIGN.md` and runtime `src/ui/`. This folder is an archival snapshot only. Do not import, copy, or reapply its components/styles. The statements below describe the old prototype, not the current app.

---

# Chog Legacy UI — integration guide

Stack: React + TypeScript, CSS Modules (`ui.module.css`), no Tailwind, no runtime dependencies beyond React.
Nothing is connected: every handler in `App.tsx` is a console-logging fixture stub. `fixtures.ts` is dev-only; keep it out of production bundles.

## Files
- `types.ts` view models + `Handlers` callback contract (map 1:1 to FRD API/error codes)
- `components.tsx` all surfaces; `App.tsx` fixture gallery of every state; `ui.module.css` styles/tokens

## Surface → component
Entry → `Entry` · Profile → `ProfileView` · Owner activation → `Activation` · Inheritance → `Inheritance`
Encounter → `EncounterView` · Saved outcome → `Outcome` · Chronicle → `Chronicle` · Practice → `PracticeBar` + same views with `mode:'practice'`
Wallet/session → `SessionBar` · Daily limit → `QuotaPanel` + `ProfileView` · Errors → `ErrorNotice(code)`

## Wiring rules
1. Routes (suggested): `/`, `/chog/:tokenId`, `/chog/:tokenId/play`, `/practice`. Router and data fetching are yours.
2. Pass server state only. UI never computes deltas, eligibility or titles; `Choice.preview` and `lockReason` come from the server.
3. `EncounterView.save`: set `pending` on submit, `saved` only after the 2xx receipt (then render `Outcome`), `conflict` on 409 STATE_CHANGED (refetch, pass fresh encounter), `failed` on 503. `Outcome dup` for idempotent retries.
4. On `403 NOT_CURRENT_OWNER`, set viewer to `non-owner`, refetch. `SessionBar` states map to wallet/SIWE events.
5. Practice: render `PracticeBar` above every practice view; `onPracticeHandoff` is the only simulated transfer and must not exist in real mode.
6. Chain links in `Chronicle` use `https://monadscan.com/tx/{hash}`; confirm the explorer URL and chain facts at the integration gate. Fixture entries never render links.
7. `Entry`/`Inheritance` call `onIntention('skip')` for "Decide later"; treat as no intention set (does not use the once-per-epoch choice) — confirm with FRD OWN-03.
8. Timezone: pass `nextResetLocal` preformatted with a time-zone label.

## Asset inventory
- No raster images, icon fonts, web fonts or external requests. Fonts are system stacks (Iowan Old Style/Georgia, system-ui).
- Icons: Unicode glyphs (✓ ✕ ⚠ 🔒 ⛓ ✎ ⇄ ⚑ ● ○) plus one inline SVG fallback face in `Portrait` (original, no licence). Replace emoji 🔒 with an SVG if platform rendering varies.
- Real NFT image: `Profile.imageUrl` from retrieved metadata only; fallback shown on missing/error.
- Missing/needed: brand logo, optional encounter illustrations (none required), favicon.

## Not covered / open questions
- Multi-Chog wallet picker (manual token lookup only; add when integration can enumerate).
- Chronicle filter "intention" option and real pagination state (callbacks only; no page counter).
- Dedicated screens for session-expired and unsupported-wallet beyond `SessionBar` text; ownership-changed-mid-session uses `ErrorNotice NOT_CURRENT_OWNER` + non-owner profile.
- Not compiled or browser-tested in this environment. Run `tsc` and review keyboard flow (radio groups, visible focus) once in your project.
