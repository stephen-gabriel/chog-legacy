# Chog Legacy — implementation and verification plan

> UI revision, 16 October 2026: `UI_DESIGN.md` and runtime `src/ui/` now define the Milkwood Journal presentation. The old `ui-design/` prototype is retired. This note changes no gameplay, permissions, API, or acceptance rules.

Version 1.0 · 9 October 2026

Use gates and working vertical slices. No fixed hackathon dates are assumed: confirm the actual build/submission window before scheduling. Do not spend money to remove a blocker.

## Gate 0 — establish facts before integration

Record evidence in `INTEGRATION_EVIDENCE.md`:

1. Current official Chogathon rules, eligible collection, deadlines and whether an isolated practice mode is acceptable. Do not reproduce the earlier unsupported project count.
2. Official Chog source linking the candidate mainnet collection and address.
3. Current official chain ID/RPC reference; contract bytecode; ERC-721 support where available; successful `ownerOf` and `tokenURI` for at least two real token IDs.
4. Parsed name/image/traits or an honest documented unavailable state. Never fabricate metadata.
5. At least one genuine mint/transfer log with transaction hash and bounded retrieval strategy. Establish deployment/start block from evidence. If historical access fails, document partial provenance and keep fresh owner verification mandatory.
6. Free hosting/database eligibility, quotas, runtime compatibility and server-only secret storage. No paid upgrades or mandatory paid API keys.
7. A consenting holder for gasless sign-in/action verification; no private key sharing. A holder signing in alone cannot prove real transfer inheritance.

Contract/metadata retrieval failures are engineering blockers to resolve, not proof the NFT does not exist. Do not label an unperformed probe successful. If official eligibility or current ownership cannot be verified, do not claim a submission-ready mainnet app.

## Milestone 1 — deterministic engine and practice

Implement shared versioned rules, bounds, titles, daily selection, quota and six authored encounters. Build a no-wallet fixture practice scenario using the supplied UI when available. If UI work is still pending, use a temporary developer surface; do not design a final visual system independently.

Done: player makes a consequential choice, sees a saved practice event, simulates inheritance, retains stats/quota and continues. Reset is isolated. Core works with all AI keys absent.

## Milestone 2 — persistence and API

Create SQL migrations, unique constraints, transactional action service and validated endpoints. Implement explicit unstarted profiles, activation, epoch records, intention, pagination, receipts and daily assignments.

Done: tests show persistence across sessions, exactly-once effects, no quota bypass and no partial state writes. Canonical state is not browser-local.

## Milestone 3 — wallet and local transfer integration

Implement SIWE nonce/session verification, origin protection and fresh owner checks through the chain adapter. Run a small local ERC-721 using a lightweight EVM test runner such as Anvil if available; keep this development dependency optional for frontend work. Deploy mock, mint to test wallet A, act, transfer with a developer script to test wallet B, then verify A is blocked and B inherits unchanged state.

Use the same auth/action path as production. Only contract/RPC/namespace differs. Do not bypass ownership in the production service just to make tests pass.

Done: real contract ownership transitions are tested locally at $0, with old sessions rejected and token identity preserved. If using a faucet-funded testnet instead, label that evidence as testnet mock integration, not official Chog play.

## Milestone 4 — genuine mainnet reads and holder session

Connect the verified contract/RPC, metadata cache and bounded provenance fetch. Test read-only access without wallet. With a consenting real holder, test gasless sign-in and an actual saved game choice. The holder need not transfer or approve the NFT.

Done: record actual RPC observations and holder test results. Do not include raw signatures, cookies, private keys or secrets in evidence. Mainnet inheritance is simulated in practice/local tests unless a voluntary real transfer independently happens; state that limitation explicitly.

## Milestone 5 — integrate the design package

Replace fixtures on real routes with API state. Retain practice fixtures only in practice. Complete every required state from UI_HANDOFF; confirm mobile and keyboard flow. Remove development-only mint/transfer utilities from public surfaces. Keep public practice accessible.

Done: non-holder can try practice, holder can act, spectator can inspect chronicle, and every unavailable/auth/conflict state is truthful. No buttons imply unimplemented multiplayer features.

## Milestone 6 — release and demo

Run the targeted test suite, verify host configuration and server-only secrets, export database checkpoint and deploy through the chosen free platform. Open the hosted app in an unauthenticated browser. Verify reads, practice, sign-in and persistence against the hosted environment, not just localhost.

Prepare repo/readme, actual deployed URL, simple non-holder and holder testing instructions, known limitations and a video of at most the official maximum duration after confirming the rules. Do not claim retention data or competitive superiority without evidence.

## Required meaningful tests

| Test | What it must prove |
| --- | --- |
| Rules bounds/eligibility | Costs checked first, clamped previews match actual state, fallback always exists |
| Villain/redemption path | Reputation changes available mechanics, not just text |
| Daily assignment | Stable order per identity/date; stored order unaffected by ownership change |
| Midnight boundary | Old unresolved choice rejected after reset; new daily budget assigned once |
| Signature security | Expired/wrong-domain/wrong-chain/replayed nonce rejected; account switch requires auth |
| Authorization | Client owner flag ignored; non-owner/expired session/failing RPC cannot mutate |
| Inheritance integration | Actual local ERC-721 transfer changes controller while game state/quota remain |
| Concurrent actions | One resolution per encounter; state/version/quota cannot be lost or exceeded |
| Idempotency | Identical retry returns same receipt; changed payload with same key rejected |
| Failure atomicity | Injected storage failure leaves no event, stat or quota fragment |
| Namespace separation | Mock/practice token ID cannot read or mutate mainnet character |
| Truth handling | No fake chain hashes, invented historical decisions or transfer-as-sale claims |
| Browser critical path | Practice start→choice→handoff→continue; owner path; read-only fallback |
| Wallet request inspection | Production sends only permitted authentication signature requests, no approvals/transactions |

Run rules/service tests on changes to those layers. Use browser tests for the critical paths and visually inspect supplied UI across mobile/desktop states. Do not add repetitive tests just to inflate a test count.

## No-NFT testing instructions

### Developer

Start with fixture practice. For genuine ownership authorization/inheritance integration, use a local mock ERC-721 and two disposable development wallets. Optional testnet mocks use faucet gas, not purchased funds. Keep environment/chain/contract namespaces separate. Switching the app to mainnet never migrates mock state into official NFT records.

### Real holder

Send the hosted app's purpose and sign-in description through your own chosen communication. Explain that the app requests a login signature only and never asks for NFT approval or transfer. The holder opens a public profile, connects, signs in, confirms ownership and makes one in-app choice. They should reject any unexpected approval/transaction request. The implementation agent does not contact holders automatically.

### Judge or friend without a Chog

Open practice without wallet. Play a choice with the feared character, simulate a new owner, observe unchanged history/stats and make the next choice. Then open a real profile in read-only mode to inspect authentic chain facts. Clear labeling is mandatory; practice is not proof of a real mainnet transfer.

## Suggested three-minute demo outline

| Time | Show | Explain |
| --- | --- | --- |
| 0:00–0:20 | Real Chog profile and a labeled practice entry | Every owner writes another chapter |
| 0:20–0:55 | Feared character's available/locked choices | Reputation changes gameplay |
| 0:55–1:15 | Commit a choice; show chronicle/state | Decisions persist with the character |
| 1:15–1:45 | Explicitly simulated handoff | New controller inherits the same past and quota |
| 1:45–2:10 | New controller embraces or begins redeeming; acts | New chapter changes the future |
| 2:10–2:40 | Authentic mainnet reads and consenting-holder evidence | Real control uses signature plus current owner check |
| 2:40–3:00 | Next daily availability and concise implementation facts | Repeatable loop, $0 core, honest test boundaries |

Use real mainnet transfer footage only if genuinely available. Never hide a simulation label for a stronger-looking video.

## Release checklist

- P0/P1 behavior works; required tests pass.
- Actual official rules and deadlines verified.
- Candidate contract/chain/config verified and documented.
- Public practice preserved; developer transfer/mint controls absent from production.
- Mainnet ownership reads and holder action validated honestly.
- No approvals, spending, production transactions or exposed secrets.
- RPC/storage failures fail closed for mutations.
- Mock/practice/mainnet state strictly separated.
- UI handoff states covered and interface usable on mobile/keyboard.
- Free-plan limits checked; no paid core dependency.
- README contains real run/setup/test commands after implementation and actual deployed URL.
- Known limitations state off-chain storage, ownership race window, provenance coverage and inheritance testing environment.
- A database checkpoint/export exists before submission.
