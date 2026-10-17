# Chog Legacy

**The Chog keeps its past. You choose its next chapter.**

Chog Legacy is a compact daily story game built around an NFT character. Reputation (trust), notoriety and supplies follow the token: when the Chog changes hands, the next controller inherits its history, its reputation and any unfinished obligations. You make three decisions per UTC day, each one written into a permanent chronicle shown beside the character's real chain facts.

The whole game runs with **no wallet and no NFT** in practice mode, and the same rules engine drives real, owner-authorized play against a live mainnet character.

## Is an NFT required?

| Mode | NFT / wallet? | What it does |
| --- | --- | --- |
| **Practice** | **No** | Complete game loop against a fictional seeded Chog, isolated in your browser. No connection, no signing, no cost. |
| **Reading a real profile** | **No** | `/chog/:tokenId` shows live owner, metadata and chronicle for any token in the collection. |
| **Real play** | **Yes — the Chog NFT + a wallet** | Only the current on-chain owner can activate, choose and save. Sign-in is a free `personal_sign` SIWE message (never a transaction); every mutation re-reads `ownerOf` on-chain first. |

There are no transactions, approvals, tokens-for-sale or paid APIs anywhere in the app. Gameplay is gasless by construction; the NFT matters only as the thing ownership and inheritance refer to.

## Quick start

```bash
npm install
npm run dev          # client → http://localhost:5173
```

Open **http://localhost:5173/practice** for the complete loop, or `/` for the entry page. The app works without a backend — real lookups fail closed with an honest "unavailable" state.

To also serve real mainnet profiles and wallet sign-in (Postgres + live Monad RPC):

```bash
# one-time: local Postgres (dev database + test database)
docker run -d --name chog-legacy-pg -p 5432:5432 \
  -e POSTGRES_USER=chog -e POSTGRES_PASSWORD=chog_local_dev_only \
  -e POSTGRES_DB=chog_dev postgres:17-alpine
docker exec chog-legacy-pg createdb -U chog chog_test   # DB tests refuse names without "test"

cp .env.example .env    # placeholders/defaults for local development
npm run db:migrate      # applies db/migrations
npm run api             # API → http://127.0.0.1:8420 (Vite proxies /api there)
```

Then reload `http://localhost:5173` and choose **Sign in with wallet** (an injected browser wallet is required; the message binds to `localhost` in dev).

> The API listens on **8420** because port 8787 falls inside a Windows Hyper-V excluded range on some machines.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (proxies `/api` → `127.0.0.1:8420`) |
| `npm run api` | API server via `tsx` (migrations run on boot) |
| `npm run db:migrate` | Apply `db/migrations/*.sql` (recorded in `schema_migrations`, never re-applied) |
| `npm run typecheck` | `tsc --noEmit` over `src`, `server`, `tests` |
| `npm test` | Vitest unit + jsdom suite (rules, service, auth, API auth, browser flows) |
| `npm run test:db` | Real-Postgres suite (requires `DATABASE_URL_TEST` containing `test`; drops/recreates that schema) |
| `npm run build` | typecheck + client bundle (`dist/`) + server bundle (`dist-server/`) |
| `npm start` | Production server: serves the SPA and `/api` from one origin |
| `npm run preview` | Serve the built client only |

The fixture-state gallery is dev-only at `/dev/gallery`.

## Architecture

```
React 19 + TypeScript (Vite SPA)          Node API (esbuild bundle)
├─ src/app/        entry & layout         ├─ server/main.ts        boot: config → pool → migrations → listen
├─ src/practice/   practice controller    ├─ server/api/           REST handlers, origin + rate limits
├─ src/real/       real profile/play      ├─ server/auth/          SIWE, sessions, HttpOnly cookies
├─ src/ui/         Milkwood journal UI    ├─ server/game/          profile reads, owner-authorized mutations
├─ src/wallet/     EIP-1193 provider      ├─ server/chain/         Monad reads (ownerOf/tokenURI/logs)
└─ src/shared/     shared rules engine    └─ db/migrations/        0001_init, 0002_story_consequences
   └─ rules/       pure, deterministic — used by BOTH modes
```

- **One rules engine.** `src/shared/rules/` is pure and deterministic: stats bounds, titles, six authored story templates, eligibility gates, daily selection and the courier-debt story arc (obligations opened, recalled on a later UTC day, and resolved). Practice and the server both call it, so both modes play by identical rules.
- **Two state stores.** Practice state lives in `localStorage` (`chog-legacy:practice:v1`) under a separate identity namespace (`practice-local|…`); canonical mainnet state lives in Postgres and changes only through signed-in, owner-authorized mutations. The two can never mix.
- **One origin in production.** `npm start` serves `dist/` (SPA + hashed assets) and `/api` from the same process, so there is no CORS configuration at all. The public origin is a single `APP_ORIGIN` variable that also binds the SIWE message domain, the session cookie `Secure` flag and every write-origin check.
- **Migrations before traffic.** Boot order is config → pool → `runMigrations` → `listen`; each file runs in a transaction and is checksum-recorded, so existing databases are preserved.

### API surface

`GET /api/health` · `GET /api/profile` · `POST /api/profile/refresh` · `GET /api/chronicle` · `POST /api/auth/nonce` · `POST /api/auth/verify` · `GET /api/auth/session` · `POST /api/auth/logout` · `POST /api/activation` · `POST /api/intention` · `GET /api/play` · `POST /api/action`

Reads are public; every mutation returns 401 without a valid session and 403 for non-owners.

## Practice vs real play

| | Practice | Real play |
| --- | --- | --- |
| Wallet / NFT | none | required (current owner) |
| State | browser `localStorage`, resettable | Postgres, canonical |
| Identity | `practice-local` namespace, fictional | mainnet namespace + contract + tokenId |
| Controller change | one simulated "Simulate controller change" button | a genuine transfer outside the app; state surfaces on next sync |
| Labeling | every entry marked fixture/simulation | chain facts marked with block + freshness |
| Clock override | honored only in dev/test builds (never in a production bundle) | server UTC clock only |

Inheritance works the same in both: reputation, chronicle, remaining daily actions and open obligations carry over; only the current controller may resolve an obligation.

## Verification status

- `npm run typecheck` — clean. `npm test` — **144/144**. `npm run test:db` — **52/52**. `npm run build` — clean (client + server bundles).
- Production bundle checked in a real browser: **27/27 checks** against live Monad mainnet — practice loop, SIWE sign-in with a domain matching the deployed host, non-owner read-only states, account switch, server-side logout, wrong-chain rejection, mobile (390×844) with 0 px overflow, keyboard path, API-down honesty.
- Courier-debt story arc accepted end-to-end in a browser across three simulated UTC days: **29/29 checks** (journal → chapter → outcome → obligation → inheritance → recall → resolution → cleared).
- Production container verified against a pre-existing database: migration `0002` applies non-destructively **before** the listener starts, and origin enforcement returns 200 for `APP_ORIGIN` / 403 `ORIGIN_DENIED` for anything else.
- Saved practice data written before the story-consequences schema is normalized on load, so older sessions keep working (no blank practice page).
- **Real-holder verification is pending** — a consenting holder must sign in and save one real choice on their own NFT against the deployed URL; it is the one evidence class no automated test can produce.

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** — Render Free + Neon Free, zero-cost stack, with the environment checklist in `.env.production.example` (placeholders only; never commit `.env`). Migrations run on boot, so a deploy is: push → set `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN` → watch the log for `applied migrations` then `listening … (origin …)`.

## Known limitations

- Practice state is browser-local by design (isolated simulation, cleared with "Reset practice"); canonical state is Postgres only.
- Ownership is an observation, not a lock: a transfer between the server's fresh `ownerOf` read and a commit is a small, documented race. Ownership is re-verified after state changes and an incoming owner sees an inheritance takeover on the next sync.
- Gameplay history is app-saved fiction displayed next to chain facts — it does not become immutable because it sits beside them.
- If `SESSION_SECRET` is unset (dev only), a random per-process secret is used and sessions reset on API restart. Production refuses to boot without it.
- Render's free tier sleeps after ~15 min idle (≈1 min cold start); see DEPLOYMENT.md §5 for free keep-alive options.
- Real-holder save verification is still outstanding (above).

## Repository notes

- `public/art/ashen-storybook.png` is an original AI-generated illustration used **only** for the fictional practice character on the entry page — it never substitutes for real NFT metadata.
- The chain data is read-only against the public Monad RPC (`https://rpc.monad.xyz`, chain id `143`, contract `Chog Genesis`); no API keys are required or bundled.
- This repository currently ships without a `LICENSE` file.
