# Chog Legacy — technical architecture

> UI revision, 16 October 2026: `UI_DESIGN.md` and runtime `src/ui/` now define the Milkwood Journal presentation. The old `ui-design/` prototype is retired. This note changes no gameplay, permissions, API, or acceptance rules.

Version 1.0 · 9 October 2026 · No visual design prescribed

## 1. Proposed implementation

React + TypeScript with Vite; React Router; plain CSS/CSS Modules from the design AI. Use wagmi/viem for wallet integration and RPC reads. Pin mutually compatible stable package versions after checking their official documentation; no exact version is assumed here.

Use Node-compatible TypeScript serverless API handlers on an eligible free host and Supabase-managed Postgres on a free tier. Vercel is a candidate host, not a mandatory platform. Confirm applicable hosting terms/quotas before selecting it. No Docker requirement and no permanent worker required for MVP. Do not substitute MongoDB without translating transactional/uniqueness rules and updating this document.

Keep the project as one repository with frontend, API handlers, shared pure rules and SQL migrations. Server-only database credentials and optional model keys must never enter Vite-exposed environment variables. Database browser access is disabled for canonical writes; server API is the authority.

## 2. Boundaries

| Module | Responsibility |
| --- | --- |
| Frontend | Render supplied design, read API state, wallet sign-in, submit choices |
| Shared rules | Determine eligibility, stat effects, titles and encounter sequence |
| Server authentication | SIWE nonce verification, session cookies, origin checks |
| Chain adapter | Contract reads, validated metadata, bounded provenance import |
| Game service | Fresh owner checks, epoch sync, atomic actions and audit records |
| Postgres | Canonical state, immutable-by-application events, quotas and uniqueness |
| Practice adapter | Isolated fixtures using the same rules; no mainnet writes |
| Optional narration | Text enhancement only; never authoritative |

No frontend feature can assign itself owner status or submit raw game state to the server.

## 3. Chain adapters and environments

Common interface: `getOwner(tokenId)`, `getMetadata(tokenId)`, `getTransfers(tokenId, cursor)`, `getHealth()`. Provide `mainnet`, `localMock` and `practice` implementations. Testnet is optional; local mock is sufficient for transfer integration tests.

Candidate production configuration: chain ID 143, Chog contract `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763`, RPC `https://rpc.monad.xyz`. These must pass Gate 0 before being treated as production configuration. Contract ABI requires only verified ERC-721 reads and Transfer logs. No approvals or write ABI is exposed to the production client.

Use decimal token IDs as strings; addresses normalized and validated. Ownership reads are authoritative snapshots, not a perpetual guarantee. On mutation, check RPC health/latest block, read `ownerOf` at a recorded block, sync epoch, then commit. Record verification block/time on every action. Keep the read-to-commit interval short and reject/retry if it exceeds a configured five-second authorization window.

There is an unavoidable residual race if the NFT transfers between the chain read and database commit. The app cannot atomically lock the external ERC-721 and Postgres without an on-chain design. Document this limitation honestly. Refresh ownership before the next mutation; never claim absolute real-time guarantees. Delayed/disagreeing RPCs block writes. If a finalized-read capability is used, verify it on Monad instead of assuming Ethereum-specific tags work.

Free RPC log range limits vary. Begin with a single known token and bounded block pages from a verified deployment block; back off and persist cursors. Do not scan the entire chain/collection on page load. Current `ownerOf` is sufficient for control; historical-log import is supplementary.

## 4. Minimum schema

| Table | Key fields and invariants |
| --- | --- |
| `characters` | UUID; unique `(namespace, chain_id, contract, token_id)`; trust, notoriety, supplies, version, active_epoch_id; timestamps; bounds constraints |
| `ownership_epochs` | UUID, character_id, controller_wallet, observed_start/end, verification_block, intention; one active epoch per character |
| `game_events` | UUID, character_id, epoch_id, actor_wallet, sequence, type, template/choice, ruleset_version, before/after state, created_at, verification_block; unique sequence per character; no client update/delete |
| `daily_budgets` | Unique `(character_id, UTC_date)`; used integer 0…3 |
| `encounter_instances` | UUID, character_id, UTC_date, slot 0…2, template_id, ruleset_version, resolved_event_id; unique daily slot |
| `action_receipts` | Idempotency key scoped to character + wallet; request hash, committed response; unique key |
| `chain_events` | Character identity, block number/hash, tx hash, log index, from/to; unique chain + tx + log index; canonical/orphan flag |
| `metadata_cache` | Character identity, validated URI, parsed fields, retrieval time and errors |
| `history_sync` | Character identity, deployment/start block, cursor, latest verified block, completeness/status |
| `auth_nonces` | Hashed/random nonce reference, wallet/domain/URI/chain, expiry, consumed_at |
| `sessions` | Hashed random session token, wallet, expiry, revocation |

Distinguish ownership-observed events from chain transfer logs. Do not store a transfer observation as a synthetic historical transaction. Earlier ownership changes observed through provenance need not become gameplay epochs if those owners never played.

Use database migrations, foreign keys, range constraints and unique constraints. Database permissions prohibit browser writes. Server actions run through a transactional SQL function or a Postgres driver transaction with row locking; a sequence of independent Supabase HTTP insert/update calls is not an atomic transaction.

## 5. API contract

All dates use ISO UTC and token IDs remain strings. Responses include namespace and canonical identity. Validate payloads server-side with a schema library. Use the FRD error codes consistently.

| Endpoint | Access | Inputs/result |
| --- | --- | --- |
| `GET /api/chogs/:tokenId` | Public | Profile, metadata status, last observed owner, canonical game state or unstarted, history coverage; no game mutations |
| `POST /api/chogs/:tokenId/refresh` | Rate-limited public | Fresh chain observation and sync; no activation or daily action |
| `GET /api/chogs/:tokenId/chronicle` | Public | Cursor-paginated gameplay and provenance, separately labeled |
| `POST /api/auth/nonce` | Public, rate-limited | Wallet → bound nonce/message fields |
| `POST /api/auth/verify` | Public, rate-limited | Message + signature → session cookie |
| `GET /api/auth/session` | Session | Wallet/expiry only; no secret token returned |
| `POST /api/auth/logout` | Session | Revoke session |
| `POST /api/chogs/:tokenId/activate` | Fresh owner | Initialize neutral game or sync existing epoch; no reset |
| `POST /api/chogs/:tokenId/intention` | Fresh owner | Epoch ID + embrace/redeem; once per epoch |
| `GET /api/chogs/:tokenId/play` | Session; ownership status | Current encounter, server previews, state version, budget/reset; may assign instances for verified active owner |
| `POST /api/chogs/:tokenId/actions` | Fresh owner | Instance ID, choice ID, expected version, idempotency key → committed receipt |

Selection of another collection or namespace is not a client-controllable production input. Server config allowlists the eligible mainnet collection. Practice uses local/browser endpoints or dedicated isolated storage, not production character endpoints.

## 6. Action service sequence

1. Validate origin/CSRF, input and session.
2. Perform fresh chain health/owner read; record block/time and reject non-owner.
3. Begin database transaction and lock character; synchronize observed ownership epoch.
4. Check idempotency, state version, requested epoch/instance, current UTC date, daily budget and choice eligibility.
5. Compute resulting state with shared deterministic rules.
6. Append event; update character, budget and encounter; save receipt; commit.
7. Return canonical saved state. If ownership read becomes too old while waiting for the lock, rollback and retry the chain read once.

No model request or remote metadata fetch occurs inside the transaction. Optional prose can be generated afterward and cached separately. Late text must not overwrite the state/version.

## 7. Metadata and chain safety

Fetch tokenURI server-side using supported HTTPS/IPFS resolution only. Use vetted gateways, host validation, private-network blocking, safe redirect handling, timeouts, size caps and JSON schema checks. Never fetch arbitrary client-supplied URLs. Escape metadata and display plain text; no raw HTML or script-bearing SVG injection. Remote images need constrained handling and fallback behavior.

Cache metadata for roughly one hour with explicit retrieval time. Do not label metadata immutable unless verified. Import chain logs in bounded batches and reconcile recent block hashes for reorgs; mark orphaned chain events and recheck ownership. Observed gameplay history remains app history with its recorded verification block, not retroactively invented blockchain truth.

Do not require a paid indexer. Public RPC reads plus persistent pagination are the baseline. If logs are inaccessible, show partial/unavailable provenance while preserving verified current-owner gameplay.

## 8. Reliability, privacy and operating cost

No scheduled daily job is needed: budgets and encounters roll over lazily on verified play requests using server UTC. Avoid polling the whole collection. During a player session refresh ownership on focus, explicitly on request, and at a modest interval such as 30 seconds; each mutation still performs a fresh check.

Use connection pooling suitable for serverless runtime. Rate-limit anonymous reads, refresh, sign-in and mutation attempts; add backoff for RPC limits. Public profiles reveal only public NFT facts and gameplay deliberately attached to that Chog. Never store private keys, seed phrases or raw signatures in logs. Document that gameplay is public and persists when ownership changes.

Application events are append-only through app permissions, but operators/database loss can affect them. Free tiers are not a permanence guarantee. Provide a developer export/backup command and capture a database export before submission; do not expose an anonymous administration interface.

Candidate environment variables: `APP_ORIGIN`, `DATABASE_URL` or server-only Supabase credentials, `MAINNET_RPC_URL`, `MAINNET_CHAIN_ID`, `CHOG_CONTRACT_ADDRESS`, `SESSION_SECRET`, `PRACTICE_ENABLED`, plus optional `NARRATION_API_KEY` disabled by default. Store secrets through the chosen host's secret facility. Commit an example configuration with placeholders only.

## 9. Suggested repository boundaries

- `src/`: frontend components/routes/assets/styles supplied or adapted from design AI.
- `api/`: auth, profile, refresh, play and action handlers.
- `server/`: ownership, persistence, validation, caching and service modules.
- `shared/rules/`: versioned pure engine and authored encounter definitions.
- `fixtures/`: explicitly simulated practice/test data.
- `db/migrations/`: schema and transactional game procedures.
- `scripts/`: local mock deployment, developer transfer and export helpers.
- `tests/`: rules, service integration and essential browser flows.

Do not implement a production transfer feature or merge local/testnet state into a mainnet identity when switching configuration.
