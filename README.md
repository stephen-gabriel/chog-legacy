# Chog Legacy

**The Chog keeps its past. You choose its next chapter.**

A compact daily story game where an NFT character’s reputation follows the token to its next owner. This repository is under active construction toward the Chogathon 2026 submission. The full practice experience runs today with no wallet and no spending; live mainnet profiles read through the local API, and Milestone 3 adds wallet sign-in (SIWE) with owner-authorized gasless play.

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
```

Then open **http://localhost:5173/practice** (the complete loop) or the entry page at `/`.

To also serve real mainnet profiles (Postgres + live Monad RPC):

```bash
docker start chog-legacy-pg        # local postgres:17 with chog_dev / chog_test
npm run db:migrate                 # apply db/migrations
npm run api                        # → http://127.0.0.1:8420 (proxied at /api by vite)
```

Then open `/` and choose **Sign in with wallet** (browser wallet required; the API and Vite dev server must both be running so `/api` proxies correctly).

Without the API the app still runs; real lookups fail closed with `STORAGE_UNAVAILABLE` and honest guidance. (Note: the API listens on **8420** — port 8787 falls in a Windows Hyper-V excluded range on some machines.)

## Test and build

```bash
npm run typecheck  # tsc --noEmit
npm test           # vitest: rules, service, browser flow, SIWE auth, API auth, real profile (136 tests)
npm run test:db    # real-Postgres suite: service, auth, transfer-flow, server smoke (46 tests)
npm run build      # typecheck + production bundle in dist/ + server bundle in dist-server/
npm start          # serve the production bundle (client + API) on PORT/API_PORT
npm run preview    # serve the client bundle
```

The fixture state gallery is available in dev mode only at `/dev/gallery`.

## What works today

- Public entry with real-token lookup and one-click practice.
- Server-backed real profiles (`GET /api/profile`): current owner, verification block, IPFS metadata + trait chips, merged game/chain chronicle, bounded history coverage, and a Refresh that performs a genuine `ownerOf`/`tokenURI` read — read-only lookups never create game state.
- Full practice loop: seeded feared Chog → encounter choice with exact previews → awaited save + receipt → chronicle → **simulated** controller change → inheritance summary (reputation, history, supplies and remaining daily actions preserved) → optional chapter intention (saved only on confirm; “Decide later” keeps it open) → continue as the new controller.
- Three decisions per UTC day, six authored encounters, deterministic daily selection, eligibility gates (villain options open, trust options locked until earned).
- Practice progress persists across refreshes in this browser only, isolated from real/mainnet data, with reset.
- Chronicle filtering and pagination; every practice entry labeled as a fixture/simulation.
- **Wallet sign-in (SIWE)**: connect an injected provider (allowlisted methods only), sign an EIP-4361 message, receive an HttpOnly `SameSite=Lax` session cookie (24h, no localStorage session), switch accounts (forces re-auth), logout revokes server-side.
- **Owner-authorized gasless play**: every mutation re-reads `ownerOf` on Monad before acting; the current owner activates their Chog, receives deterministic encounters, spends three UTC-day actions, and can hand the token to a new controller, who inherits reputation, history, quota remainder and open intentions.
- **Production bundle**: `npm run build && npm start` serves the SPA and API from one origin (static + SPA fallback, immutable asset caching, fail-closed 401s) — verified with 27/27 automated browser checks against live Monad mainnet (`evidence/browser/`).

## What is intentionally not enabled yet

- No transactions, approvals, $CHOG, purchases or paid APIs anywhere — play is gasless (personal_sign only).
- Non-owners can read a token’s live profile but cannot play it; the play page says so honestly.

## Documentation

| File | Purpose |
| --- | --- |
| `_build_plan/` | Full specification pack (PRD, FRD, architecture, UI handoff, build plan) |
| `_build_plan/IMPLEMENTATION_PROGRESS.md` | Session-by-session progress, blockers and next milestone |
| `INTEGRATION_EVIDENCE.md` | Gate 0 live probes + Milestones 2–4 evidence (incl. verification-class matrix) |
| `DEPLOYMENT.md` | $0 deploy guide — Render Free + Neon, env checklist, post-deploy checks |
| `REAL_HOLDER_CHECK.md` | Consenting real-holder sign-in + save walkthrough (safety rules, pass criteria) |

## Known limitations

- Practice state lives in browser `localStorage` by design (isolated simulation); canonical mainnet state lives in Postgres and grows only through signed-in mutations.
- Ownership is an observation, not a lock: a transfer between the server’s fresh `ownerOf` read and the commit is a small documented race; ownership is re-verified after state changes, and a controller change surfaces as an inheritance takeover on next sync.
- Gameplay history is app-saved fiction and does not become immutable just because it is displayed next to chain facts.
- If `SESSION_SECRET` is unset (dev only), a random per-process secret is used and all sessions reset on API restart.
