# Chog Legacy — Gate 0 integration evidence

Version 4.0 · 16 October 2026 · Sessions 1–4 · Probed live from the build machine

Evidence below was captured with direct JSON-RPC calls to `https://rpc.monad.xyz` and live page fetches. Nothing here is inferred from memory; every claim lists how it was checked. Status vocabulary: **verified** (probe succeeded with recorded output), **partial** (works with documented limits), **pending** (not probed yet), **blocker** (needs a human or later milestone).

## 1. Official hackathon rules and deadlines — VERIFIED (with one blocker)

Source: https://chogathon.chog.xyz/ fetched 15 October 2026.

| Fact | Verified value |
| --- | --- |
| Event | Chogathon 2026 (Chogtober 2026) |
| Prize pool | $15K planned, 50 winners; fine print allows reduction to $10K if quality threshold not met |
| Judging weights | Novelty 30% · Fun 20% · Retention 20% · Clarity 15% · Execution 15% · $CHOG bonus (matches the rubric supplied in the spec pack) |
| Qualification gate | “The Chog NFT must be essential” — judges score NFT essentiality as a gate before weighted scoring |
| Registrations | Closed 11 October 2026, 13:00 UTC |
| Submissions | Close 23 October 2026, 15:00 UTC |
| Demo video | ≤ 3 minutes, YouTube (unlisted) or Google Drive (viewer link) |
| Deliverables | Project name/team, what you built, why Chog matters, working demo + video + testing instructions, repo/stack, what’s next |

**RESOLVED (15 October, Session 2):** the account that will submit now shows “Hello, Onyx” and **APPLIED** on https://chogathon.chog.xyz/ — a registration exists for this account. Re-confirm portal submission access (not just the applied banner) before the 23 October deadline. This does not stop development.

Practice-mode acceptability: not stated explicitly on the public rules page. The NFT-essentiality gate implies the *submitted mainnet experience* must require the Chog NFT; the practice scenario is an onboarding supplement, not the core loop. Keep practice clearly labeled and keep real-holder play as the essential path. Re-check the rules page (and any organizer communication) before submission.

## 2. Official Chog source ↔ candidate NFT collection — PARTIAL

- Official brand site https://chog.xyz/ verified live: “Chog | Mascot of Monad”, X `@ChogNFT`, Discord invite, © 2026 Chog. The site lists the **$CHOG fungible token** contract `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777` — this is **not** the NFT collection and must never be used as the character identity contract.
- Candidate Chog Genesis ERC-721 `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763` self-identifies on-chain: `name()` = “Chog Genesis”, `symbol()` = “CHOG”, `totalSupply()` = 1969. Token metadata description reads “CHOG — a 1969-piece collection on Monad.”, matching the official brand and collection size.
- **Pending:** a page on an official Chog property (chog.xyz, portal.chog.xyz, docs, or official social) that states the NFT contract address verbatim. Search portal/docs before release; until then, treat collection linkage as strongly corroborated but not officially pinned.

## 3. Chain, contract and ownership reads — VERIFIED

Probe: JSON-RPC POST to `https://rpc.monad.xyz`, 15 October 2026.

| Check | Result |
| --- | --- |
| `eth_chainId` | `0x8f` = **143** (Monad mainnet) — matches official developer reference |
| `eth_blockNumber` | `0x6c61449` = 113,595,465 at first probe; 113,644,900 later the same session |
| Contract present at candidate address | Yes — multiple `eth_call`s succeeded |
| `name()` / `symbol()` / `totalSupply()` | “Chog Genesis” / “CHOG” / 1969 |
| `ownerOf(1425)` | `0x601634f3d0746b550e68439286c1ad022a5f2b88` |
| `ownerOf(476)` | `0x99891b613b6b5e64cd8a245372fdc858181f7cf0` |
| `tokenURI(1425)` | `ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/917.json` |

Standard ERC-721 reads work from the public free RPC with no API key. `ownerOf` is confirmed sufficient for fresh control verification.

## 4. Metadata — VERIFIED with gateway caveat

- `tokenURI(1425)` resolved through the Pinata gateway (`https://gateway.pinata.cloud/ipfs/…`) to:
  - `name`: “CHOG #917”
  - `description`: “CHOG — a 1969-piece collection on Monad.”
  - `image`: `ipfs://bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/917.webp`
  - `attributes`: present (e.g. Background “Light Purple”, more traits).
- Note the metadata file index (`917.json`) does not equal the token ID (1425); always trust `tokenURI`, never construct metadata paths from token IDs.
- **Caveat:** `ipfs.io`, `dweb.link` and `w3s.link` returned HTTP 429 with an IPFS service-worker-gateway notice during this session; `cloudflare-ipfs.com` failed to connect; Pinata succeeded. Server-side metadata resolution must try multiple vetted gateways, cache ~1 hour, and render unavailable states honestly.

## 5. Transfer logs / provenance — PARTIAL (hard RPC limit)

| Check | Result |
| --- | --- |
| `eth_getLogs` wide ranges (500/2 000/10 000 blocks) | Rejected: `eth_getLogs is limited to a 100 range` |
| `eth_getLogs` of 100-block window | Accepted (no logs in the recent quiet window sampled) |
| Known mint tx `0x73019596…c6d9` | Block **101,997,010**, `to` = candidate contract |
| Transfer log in that block | 1 mint: from `0x00…00` to `0x601634f3…b88`, tokenId **1425** — the mint recipient is still the current `ownerOf(1425)` |
| Known transfer tx `0x1e032422…6a0f` | Block **103,629,059** |

Implications: historical import must page in ≤100-block windows with persisted cursors and backoff. A full-collection scan is not feasible on the free RPC; a deployment-era start block (~101,997,010 for this collection) plus bounded pages, or a later indexer, is required. **Missing historical logs must never block gameplay** — fresh `ownerOf` remains the control authority, exactly as the FRD allows. App events must never carry fake transaction hashes.

## 6. Free hosting / database eligibility — VERIFIED (research, 16 October 2026, Session 4)

Sources fetched: `render.com/docs/free`, `neon.tech` plans docs, Hugging Face Docker Spaces docs (16 Oct 2026).

| Fact | Verified value |
| --- | --- |
| Render Free Web Service | 0.1 CPU / 512 MB, 750 h/month, custom domains with managed TLS, listens on `$PORT`; sleeps after ~15 min idle (~1 min cold start) |
| Render Free Postgres | **expires after 30 days** → rejected for this project |
| Neon Free Postgres | 1 GB storage, 100 CU-h/month, scale-to-zero after idle; pooled TLS endpoint |
| Hugging Face Docker Spaces | Free persistent container with public URL — recorded fallback (repo ships a `Dockerfile`) |
| Chosen stack | **Render Free + Neon Free, same origin** (`render.yaml`, `.env.production.example`, `DEPLOYMENT.md` in repo) |

**DEPLOY pending (human step):** no provider CLIs or credentials exist on the build machine (`vercel`/`netlify`/`flyctl`/`render`/`gh` all absent), so deployment is a documented manual path — `DEPLOYMENT.md` gives the exact dashboard steps, env table and post-deploy checks (`GET /api/health` must return `chainId:143` on the public URL). No paid resource is used or needed.

## 7. Consent holder verification — PENDING (human task)

A real holder is required for genuine gasless sign-in evidence (Milestone 4). No private keys are ever requested. Buying an NFT is not a fallback. The full walkthrough, pass criteria and safety rules are committed as **`REAL_HOLDER_CHECK.md`**; the evidence slot is §10(D) below and stays **UNVERIFIED** until a consenting holder completes it on the deployed URL.

## 8. Milestone 2 live API evidence — VERIFIED (15 October 2026, Session 2)

Local stack: Docker Postgres `chog-legacy-pg` (postgres:17, `chog_dev`/`chog_test`), API on `http://127.0.0.1:8420`, Vite dev proxy on `http://localhost:5173`, all against live Monad RPC `https://rpc.monad.xyz`. Port 8787 was unusable (Windows Hyper-V excludes 8715–8814), so the API runs on 8420.

| Check | Result |
| --- | --- |
| `GET /api/health` (direct and via Vite proxy) | `{"ok":true,"db":true,"chain":{"ok":true,"blockNumber":113663943},"contract":"0xc96d…73763","contractName":"Chog Genesis"}` |
| `GET /api/profile?tokenId=1425` | HTTP 200, **no writes**: `ownership.status=stale`, `owner=0x601634f3d0746b550e68439286c1ad022a5f2b88`, `metadata.name=CHOG #917`, 11 traits, `provenance` = 1 mint @ block 101,997,010, `historySync=partial`, `game=null` |
| `POST /api/profile/refresh` | Fresh `ownerOf` + `tokenURI` read, metadata/history upserted, history cursor advanced one bounded page (≤100 blocks) |
| `POST /api/action` (direct **and** proxied) | **401** `{"error":{"code":"SIGN_IN_REQUIRED","message":"Real gameplay requires a signed-in session. Wallet sign-in lands with SIWE authentication in Milestone 3."}}` |
| `POST /api/activation` (proxied) | **401** `SIGN_IN_REQUIRED` (same envelope) |
| Malformed JSON body | **400** `INVALID_INPUT` — “Body must be valid JSON” |
| Browser bundle | Real profile page renders only what the API returns; network failure shows `STORAGE_UNAVAILABLE` + “Could not reach the Chog API…” and invents nothing |

Automated coverage behind the same evidence: `npm test` **92/92** (6 files: rules, service, practice flow, API auth/gate, chain adapter, real profile page), `npm run test:db` **24 passed + 2 BLOCKED-skipped** against real Postgres (concurrency, idempotency, quota, rollback-after-apply, ownership transfer, read-only profile, destructive-guard), `npm run typecheck` and `npm run build` clean. No temporary auth bypass exists: every gameplay mutation fails closed until Milestone 3 SIWE.

## 9. Milestone 3 auth + live play evidence — VERIFIED (15 October 2026, Session 3)

Local stack: Docker Postgres `chog_dev`, API restarted on `http://127.0.0.1:8420` with the Milestone-3 build, live Monad RPC `https://rpc.monad.xyz`. Live checks executed via a throwaway TypeScript client (real noble signatures); nothing was fabricated and no secrets appear below.

| Check | Result |
| --- | --- |
| `GET /api/health` (new build) | `{"ok":true,"db":true,"chain":{"ok":true,"blockNumber":113709109},"contract":"0xc96d…73763","contractName":"Chog Genesis","chainId":143}` — `chainId` confirms the new binary |
| `GET /api/profile?tokenId=1425` | HTTP 200, real owner `0x601634f3d0746b550e68439286c1ad022a5f2b88`, metadata “CHOG #917” |
| `POST /api/play` without a session (with allowed `Origin`) | **401** `SIGN_IN_REQUIRED` |
| `POST /api/auth/nonce` without `Origin` | **400** `INVALID_INPUT` |
| `POST /api/auth/nonce` with allowed `Origin` + wallet | HTTP 200; EIP-4361 message includes `Chain ID: 143` and a fresh nonce |
| `POST /api/auth/verify` with a real secp256k1 signature | HTTP 200 `{authenticated:true}`; `Set-Cookie: chog_session=…; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400` |
| Same nonce + signature replayed | **401** `SIGN_IN_REQUIRED` (single-use consume verified live) |
| `GET /api/auth/session` with the cookie | HTTP 200 `{authenticated:true}` |
| `POST /api/activation` as a **non-owner** (token 1425, owned by `0x6016…2b88`) | **403** `NOT_CURRENT_OWNER` — a fresh mainnet `ownerOf` ran before the write path; no state was created |
| `POST /api/auth/logout` | HTTP 200 `{authenticated:false}`; `Set-Cookie … Max-Age=0` revokes the session |

Automated coverage behind the same evidence: `npm test` **136/136** (8 files — prior suites plus `tests/auth.test.ts` SIWE/crypto vectors, `tests/signin-flow.test.tsx` full browser sign-in against a mock injected provider with real signatures, and the expanded `tests/api-auth.test.ts` auth/error/origin/rate-limit map). `npm run test:db` **46/46** on real Postgres with **zero skips**: `tests/db/auth.test.ts` (nonce/session lifecycle incl. concurrent consume and tamper), `tests/db/transfer-flow.test.ts` (production service path — SIWE sign-in for wallets A and B, activation, action, refresh, then a **signed `transferFrom`** replayed through the real chain adapter via an in-process JSON-RPC mock; A is rejected `NOT_CURRENT_OWNER` on every mutation afterwards, B inherits the same character/stats/quota with a version bump, chronicle records transfer @51 before mint @10), and `tests/db/server-smoke.test.ts` (`startServer` on an ephemeral port: health, error envelopes, CORS preflight, full HTTP sign-in → activation → play → idempotent action → logout with cookie assertions). `npm run typecheck` and `npm run build` clean.

Honest boundaries: the transfer evidence is a **local JSON-RPC integration** (real signed transactions, real Postgres, production code path — no Anvil on this machine), not a mainnet transfer. Mainnet inheritance stays simulated in practice unless a voluntary real transfer independently happens. Real-holder end-to-end evidence is Milestone 4. Wallet inspection: the client sends only `eth_requestAccounts`, `personal_sign` and `eth_chainId` — no approvals or transactions.

## 10. Milestone 4 deployment-readiness + browser evidence — VERIFIED except holder saves (16 October 2026, Session 4)

### Evidence classes (read every claim with its class)

| Class | What it is | Status |
| --- | --- | --- |
| **(A) Stub-RPC HTTP tests** | `tests/db/server-smoke.test.ts` 4/4 — real HTTP server (`startServer`), real Postgres, in-process stub chain RPC: health, error envelopes, CORS preflight, full sign-in→activation→play→idempotent action→logout with cookie assertions | **VERIFIED** |
| **(B) Local contract-transfer tests** | `tests/db/transfer-flow.test.ts` 8/8 — production service path, real secp-signed `transferFrom` replayed through the real chain adapter via an in-process JSON-RPC mock against real Postgres | **VERIFIED (local chain, not mainnet)** |
| **(C) Live mainnet reads / non-owner checks** | Direct `https://rpc.monad.xyz` probes (§3–§5), the Session-3 live smoke (§9), and the Session-4 browser suite below — all reads, no writes | **VERIFIED** |
| **(D) Actual holder saves** | A consenting Chog holder signing in and saving a real choice on their own NFT via the deployed app (`REAL_HOLDER_CHECK.md`) | **UNVERIFIED — pending human walkthrough** |

### Production bundle + deployment readiness

| Check | Result |
| --- | --- |
| `npm run build` (typecheck + Vite client + esbuild `dist-server/main.js`) | clean |
| Prod server locally (`NODE_ENV=production`, port 8090, live RPC + Docker `chog_dev`) | `GET /api/health` 200 `chainId:143` “Chog Genesis”, live block |
| `GET /` and deep link `GET /chog/1425` | both serve the SPA (server-side static + fallback) |
| Hashed assets (`/assets/index-*.js`) | `cache-control: public,max-age=31536000,immutable`; HTML `no-store` |
| `POST /api/play` unsigned | **401 SIGN_IN_REQUIRED** from the bundled server |
| Path traversal (`/../server/config.ts` style) | serves SPA index — no file leak |
| Deployment config in repo | `render.yaml` (blueprint), `Dockerfile` + `.dockerignore`, `.env.production.example`, `DEPLOYMENT.md`; Render+Neon free tiers verified in §6 |
| Deploy status | **Not deployed yet** — manual steps require the owner's GitHub/Render/Neon accounts (no CLIs on this machine) |

### Real-browser verification — 27/27 PASS (Playwright + system Edge, headless)

Target: production bundle on `http://127.0.0.1:8090` with **live Monad RPC + live Postgres**; wallet mocked as an EIP-1193 provider that signs with real noble secp256k1 (no real keys, no extension). Screenshots + `results.json` in `evidence/browser/`.

- **Practice (6):** start → choice → save receipt → chronicle → simulated inheritance → quota carry-over (decision 2 of 3) → persists across reload.
- **Real profile (4):** live owner `0x6016…2b88` rendered, metadata “CHOG #917”, IPFS image loaded from Pinata gateway, refresh returns the same live owner.
- **Auth/ownership (8):** connect-without-sign-in stays read-only; SIWE sign-in succeeds; **sign-in message domain = deployed host** (`127.0.0.1:8090 wants you to sign in…`, `Chain ID: 143`); session cookie → `authenticated:true`; non-owner profile read-only (“does not own this Chog”); non-owner blocked on play page; account switch forces re-auth; logout revokes the session (server-side `authenticated:false`).
- **Wallet safety (2):** wrong chain (0x1) → “This wallet can’t sign in here.” with **zero** nonce/sign requests; connect rejection stays read-only with guidance.
- **Layout/a11y (5):** 0 px horizontal overflow at 390×844 on entry/practice/real profile; Tab reaches “Start practice”, Enter activates; API-down → honest unavailable state; practice works with the API blocked.

### Bugs the browser run found (all fixed before this entry)

1. **Wrong-chain race (app):** `signIn` skipped the chain check while `/api/health` was still in flight, so a fast click could sign in on the wrong chain. Now health is fetched on demand and sign-in **fails closed** on unknown app network / unreadable wallet chain / mismatch (unit test: no nonce, no verify, no `personal_sign`).
2. **Mobile overflow (app):** chronicle long-address text and a nested `.page` wrapper caused 29 px horizontal scroll at 390 px — fixed with `overflow-wrap` + flattening; re-measured 0 px.
3. **Test-mode latency:** practice saves carried an artificial 600 ms delay per test file — zeroed under `MODE=test`, kept in dev/prod.

### Practice-flow timeout — root cause recorded

The practice critical path alone runs in **8.5 s**; it only breached the 15 s timeout under parallel jsdom workers. Root cause: **CPU/RAM contention** on this 4-logical-CPU machine (~600 MB free with Chrome/Docker/AV resident) — not an application hang. Fix: `maxWorkers: 1` + 15 s test/hook timeouts (`vite.config.ts`); `npm test` **136/136** green serially.

### Automated suites behind this evidence

`npm test` **136/136** (incl. `signin-flow.test.tsx` 6/6 re-run after the fail-closed chain fix), `npm run test:db` **46/46** zero skips, `npm run typecheck` and `npm run build` clean.

## Explicit non-claims

- **Real holder saves remain UNVERIFIED (§10(D))** until `REAL_HOLDER_CHECK.md` is completed by a consenting holder on the deployed URL; the project is **not** marked submission-ready.
- No deployed URL exists yet — §6/§10 document readiness and the manual deploy path, not a live deployment.
- The browser suite ran against the production bundle on localhost with a **mocked wallet provider** (real signatures, no real keys) — it verifies the app's flows, not a hardware wallet or a holder's own environment.- No NFT approval, transfer, swap or any mainnet write has been or will be sent by this app.
- The practice scenario is not evidence of mainnet behavior; it is an isolated simulation.
- The 488-project claim from earlier research remains discarded.
- No metadata, owner or transaction was fabricated; every value above came from a live probe.
- No raw signatures, session cookies, private keys or secrets are stored in this file or the repo; the §9 live probe used an ephemeral throwaway key for a wallet that owns no Chog.
- The Milestone-3 ownership-transition test is local JSON-RPC integration through the production code path, not a mainnet transfer.
