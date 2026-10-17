# Chog Legacy — implementation progress

## UI refresh handoff — 16 October 2026

Milkwood Journal presentation implemented from the uploaded partial source export. New cream/sage journal design, original fictional practice illustration, responsive profile and encounter layouts, readable exact previews, saved-chapter and inheritance screens, compact wallet controls and current visual/asset docs. The product name stays Chog Legacy. Original `ui-design/` prototype is retired.

Preserved the existing auth/API hooks, practice/game services, deterministic rules and quotas. Presentation mapping corrections: numeric chronology ordering before date formatting; observed NFT owner label rather than historical gameplay controller. Added practice heading focus, a UI submit guard, and honest clipboard feedback.

Verification in the isolated frontend environment: strict TypeScript and Vite production build; 28 browser flow/layout assertions; eight sampled WCAG A/AA axe scans corrected to zero violations; offline preview practice save. Home/profile/encounter fit 320, 390, 768 and 1440px; real-profile fixture also checked at 390px. Main practice flow uses the actual supplied browser service. Real profile and auth/health responses in UI QA were fixtures, not live chain evidence. Two mapping assertions checked timestamp ordering and current-owner labeling.

This export did not contain root server/, db/, tests/ or the project's root build configuration. The full backend, DB, production server, real wallet and holder-save regressions MUST be run in the existing repository before release. Prior session results below are historical reported evidence, not rerun by this UI pass. No remote push or deployment was performed. The user reports the previous app is deployed; that is separate from deploying this redesign.

Next: integrate the UI handoff into the current full project, retain newer local changes, run its typecheck/unit/DB/build/browser gates and inspect the resulting UI. Keep the real-holder saved-choice gate explicit. Connected story consequences and inherited unfinished obligations remain separate pending gameplay work.

## Origin hardening + real-profile reliability — 16 October 2026

Work on `ui-rebirth-milkwood` after integrating the Milkwood UI (`574fb1e`). Two fixes on top of the UI integration, checkpointed locally as `fix: harden origins and improve real profile loading`. No push or deploy; the local detached server was left running.

### Origin / CSRF hardening
- New error code `ORIGIN_DENIED` (HTTP 403) replaces the previous generic `INVALID_INPUT` on disallowed writes, with a user-facing notice ("This request was blocked for security… open the app from its own address"). Mapped through the shared `ErrorCode` unions, `STATUS_BY_ERROR`, and the UI `MSG` map.
- `Config.production` derives from `NODE_ENV === 'production'`. `isAllowedAppOrigin` grew an `allowLocalhost` option (default true, so behavior is unchanged unless opted out). Every enforcement site — `requireOrigin`, `allowOriginIfPresent`, both `server/auth/siwe.ts` origin checks, and the `main.ts` CORS headers — passes `{ allowLocalhost: !config.production }`.
- Result: **development keeps localhost allowances** (any `localhost` port). **Production accepts only the configured `APP_ORIGIN`** and rejects `localhost` and `127.0.0.1` entirely. Verified in `tests/api-auth.test.ts` (prod-mode test: localhost → `ORIGIN_DENIED`, configured origin still reaches the chain check).

### Real-profile loading
- `GET /api/profile` performs a **bounded first-time metadata fetch** when the cache is missing: `metadataTimeoutMs: 5000`, `metadataCycles: 1`, `syncHistory: false`, falling back to the ownership-only read on error. History sync still only advances on `POST /api/profile/refresh`.
- `resolveMetadata` retries across cycles (default 2, `retryDelayMs` 250, growing per cycle) across the pinned gateway list.
- `refreshProfile` now **preserves prior name/image/traits** on a metadata failure instead of wiping the cached row (`readMetadataRow` helper); a failed fetch records the error but keeps previously observed data. Ownership is always written before metadata, so a metadata failure never costs ownership.
- Client `Portrait` rotates through 4 IPFS gateway URLs (`ipfsHttpAll`) via an `onError` fallback chain instead of a single hard-coded gateway.

### Verification
- `npm run typecheck` — clean; `npm run build` (typecheck + vite + esbuild server) — clean.
- `npm test` — **142/142** (was 140 before these changes; added origin-allowlist `allowLocalhost:false` cases, the production-mode origin test, and two gateway-retry metadata tests).
- `npm run test:db` — **49/49** (added two first-time-lookup smoke tests against real Postgres + stub RPC: uncached-token success populates metadata with no POST; metadata-failure token still returns fresh ownership with `metadata.error` set).
- Live check against the running server + live Monad RPC: token **100** (uncached in `chog_dev`) returned `owner=0x491db6f3…cba7`, `status=fresh` on a plain GET with no POST; ownership was preserved even though the metadata fetch hit the bounded path. Tokens **1047 / 476 / 1425** confirmed with correct names and owners (539 / 1937 / 917) and loading images in a headless browser earlier in the session. Localhost-origin refreshes still return 200; foreign and loopback-loopback origins return 403 `ORIGIN_DENIED`.

### Known limitation
- **IPFS gateway throttling:** of the four public gateways only `gateway.pinata.cloud` reliably responds; `dweb.link`, `w3s.link` and `ipfs.io` return **HTTP 429** from this machine. The multi-gateway retry plus the cache-with-preserve path make this safe (ownership and any previously fetched metadata are never lost, and a later successful fetch fills the row), but **a token whose metadata has never been cached can still come back with `metadata: null` until a gateway allows the request**. Chain facts (owner, block, tokenURI) are unaffected. Mitigations if this persists: pin the token URIs to a dedicated gateway, self-host an IPFS gateway, or move metadata retrieval off the request path. This is environment/throttling, not an application defect.

## Story arc: the courier's debt — 16 October 2026

Implementation complete for the courier-debt milestone on `ui-rebirth-milkwood`. Rules stay on `legacy-v1` (`COURIER_TEMPLATE_ID = 0`). Day 0 offers the stranded-courier choice (`share` opens `courier_trust`, `reward` opens `tax_grudge`, `pass` is neutral). The next UTC day is a courier-only recall (`settle_tax` / `take_waystone` open `waystone_promise`; `refuse_courier` / `deny_debt` close cleanly). `waystone_promise` then exposes `carry` / `hand_back` / `sell`. Every branch closes; the current owner is the only legal resolver; incoming owner gets `NOT_CURRENT_OWNER`; retries stay idempotent; existing characters get no fabricated obligations.

Shared rules (`src/shared/rules/story.ts` + `buildEncounterView`) now take an explicit `today` so recall/waystone readiness is deterministic and testable. Both the in-memory practice service and the Postgres service persist/open/close consequences, expose open obligations on profile and play, and return `consequence` / `obligationClosed` on receipts. Migration `0002_story_consequences.sql` is non-destructive and applied.

### Acceptance verification — 17 October 2026

**Test gates**
- `npm run typecheck` — clean
- `npm test` — **144/144** (in-memory courier-arc suite: open trust → next-day recall → settle into waystone → carry fulfilment → `openObligations` empty afterwards)
- `npm run test:db` — **52/52** — coverage closed for the four DB risks:
  - *restart persistence*: `tests/db/service.test.ts` "persists an open waystone obligation across service restart" — commits `settle_tax` (open `waystone_promise`), ends the pool, reconnects a fresh pool on the same test database and asserts the obligation is still open with `originChoiceId = 'settle_tax'`, then resolves with `carry` → `fulfilled`
  - *outgoing-owner rejection*: `tests/db/transfer-flow.test.ts` "A is rejected with `NOT_CURRENT_OWNER` for every mutation after the transfer" (profile read, action, intention) + in-memory `tests/service.test.ts`
  - *idempotency*: `tests/db/service.test.ts` "idempotent retry returns the stored receipt without reapplying state" and "parallel duplicate submits with one idempotency key apply exactly once"
  - *migration safety*: `tests/db/service.test.ts` "migrates an existing character without fabricating obligations" — activates a character, asserts `openObligations` and `allConsequences` are empty, asserts `0002_story_consequences.sql` is recorded in `schema_migrations`, and asserts zero rows in `story_consequences` for that character
- `npm run build` — clean

**Browser acceptance — 29/29 PASS** (`evidence/browser/arc-verify-results.json` + `arc-*.png`)
- Tooling: `playwright-core` driving system Microsoft Edge (headless, `channel: msedge`) against the production bundle + Docker `chog_dev` on `http://127.0.0.1:8420`.
- **Isolated test clock — no system clock change.** `practiceClock` in `src/server/service.ts` reads `sessionStorage['chog-legacy:practice:clock']` when present and otherwise falls through to `systemClock`; `usePractice` now builds `GameService` from `practiceClock` instead of `systemClock`. The harness sets that key per day (2026-10-23 → 2026-10-24 → 2026-10-25; 2026-10-23 is the first October date whose deterministic template order puts the courier in slot 0 for the practice identity).
- Full arc asserted end-to-end: `A stranded courier` → `Share supplies` → outcome copy "An unfinished promise now rides with the Chog." → journal card `Unfinished obligations` / `1 open promise` / `Courier trust from earlier` / `Began in “A stranded courier”` / `Share supplies` → `Simulate controller change` → inheritance "What carries forward" carries `Courier trust from earlier · From “A stranded courier”` → day-2 recall `The courier returns` → `Settle the tax from your own pack` → day-3 `The waystone promise` → `Carry the waystone to the wayhouse` → outcome "The obligation is settled." → journal obligations section gone → reload preserves the resolved state. Desktop 1440×900 and mobile 390×844 both pass; 0 px horizontal overflow; zero console/page errors.
- **FRD gap found and fixed during this pass:** the journal and inheritance summary listed open obligations without their originating chapter (FRD §122 requires both). `src/ui/components.tsx` now derives the originating chapter and choice from the consequence's `originChoiceId`/`originTemplateId` and renders them in the `Unfinished obligations` card and the inheritance "What carries forward" list.
- Harness note: an `addInitScript` that cleared `localStorage` re-ran on every navigation and silently wiped the practice save between steps; the harness now clears storage once via `page.evaluate` before the first load.

**Server / deploy posture**
- Detached local server left running on `http://127.0.0.1:8420` (pid 9024, health `{"ok":true,"db":true,"chain":{...},"contractName":"Chog Genesis","chainId":143}`). No push, no deploy. Real-holder walkthrough still pending (`REAL_HOLDER_CHECK.md`).

### Deployment readiness — 17 October 2026

Prepared `ui-rebirth-milkwood` for the GitHub → Render release without pushing or deploying. Fixes and evidence only; real-holder verification stays pending.

**Practice test clock — production gate**
- `practiceClock` (acceptance harness walks the courier arc across UTC days via `sessionStorage['chog-legacy:practice:clock']`) is **not** honored in a production build. The override is a build-time constant (`__PRACTICE_CLOCK_OVERRIDE__`), true only under `vite dev`/`vitest`, and a Vite `define` that the production client bundle inlines as `false`; `esbuild` does not define it for `dist-server`, so the server build also sees `false`.
- Verified by reading the emitted client bundle (`dist/assets/index-*.js`): the clock helper collapses to the `systemClock` path with no `sessionStorage` read. Dev/test behavior unchanged (144 unit tests + the browser harness still pass).

**Migration 0002 — safe on an existing Neon-shaped database**
- Boot order in `server/main.ts` is `loadConfig → createPool → runMigrations → createServer/listen`; nothing is served until migrations finish. `runMigrations` records each file in `schema_migrations` and skips already-applied names, so an existing Neon DB (characters/epochs/events from `0001`) is preserved; `0002_story_consequences.sql` is `CREATE TABLE story_consequences` + two indexes only — no `ALTER`/`DROP` on existing tables, no inserted rows.
- Verified by booting the production container (`NODE_ENV=production`, `APP_ORIGIN=https://chog-legacy.onrender.com`) against a Postgres seeded only through `0001`: log showed `[chog-api] applied migrations: 0001_init.sql, 0002_story_consequences.sql` then `listening`; post-boot query showed `story_consequences` created, 0 rows, and the pre-existing character row untouched.

**APP_ORIGIN / production origin enforcement**
- `APP_ORIGIN` is the single public origin: SIWE `domain`/`uri`, session-cookie `Secure` flag, and every write-origin check (`requireOrigin`, `allowOriginIfPresent`, both SIWE origin checks, CORS headers) all derive from `config.appOrigin`. `Config.production` is `NODE_ENV === 'production'`; in production `isAllowedAppOrigin(..., { allowLocalhost: false })` so localhost/127.0.0.1 are rejected outright.
- Verified against the same production container: `POST /api/auth/nonce` with `Origin: https://chog-legacy.onrender.com` → 200 SIWE challenge (domain/uri match the Render origin); `Origin: https://evil.example.com` → 403 `ORIGIN_DENIED`; missing Origin → 403.

**Build-path fixes (new this pass)**
- `.dockerignore` no longer excludes `vite.config.ts` (the Dockerfile `COPY`s it; excluding it made `docker build` fail before typecheck).
- `Dockerfile` build stage no longer copies a nonexistent `shared/` directory; `docker build --no-cache` now completes and the runtime image boots the migrations+origin checks above.

**Gates re-run after the fixes**
- `npm run typecheck` — clean; `npm test` — 144/144; `npm run test:db` — 52/52; `npm run build` — clean; `docker build --no-cache` — success.

**Docs**
- `DEPLOYMENT.md`: migration section now states migrations run *before* the listener and names `0001`/`0002` as the non-destructive order; deploy-log section tells the operator to look for the applied-migrations line then `listening … (origin …)`; post-deploy verification adds the origin-enforcement `curl` pair (200 vs 403) and notes a wrong `APP_ORIGIN` surfaces as the wrong host in the SIWE challenge.
- Release steps and post-deploy verification for the existing GitHub/Render setup remain in `DEPLOYMENT.md` (§2 push, §3 Render env, §4 verification) — unchanged except the above additions. **No push and no deploy were performed this pass.**

---

Version 4.0 · Updated 16 October 2026 · Session 4 of ~8 (deployment readiness + browser verification)

Session 1 delivered the shared rules engine, in-memory service, full practice loop, the four UI fixes, 66 tests and Gate 0 probing (sections below). Session 2 delivered **Milestone 2**: Postgres persistence, the HTTP API, genuine mainnet profile reads, and the fail-closed 401 gate on every gameplay mutation. Session 3 delivered **Milestone 3**: SIWE wallet authentication with HttpOnly sessions, origin/CSRF protection, and owner-authorized gasless play (evidence in `INTEGRATION_EVIDENCE.md` §9). Session 4 delivered **Milestone 4** — minus the consented holder walkthrough: hosting research + full deployment configuration, production-bundle verification, 27/27 real-browser checks against live mainnet, and the practice-timeout root cause (evidence in `INTEGRATION_EVIDENCE.md` §10).

## Completed this session (Session 4 — Milestone 4)

### Hosting research ($0) — `DEPLOYMENT.md`
- Verified against official docs (16 Oct 2026): **Render Free Web Service** (0.1 CPU/512 MB, 750 h/mo, custom domain + managed TLS, listens on `$PORT`, sleeps after ~15 min idle) + **Neon Free Postgres** (1 GB, 100 CU-h/mo, scale-to-zero). Render's own free Postgres expires after 30 days → rejected; Hugging Face Docker Spaces recorded as the Docker fallback. Primary choice: Render + Neon, **same origin** (no CORS config).
- No provider CLIs exist on this build machine (vercel/netlify/flyctl/render/gh all absent) → deployment is a manual, fully documented path rather than an automated one.

### Deployment configuration (all committed)
- `server/config.ts` — new `host` (`HOST`, default `127.0.0.1`), `trustProxy` (`TRUST_PROXY`), `dbSsl` (`DB_SSL`), `staticDir` (default `dist`); `apiPort` now falls back to the platform's `PORT` env (Render requirement).
- `server/main.ts` — serves the built SPA from `staticDir` (content-type map, SPA fallback to `index.html`, path-traversal guard, `no-store` for HTML, `public,max-age=31536000,immutable` for `/assets/`), honors `x-forwarded-for` for rate-limit keys only when `trustProxy` is set, `listen(host)`.
- `server/db/pool.ts` — SSL (`rejectUnauthorized:false`) when `dbSsl` (Neon requires TLS).
- Build tooling: esbuild devDep; `build:server` (bundles `server/main.ts` → `dist-server/main.js`, packages external), `start`, `build` = typecheck + vite + build:server. Migrations are cwd-based (`db/migrations`) so they run under the bundle.
- New: `Dockerfile` (multi-stage node:22-alpine, runtime `npm ci --omit=dev`, EXPOSE 8080), `.dockerignore`, `render.yaml` (blueprint: build/start commands, `/api/health` health check, free plan, generated `SESSION_SECRET`), `.env.production.example` (full prod env checklist), `.gitignore` additions (`dist-server/`, keep `!.env.production.example`).
- **Docs correction:** `IDENTITY_NAMESPACE` is the identity-space label (default `chog-mainnet`, `^[a-z0-9-]{1,64}$`, no dots) — NOT the SIWE domain; the SIWE message domain is the host of `APP_ORIGIN` automatically.

### Production-bundle verification (local, port 8090)
- `node dist-server/main.js` with prod env: health 200 (`chainId:143`, “Chog Genesis”, live block), `GET /` and `GET /chog/1425` both serve the SPA, hashed assets get immutable cache headers, unsigned `POST /api/play` → **401**, path traversal serves the SPA instead of leaking files.

### Practice-flow timeout — root-caused and fixed
- Not a hang: the critical practice test alone finishes in **8.5 s** (after removing artificial latency); it only exceeded the 15 s timeout when run in parallel. Root cause = **resource contention** on this 4-logical-CPU / ~600 MB-free machine (Chrome + Docker VM + AV resident), not application logic.
- Fixes: `SAVE_LATENCY_MS`/setIntention delay now 0 in test mode (`import.meta.env.MODE === 'test'`, still 300 ms in dev/prod for pending-state UX), and `maxWorkers: 1` in `vite.config.ts` (with 15 s test/hook timeouts). `npm test` is green serially (~4.3 min wall under load).

### Real-browser verification — 27/27 PASS (`evidence/browser/`)
- Tooling: `playwright-core` in a temp dir driving **system Microsoft Edge** (headless, channel `msedge`) against the production bundle + live Monad RPC + Docker `chog_dev` on `127.0.0.1:8090`; mock EIP-1193 wallet signs with real noble secp256k1 (no keys, no network wallet).
- Checks (27): practice start→choice→save→receipt→chronicle→simulated inheritance→quota carryover→reload persistence; live profile owner/“CHOG #917”/IPFS image/refresh; connect-without-signin read-only; SIWE sign-in + **message domain matches deployed host** + session cookie authenticated; non-owner profile and play page honestly read-only; account switch forces re-auth; logout revokes session server-side; wrong chain → “This wallet can’t sign in here.”; connect rejection stays read-only; 0 px horizontal overflow on 390×844 (entry/practice/real profile); Tab/Enter keyboard path; API-down → honest unavailable state; practice works with API blocked. Screenshots + `results.json` in `evidence/browser/`.
- **App bugs found by the browser run and fixed:** (1) `AuthContext.signIn` skipped the chain check when `/api/health` had not resolved yet — a fast sign-in could succeed on the wrong chain; now it fetches health on demand and **fails closed** (blocks sign-in if the app network or the wallet's chain cannot be determined). (2) Mobile 29 px overflow: chronicle/address text and a nested `.page` section (`RealPages.SessionSection`) — fixed with `overflow-wrap` + flattening; entry/practice/real profile now measure 0 px overflow.
- Harness fixes: init scripts must be passed as `addInitScript(fn, arg)` (Playwright serializes closures — page-side captures of Node vars break silently); signed-in wait must target the `Log out` button (`/Signed in/i` also matches “Not signed in”).

### Deliverables
- `DEPLOYMENT.md` — exact Render + Neon manual steps, env table, post-deploy checks, cold-start/uptime notes, HF fallback.
- `REAL_HOLDER_CHECK.md` — consented holder walkthrough with pass criteria and safety rules (never asks for keys; signing is a free message).
- Evidence labeling matrix added to `INTEGRATION_EVIDENCE.md` §10 (A stub-RPC HTTP tests / B local contract-transfer tests / C live mainnet reads / D holder saves).

### Verification (this session)
- `npm run typecheck` — clean; `npm run build` (typecheck + vite + esbuild server) — clean.
- `npm test` — **136/136** (serial workers after the timeout fix); `npm run test:db` — **46/46**, zero skips.
- `signin-flow.test.tsx` re-run after the fail-closed chain fix: 6/6.
- Production bundle served on 8090 → browser suite **27/27**, then evidence written.
- Auth chain-check behavior now fails closed in three places: unknown app network → blocked with notice; unreadable wallet chain → blocked; wrong chain → blocked before any nonce request (unit test asserts `nonce=0`, `verify=0`, no `personal_sign`).

## Completed in Session 3 — Milestone 3

### Auth core (server)
- `src/shared/siwe.ts` — EIP-4361 message build/parse (domain/uri/chainId/address/nonce/issuedAt/expirationTime) and personal-message hashing shared by server and tests.
- `server/auth/crypto.ts` — noble secp256k1: keccak-256, personal-message hash (EIP-191), `recoverSigner` supporting 65-byte and EIP-2098 compact signatures, `addressFromPublicKey`, `hashSecret` (HMAC-SHA256), `randomHex`.
- `server/auth/siwe.ts` — nonce issue/consume: 5-minute TTL, single-use via atomic `UPDATE … RETURNING`, wallet/domain/URI/chain binding; tampered/expired/replayed/foreign nonces all rejected with `SIGN_IN_REQUIRED`.
- `server/auth/session.ts` — sessions stored **hashed** (HMAC of the random token under `SESSION_SECRET`); 24h TTL; create/resolve/revoke; `Set-Cookie` helpers (`HttpOnly; SameSite=Lax; Path=/; Max-Age`, `Secure` on https origins; logout emits `Max-Age=0`).
- `server/config.ts` — `SESSION_SECRET` (≥16 chars; required in production; random per-process fallback with warning in dev), `SESSION_TTL_MS`, `NONCE_TTL_MS`, `IDENTITY_NAMESPACE` (domain binding, validated).

### API surface
- `server/api/handlers.ts` — auth routes `POST /api/auth/nonce`, `POST /api/auth/verify`, `GET /api/auth/session`, `POST /api/auth/logout`; middleware order on every mutation: session cookie → origin/CSRF check → pinned identity → fresh `ownerOf` authorization → ownership sync (activation-required `INVALID_INPUT` when the character does not exist yet; epoch bump on controller change) → re-verify → service. `withAuthRetry` retries once on `CHAIN_UNAVAILABLE` only. `commitActionTx` `onLocked` re-verifies ownership.
- `server/main.ts` — CORS + JSON body, then per-IP token buckets (30/min `/api/auth/*`, 10/min `/api/profile/refresh`, 240/min default), `Set-Cookie` passthrough, real port from `server.address()` (supports `API_PORT=0`).
- Error→status map unchanged from Milestone 2; no new error codes introduced. Unsigned/invalid-session/bad-origin → `401 SIGN_IN_REQUIRED` or `400 INVALID_INPUT` per the FRD §9 table.

### Frontend
- `src/wallet/ethereum.ts` — injected provider with **allowlisted** methods only (`eth_requestAccounts`, `personal_sign`, `eth_chainId`); no approvals/transactions ever.
- `src/auth/` — `authApi.ts` (nonce/verify/session/logout), `AuthContext.tsx` (mount-time session restore, connect/sign-in/reject/switch/cancel/logout state machine), `sessionHandlers.ts` (shared handlers reused by Entry and Play surfaces).
- `src/real/useRealGame.ts` + `src/real/RealPages.tsx` — real play flow: sign-in gate → non-owner honest block → activation → takeover card on owner change (identity preserved, quota/stats/history kept, version bumps) → daily quota panel → inheritance/encounter/outcome views → 30s + focus ownership polling (quiet refresh). Conflict codes (`STATE_CHANGED`, `CHOICE_UNAVAILABLE`, `DAILY_LIMIT`) show with fresh state; duplicate idempotency retry returns the original receipt.
- `src/app/EntryPage.tsx` — connects wallet from the entry page; wrong chain → “This wallet can't sign in here.”; account switch prompts re-auth; practice untouched.

### Verification (this session)
- `npm run typecheck` — clean; `npm run build` — clean.
- `npm test` — **136/136** across 8 files: prior suites plus `tests/auth.test.ts` (15: SIWE roundtrip/rejects, origin allowlist, keccak/personal vectors, 65B + EIP-2098 recovery, malformed inputs, cookie helpers), `tests/signin-flow.test.tsx` (6: full browser connect/sign/reject/switch/logout with a mock `window.ethereum` and real noble signatures — allowlisted methods only, zero storage writes, SIWE message assertions), and expanded `tests/api-auth.test.ts` (32: session/nonce/replay/expiry/tamper/wrong-chain/origin/CSRF maps plus auth-rate-limit behavior).
- `npm run test:db` — **46/46** on real Postgres, **zero skips** (destructive-guard blocks converted to always-run synthetic `gateDb` assertions): `tests/db/auth.test.ts` (8: nonce issue/consume/replay/tamper/expiry/concurrent single-winner, session lifecycle and per-secret hashing), `tests/db/transfer-flow.test.ts` (8: full production path — SIWE sign-in, activation, action, refresh, signed `transferFrom` replayed through the real chain adapter via an in-process JSON-RPC mock, old owner rejected `NOT_CURRENT_OWNER`, new owner inherits identity/stats/quota with a version bump, chronicle shows transfer before mint), `tests/db/server-smoke.test.ts` (4: `startServer` on an ephemeral port with real Postgres + stub RPC — health, error envelopes, CORS preflight, and the complete HTTP sign-in → activation → play → idempotent action → logout flow with cookie assertions).
- Live smoke (Docker Postgres `chog_dev` + live Monad RPC `rpc.monad.xyz`, API restarted on port **8420** with the new code): health reports `chainId: 143` + “Chog Genesis”; `GET /api/profile?tokenId=1425` → real owner + “CHOG #917”; unsigned `play` → `401 SIGN_IN_REQUIRED`; nonce without `Origin` → `400`; EIP-4361 message shows `Chain ID: 143`; verify sets HttpOnly/SameSite=Lax cookie; replay → 401; session resolves; activation as non-owner → **`403 NOT_CURRENT_OWNER` from a fresh mainnet `ownerOf`**; logout revokes. All 10 checks passed.

## Completed earlier — Session 2 (Milestone 2)

### Database
- `db/migrations/0001_init.sql` — full schema (characters, controllers, ownership_epochs, daily_budgets, encounter_instances, game_events, intentions, chain identities/ownership observations/metadata/history cache/transfer logs, auth_nonces, sessions), applied by a runner that records per-file checksums in `schema_migrations` inside a transaction.
- `npm run db:migrate` via `tsx server/db/migrate-cli.ts`; local Docker Postgres (`chog-legacy-pg`, postgres:17) hosts `chog_dev` and `chog_test`.
- DB test suite is real-Postgres only (never mocked): reads `DATABASE_URL_TEST`, reports **BLOCKED** (skipped with a message) when unset, and a guard refuses any URL whose database name does not match `/test/i` so destructive tests can never touch dev data.

### Server stack (`server/`)
- `config.ts` — small `.env` parser + typed config (chain 143, contract, history start block, rate limits, app origin; API port default **8420**).
- `chain/` — ABI encoders/decoders over raw `eth_call` (no viem), JSON-RPC adapter with bounded `eth_getLogs` paging (100-block cap), and a metadata resolver (pinata-first gateway fallback, data-URI support, 256 KB cap) for `ipfs://` token URIs.
- `game/service.ts` — transactional service: row locks (`FOR UPDATE`), ownership sync + stale-downgrade rules, day materialization (deterministic per identity+UTC date), idempotency by request hash, optimistic version checks, eligibility, stat clamping, quota increment, and an injected `failAfterApply` hook proving full rollback after the first write. `getPlayState` runs in the same transactional path because it is only reachable from `POST /api/play`.
- `game/profile.ts` — read model for `GET /api/profile` (never mutates) plus `refreshProfile` (fresh `ownerOf` → upsert → `tokenURI`/metadata upsert → bounded history page advance of at most 100 blocks, `ON CONFLICT DO NOTHING`), with stale-downgrade display freshness (10 min) and clamped int4-safe cursors.
- `api/handlers.ts` — routes `GET /api/health|profile|chronicle`, `POST /api/profile/refresh|activation|intention|play|action`; input validation (tokenId `/^\d{1,10}$/`, namespace, contract address, enums); fresh-owner verification; and the FRD §9 error → HTTP status map returning the `{error:{code,message}}` envelope.
- `api/ratelimit.ts` — per-IP token buckets with injectable clock; `main.ts` boots CORS (app origin + localhost), a 64 KB JSON body limit, separate limiters for read vs. mutation routes, and runs migrations on start.

### Auth gate (fail-closed, no bypass)
- `requireSession()` **always throws `SIGN_IN_REQUIRED` (HTTP 401)** — typed `void` (not `never`) because TypeScript disables narrowing after `never` calls. Every real gameplay mutation (`/api/action`, `/api/activation`, `/api/intention`, `/api/play`) returns 401 until SIWE lands in Milestone 3. There is no temporary production bypass; read paths (`health`, `profile`, `profile/refresh`, `chronicle`) stay open and read-only.

### Frontend wiring
- `src/real/realApi.ts` — `lookupRealToken`/`refreshRealToken` against `/api/profile` and `/api/profile/refresh`; network failure surfaces `STORAGE_UNAVAILABLE` with an actionable detail message.
- `src/real/RealPages.tsx` — real profile page rendering chain facts (owner, verification block, observed-at), metadata (name/image via IPFS gateway, trait chips, metadata source link), story state (or an honest “no chapter yet” that never mutates), chronicle merged from game + provenance events, history-sync coverage text, and a Refresh button with pending state + failure notice that never drops observed data. `/chog/:tokenId/play` stays honestly blocked until Milestone 3.
- `ErrorNotice` gained an optional `detail` prop so server messages (e.g. refresh failures) reach the user.
- Vite dev proxy `/api` → `http://127.0.0.1:8420`.

### Verification (this session)
- `npm run typecheck` — clean.
- `npm test` — **92/92** across 6 files: the 66 Session-1 tests plus `tests/api-auth.test.ts` (9: health, profile read-only GET, refresh writes, 401 SIGN_IN_REQUIRED on every mutation, error→status map, malformed input → 400), `tests/chain.test.ts` (14: ABI round-trips, 100-block cap, metadata gateways/failure → fail closed), `tests/real-profile.test.tsx` (3: profile render from a mocked API without mutation, refresh POST + pending state, refresh failure notice keeps observed data).
- `npm run test:db` — **24 passed + 2 correctly skipped (BLOCKED)** on real Postgres: concurrency race, idempotent retry, parallel same-key once, quota + midnight reset, stale version, rollback-after-apply, ownership transfer, intention immutability, locked choice, namespace isolation, unknown instance, profile read/refresh/history bounds, and the destructive-guard suite.
- `npm run build` (typecheck + vite) — clean.
- Live smoke (Docker Postgres + live Monad RPC), all through both `http://127.0.0.1:8420` and the Vite proxy at `http://localhost:5173`:
  - `GET /api/health` → `{"ok":true,"db":true,"chain":{"ok":true,"blockNumber":113663943},"contractName":"Chog Genesis"}`.
  - `GET /api/profile?tokenId=1425` → real owner `0x6016…2b88`, metadata “CHOG #917” with 11 traits, 1 provenance (mint @101,997,010), `historySync: partial`, `game: null` — and zero writes.
  - `POST /api/profile/refresh` → fresh `ownerOf`/`tokenURI`, history cursor advanced a bounded page.
  - `POST /api/action` and `POST /api/activation` → **401 `SIGN_IN_REQUIRED`** (direct and proxied); malformed JSON → 400 `INVALID_INPUT`.
- **Port note:** the planned API port 8787 is unusable on this machine (Windows Hyper-V excludes 8715–8814); the API runs on **8420** everywhere (config default, `.env`, `.env.example`, vite proxy).

## Completed this session

### Runnable application
- Vite + React 19 + TypeScript 7-era toolchain (pinned: vite 8, typescript 5.9, vitest 5, react-router-dom 7), CSS Modules, no Tailwind, $0 core, no AI keys.
- Routes: `/` entry · `/chog/:tokenId` real profile (fails closed, honest unavailable states) · `/chog/:tokenId/play` explicit mainnet-play block · `/practice` full practice experience · `/dev/gallery` fixture state gallery (dev builds only; verified absent from the production bundle).

### Shared deterministic rules engine (`src/shared/rules/`)
- `RULESET_VERSION = 'legacy-v1'`; trust −100…100, notoriety 0…100, supplies 0…10; initial 0/0/3.
- Derived title precedence exactly per FRD §3 (Feared → Trusted → Notorious → Unwritten).
- All six authored encounters with the canonical FRD effect table (18 choices, authored story text + outcome prose; an AI cannot alter the table).
- Eligibility with server-style lock reasons; previews show the actual clamped result.
- Daily selection: FNV-1a 32-bit hash of `rulesetVersion|canonicalIdentity|UTCDate` → start index → three consecutive templates modulo six; every template has an always-available fallback.

### Game service (`src/server/`)
- `GameService` implements the FRD commit semantics in one atomic (clone-apply-persist) transaction: fresh controller authorization, idempotency (same key → same receipt, different payload → `INVALID_INPUT`), optimistic version check (`STATE_CHANGED`), day/instance/quota/eligibility checks, stat clamping, event append, quota increment, version bump.
- Ownership epochs: `syncOwnership` closes the old epoch, opens the new one, appends an ownership-observed event, preserves stats/events/supplies/quota/assigned encounters (OWN-01/02/04/05 honored at the service level).
- Intention once per epoch, no stat/quota effect (OWN-03); skip path never consumes the choice.
- Daily budget + lazily assigned, persisted encounter instances per UTC date; midnight invalidates unresolved instances and allocates the new day once.
- Error codes from the FRD §9 table via `AppError`.

### Practice experience (`src/practice/`, `src/server/storage.ts`)
- Seeded feared villain (trust −35, notoriety 70, supplies 3) under “Controller A — simulated” with four labeled fixture chronicle entries whose before/after states chain numerically to the seed (no invented gaps).
- Loop: entry → practice profile → encounter → confirm (awaited simulated save + receipt) → outcome → next encounter → simulated controller change → inheritance summary (stats/title/last three/prior chapters/remaining actions unchanged) → optional intention (awaited; “Decide later” leaves it unset and reopenable from the profile) → continue playing as Controller B.
- Simulated handoff alternates A ↔ B; it is the only transfer control and exists only in practice.
- Reset restores the seed after an explicit confirm.
- Persistence: `localStorage` key `chog-legacy:practice:v1`, separate namespace `practice-local|practice-ashen-v1`; survives refresh; isolated from any real/mainnet identity by construction.
- Every practice surface is labeled simulated/fixture; practice chronicle explicitly states it is not on-chain.

### UI integration fixes (supplied design preserved)
1. Real gameplay blocked when ownership is stale or unavailable (`ProfileView` gates the play button on fresh ownership; `/chog/:tokenId/play` honestly blocks; real lookup fails closed with `CHAIN_UNAVAILABLE` and invents nothing).
2. `EncounterView` clears a selected choice when the instance changes or the choice becomes ineligible; submit guards on eligibility.
3. `Inheritance` awaits the intention save before continuing; failure shows an error with retry; “Decide later” makes no save and keeps the once-per-epoch choice available.
4. `Chronicle` now has working filter (all/story/chain/ownership/intention), pagination (5/page with page counter and disabled edges), and mode-aware coverage text; loading/error states exist on lookup and saves; `SaveState` pending/saved/conflict/failed wired to real outcomes.

### Verification — Session 1
- `npx tsc --noEmit` — clean.
- `npx vitest run` — **66/66 tests pass** across `tests/rules.test.ts` (bounds, title precedence, full FRD eligibility + effect tables, villain vs neutral access, fallback, daily-selection determinism), `tests/service.test.ts` (atomic commit, version conflicts, eligibility rejection, quota incl. no refill on transfer, idempotency, midnight boundary, inheritance preserving state/quota/instances, old-controller rejection, intention rules, neutral-chog lockout path, localStorage round-trip, reset, namespace separation), `tests/practice-flow.test.tsx` (jsdom browser flow: entry→practice→choice→outcome→handoff→inheritance→continue; chronicle filter; reset with confirm; refresh persistence; real lookup fails closed).
- `npm run build` (typecheck + vite build) — clean; production bundle contains zero fixture-gallery code.
- Dev server smoke: `http://localhost:5173/practice` serves HTTP 200.

### Gate 0 (see `INTEGRATION_EVIDENCE.md` at repo root)
- Hackathon rules verified live: weights match the spec, NFT-essentiality gate, demo ≤3 min, submissions close **23 Oct 15:00 UTC**.
- Monad mainnet (chain 143) + `rpc.monad.xyz` verified; candidate contract live as ERC-721 “Chog Genesis”/CHOG/1969; `ownerOf` and `tokenURI` succeed for tokens 1425 and 476; metadata (name/image/traits) retrieved via IPFS gateway; mint log for token 1425 retrieved at block 101,997,010.
- Hard limit recorded: free RPC `eth_getLogs` is capped at **100-block ranges**.

## Blockers and risks (honest status)

| Item | Status | Impact |
| --- | --- | --- |
| Hackathon registration closed 11 Oct 13:00 UTC | **RESOLVED** — account shows “Hello, Onyx” + APPLIED | Confirm final submission access on the portal before release day |
| Official page pinning the NFT contract address | Partial (brand + on-chain metadata corroborate; no official address listing found yet) | Needed for release evidence |
| Free RPC `eth_getLogs` 100-block cap | Verified; handled — history sync advances ≤100 blocks per refresh | Satisfied |
| IPFS public gateway flakiness (429s) | Verified; handled — pinata-first multi-gateway fallback + cache | Satisfied |
| Backend (DB, API, chain adapter) | **Done (Milestone 2)** | — |
| Wallet sign-in (SIWE) + real sessions | **Done (Milestone 3)** — nonce/session lifecycle, origin protection, fresh-owner gate on every mutation | Real-holder walkthrough evidence is Milestone 4 |
| Local ownership-transition integration | **Done (Milestone 3)** — production service + signed `transferFrom` against a local JSON-RPC mock with real Postgres (see `tests/db/transfer-flow.test.ts`); old owner rejected, new owner inherits | Anvil not used (not installed on this machine); the in-process mock replays real secp-signed transactions through the same chain adapter |
| Consenting real holder | Not yet arranged — `REAL_HOLDER_CHECK.md` ready | The only remaining Milestone 4 item; evidence §10(D) stays UNVERIFIED until done |
| Free hosting/DB eligibility | **Done (Milestone 4)** — Render Free + Neon Free verified against official docs; full config in repo (`render.yaml`, `Dockerfile`, `.env.production.example`); manual steps in `DEPLOYMENT.md` | Actual deploy needs the user's GitHub/Render/Neon accounts (no CLIs on this machine) |
| Real-browser verification | **Done (Milestone 4)** — 27/27 checks vs. live mainnet + prod bundle (`evidence/browser/`) | — |
| Practice-flow timeout | **Done (Milestone 4)** — root cause was CPU/RAM contention, not a hang; serial workers + test-mode latency removal; `npm test` 136/136 green | — |
| Project submission readiness | **Not yet** — story consequences + inherited obligations queued; holder walkthrough pending | Do not mark submission-ready |

## Follow-up scope (recorded, not built — per discussion, unspecified)

- **Connected story consequences:** later encounters referencing earlier chapters in branching narrative text (framing only; must not change the deterministic effect table without a versioned ruleset bump).
- **Inherited unfinished obligations:** carrying pending unresolved *story* obligations (not just daily instances) across ownership epochs, e.g. a promise made by a previous owner that surfaces for the new controller. Needs FRD/PRD additions, UI states and tests before implementation.
- Multi-Chog wallet picker (needs NFT enumeration, not in MVP).
- Dedicated intention screen beyond the inheritance/profile affordance; chronicle “intention” quick-filter chip is present but the UI package’s open questions remain noted in `ui-design/INTEGRATION.md`.
- Optional P2 narration (deterministic fallback only, never authoritative).

## Next milestone (session 5)

Remaining Milestone 4 tail: (1) the user deploys via `DEPLOYMENT.md` (GitHub + Render + Neon accounts — manual, ~30 min) and confirms `/api/health` on the public URL; (2) run `REAL_HOLDER_CHECK.md` with a consenting holder and flip `INTEGRATION_EVIDENCE.md` §10(D) to VERIFIED. Then return to the queued gameplay scope: **connected story consequences** and **inherited unfinished obligations** (both need FRD/PRD additions, UI states and tests first), followed by demo video + submission packaging (deadline 23 Oct 15:00 UTC). Acceptance for this milestone: deployed URL, 27/27 recorded browser checks, holder walkthrough results; mainnet inheritance stays simulated in practice/local tests unless a voluntary real transfer independently happens — stated explicitly.

## Decision log additions

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-15 | Practice persistence via `localStorage` under a dedicated key/namespace | FRD DEMO-02 explicitly allows browser/session-isolated practice state; server DB is for canonical/mainnet state (Milestone 2) |
| 2026-10-15 | Practice seed history = origin marker + 3 fixture chapters ending exactly at −35/70/3 | Keeps the required seed state while making every recorded delta numerically consistent and honestly labeled |
| 2026-10-15 | Real-mode routes fail closed with `CHAIN_UNAVAILABLE` until the server chain adapter exists | UI must never invent owners/traits; no decorative success stubs |
| 2026-10-15 | FNV-1a 32-bit as the legacy-v1 daily hash | Deterministic across environments without async crypto; documented as part of ruleset v1 |
| 2026-10-15 | API port **8420** (not 8787) | Windows Hyper-V excludes ports 8715–8814 on this machine; 8787 can never bind |
| 2026-10-15 | All real gameplay mutations return 401 SIGN_IN_REQUIRED via `requireSession(): void` | No temporary production auth bypasses; SIWE lands whole in Milestone 3 (`void` not `never` because TS disables narrowing after `never` calls) |
| 2026-10-15 | `GET /api/profile` is read-only; only `POST /api/profile/refresh` writes observations | Public lookup must never create or advance gameplay state |
| 2026-10-15 | DB tests require real Postgres + `/test/i` database-name guard | Never mock the DB; destructive tests must be unable to touch non-test databases |
| 2026-10-15 | History provenance sync advances ≤100 blocks per refresh, cursored | Free RPC `eth_getLogs` hard cap; bounded work per request |
| 2026-10-15 | Practice stays browser-local (`chog-legacy:practice:v1`) | Keeps mock data isolated from canonical/mainnet state by construction |
| 2026-10-15 | SIWE nonces are single-use, 5-minute, bound to wallet/domain/URI/chain, consumed by atomic `UPDATE … RETURNING` | AUTH-01; concurrent verification has exactly one winner; replay is impossible |
| 2026-10-15 | Sessions stored as HMAC hashes under `SESSION_SECRET`; HttpOnly SameSite=Lax cookie, 24h; never localStorage | AUTH-02; DB leak does not yield usable session tokens; account switch forces re-auth |
| 2026-10-15 | Wallet access limited to `eth_requestAccounts`, `personal_sign`, `eth_chainId` | AUTH-03; no approvals/transactions can ever be requested |
| 2026-10-15 | Mutation order: session → origin → pinned identity → fresh `ownerOf` → ownership sync → re-verify → service; retry once on `CHAIN_UNAVAILABLE` only | AUTH-04; client flags ignored; the 5s re-read window is honored after state changes; no retry storms on logical errors |
| 2026-10-15 | Anvil not used for the Milestone-3 transfer test; an in-process JSON-RPC mock replays real secp-signed transactions through the production chain adapter against real Postgres | Anvil unavailable on this machine; same auth/action path as production, only the chain source differs (per the milestone’s “same path, only contract/RPC differs” rule) |
| 2026-10-15 | Ownership sync bumps `version` even without a game action | The takeover changes canonical state (controller, epoch); stale clients must see `STATE_CHANGED` |
| 2026-10-16 | Hosting = Render Free Web Service + Neon Free Postgres, same origin | Only free pair verified in official docs with TLS + long-lived Postgres (Render free DB expires in 30 days; Neon scales to zero) |
| 2026-10-16 | `APP_ORIGIN` is the SIWE domain; `IDENTITY_NAMESPACE` is only the identity-space label | Prevents misconfiguring the sign-in message domain; message domain = host of `APP_ORIGIN` automatically |
| 2026-10-16 | Server serves the built SPA itself (static + SPA fallback + traversal guard) | One service, one origin on the free tier — no separate static host, no CORS setup |
| 2026-10-16 | `apiPort` falls back to `PORT`; `HOST=0.0.0.0` + `TRUST_PROXY=true` in prod | Render injects `PORT` and terminates TLS behind a proxy; rate limits must key on `x-forwarded-for` there |
| 2026-10-16 | `signIn` fails closed: fetch health on demand, block when app network or wallet chain is unknown/mismatched | Browser verification found a race — clicking sign-in before `/api/health` resolved skipped the wrong-chain check entirely |
| 2026-10-16 | Vitest `maxWorkers: 1` + 15 s timeouts; practice save latency 0 in test mode | Timeout root cause was 4-CPU/low-RAM contention (critical test alone = 8.5 s), not a hang; dev/prod keeps the 300 ms pending UX |
| 2026-10-16 | Deployment is documented-manual (no CI deploy) | No provider CLIs/credentials on the build machine; `render.yaml` + `DEPLOYMENT.md` make the dashboard path deterministic |
