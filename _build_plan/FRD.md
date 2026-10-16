# Chog Legacy — functional requirements

Version 1.0 · 9 October 2026 · Ruleset `legacy-v1`

## 1. Identity, state and access

Canonical identity: namespace + chain ID + lowercase contract address + decimal token ID. Production mainnet identities are never shared with practice or local/testnet records. Token IDs are validated unsigned integer strings; do not assume collection numbering starts at 0 or 1 without verification.

Anyone may read a real profile. Only the freshly verified current NFT owner may initialize gameplay, set a chapter intention or commit an encounter action. Connect wallet does not authorize a write. A valid server session does not prove continuing ownership.

Read-only profile lookup must not initialize gameplay or spend a daily action. Return an explicit unstarted state when no game record exists. A burned token remains an inspectable historical record, if known, with gameplay locked. Unsupported collections and non-existing tokens are rejected.

## 2. Authentication

`AUTH-01`: Server creates a cryptographically random, single-use nonce valid for five minutes. Bind it to the expected domain, URI, permitted chain and wallet address. Validate EIP-4361 message fields and signature server-side. Consume nonce once, including concurrent replay attempts.

`AUTH-02`: Successful sign-in issues a secure, HttpOnly, SameSite session cookie valid for 24 hours. Apply CSRF/origin protection to writes; never place session credentials in localStorage. Account switch requires a new sign-in. Logout revokes the session.

`AUTH-03`: Production sign-in requires a gasless message signature only. The application must never request `approve`, `setApprovalForAll`, transaction signing, token spending or NFT transfers. The message must identify the app and authentication purpose. Wallet rejection leaves the visitor read-only.

`AUTH-04`: Before every owner mutation, read current `ownerOf` from the configured mainnet contract and validate chain health. Do not authorize from token IDs supplied by the client, cached metadata, a prior profile response or a previous session check. A failed/inconsistent RPC read rejects the mutation without consuming an action.

Support EOA signatures in MVP. Contract-wallet verification may be supported through a tested chain-aware verifier; otherwise clearly report unsupported wallets. Do not silently accept unverifiable signatures.

## 3. Persistent character rules

| Field | Range/start | Meaning |
| --- | --- | --- |
| Trust | −100…100; starts 0 | In-app willingness of story characters to cooperate |
| Notoriety | 0…100; starts 0 | In-app visibility/fear associated with the Chog |
| Supplies | 0…10; starts 3 | Fictional inventory for encounters; never a token or currency |
| State version | Integer; starts 0 | Optimistic concurrency version |
| Daily usage | 0…3 | Committed decisions for the current UTC day |

Stats change only through defined actions. Clamp trust/notoriety to their bounds. Supply costs must be affordable before action; positive gains clamp at 10. Preview must show actual resulting values after clamping. No inactivity decay, death, permanent lockout or owner-transfer reset.

Derived title precedence: `notoriety >= 60 && trust <= -20` → **The Feared**; otherwise `trust >= 40` → **The Trusted**; otherwise `notoriety >= 40` → **The Notorious**; otherwise **The Unwritten**. Titles describe gameplay, not the owner's morality. Changing title does not edit past events.

Initialize these defaults only on the first verified owner activation. Imported transfers never change reputation. Historical owners with no gameplay have provenance entries, not invented app chapters.

## 4. Daily encounters

`GAME-01`: Three committed actions per token per UTC day, reset at 00:00 UTC. Use server time. A transfer, logout, browser change or account change does not reset this quota. No rollover. Display the next reset in the visitor's local time with a time-zone label.

`GAME-02`: Select three distinct templates each day. Hash `rulesetVersion|canonicalIdentity|UTCDate`, use the first unsigned 32-bit digest value modulo six as the start index, then take start, start+1 and start+2 modulo six. Persist assigned instances when first needed. Never regenerate existing assignments following an owner change or ruleset update. The next unresolved instance is the only playable one.

`GAME-03`: Each instance permits exactly one choice. Do not accept stat deltas, outcome prose, owner addresses, dates or choice availability from the client. Client submits only the instance ID, choice ID, expected state version and an idempotency key.

`GAME-04`: Keep the assigned encounter until it is resolved or the UTC day ends. Viewing, refreshing or rejecting a signature does not consume it. Midnight replaces unresolved encounters; previous resolved events stay in the chronicle. Every template has an always-available fallback.

### Ruleset content

T = trust, N = notoriety, S = supplies. These effects are canonical. Names and text are authored story content; an AI cannot alter the table.

| Encounter | Choice | Eligibility | Effect (T, N, S) |
| --- | --- | --- | --- |
| 0: A stranded courier | Share supplies | S ≥ 1 | +10, −3, −1 |
| 0: A stranded courier | Demand a reward | Always | −5, +7, +1 |
| 0: A stranded courier | Pass by | Always | 0, 0, 0 |
| 1: A checkpoint | Trade fairly | S ≥ 1 | +6, 0, −1 |
| 1: A checkpoint | Use your feared name | N ≥ 60 | −8, +6, +1 |
| 1: A checkpoint | Take the long route | Always | +2, −2, 0 |
| 2: An invitation | Join the trusted table | T ≥ 20 | +5, −2, +1 |
| 2: An invitation | Demand a seat | Always | −6, +8, 0 |
| 2: An invitation | Work behind the scenes | Always | +8, −3, 0 |
| 3: A disputed cache | Return it | S ≥ 1 | +12, −5, −1 |
| 3: A disputed cache | Keep it | Always | −10, +10, +2 |
| 3: A disputed cache | Leave it untouched | Always | +2, 0, 0 |
| 4: A rumor about you | Earn a better story | S ≥ 1 | +10, −8, −1 |
| 4: A rumor about you | Make it scarier | Always | −4, +10, 0 |
| 4: A rumor about you | Let it fade | Always | 0, −3, 0 |
| 5: A hungry traveler | Offer a meal | S ≥ 1 | +8, −2, −1 |
| 5: A hungry traveler | Trade information | Always | +2, +2, +1 |
| 5: A hungry traveler | Scare them away | Always | −6, +6, 0 |

Consequences are deterministic and shown before confirmation. A villain path provides meaningful access and supply gains, while reducing cooperation; redemption costs choices/supplies but opens trust-dependent access. There is no promise of perfect balance. Tune only by versioning the ruleset and updating docs/tests; never retroactively recompute past events.

## 5. Commit semantics

Within one database transaction, lock the character, verify expected version, active epoch, instance/date, quota, eligibility and idempotency, then append the gameplay event, update stats, resolve the instance and increment usage/version. All effects succeed together or none do.

An exact idempotent retry returns the existing receipt after session and current-owner authorization; it does not produce a second event or spend another action. Reuse of a key with different input is rejected. A stale version produces `409 STATE_CHANGED`, followed by a refetch. Do not silently apply a different result from the preview. Requests crossing midnight must refetch the new day.

Only acknowledged committed events appear as saved history. Storage failure leaves the encounter unresolved. UI must not show success just because an animation ran or an optimistic update appeared.

## 6. Ownership inheritance

`OWN-01`: A server ownership observation differs from the active controller → atomically close the previous observed ownership epoch, open the new one, append an ownership-observed record and retain stats, events, supplies, daily quota and assigned encounters. This may occur during explicit refresh or before a mutation. GET profiles do not mutate gameplay; use a rate-limited refresh endpoint for ownership sync.

`OWN-02`: Old owner trying to act receives `403 NOT_CURRENT_OWNER`; client transitions to read-only and refetches. Incoming owner must authenticate independently, then activate the existing character. Old pending actions/intention requests are not inherited.

`OWN-03`: An epoch's intention is either `embrace`, `redeem` or unset. Current owner may set it once per ownership epoch; setting it spends no daily action and alters no stats. Intention is optional and must not block play. A newly verified transfer creates a new intention opportunity. Relogging does not.

`OWN-04`: Handoff summary reports existing title/stats, last three gameplay events, prior observed chapter count, remaining daily actions and available reputation-dependent choices. If this is first-ever gameplay, show neutral activation even if many chain transfers exist.

`OWN-05`: Observed controller changes and complete chain transfer history are different. If A→B→A occurs between observations, do not claim there was no intervening transfer. Canonical logs may record it later as provenance. Keep observation dates distinct from actual transfer dates; do not invent chapters for unseen inactive owners. Continuous transaction-by-transaction game replay is outside MVP.

## 7. Truth, metadata and provenance

`DATA-01`: Show current owner from a fresh observation with timestamp/status. Metadata may be cached; show unavailable image/traits gracefully. Metadata failure does not justify inventing traits.

`DATA-02`: Transfer records include chain, contract, token, transaction hash, block number and log index. Mint is from zero address; transfer is a transfer; burn is to zero address. Do not infer a sale, price or emotional meaning. App gameplay events have no fake transaction hash.

`DATA-03`: Old history import can be partial. Label coverage/completeness and last indexed block. Missing historical logs do not erase current game state or block play when owner verification is reliable.

`DATA-04`: Narration identifies story events as fiction/gameplay. Before optional AI, authored templates render every event. Optional AI receives only bounded structured events, cannot invent choices, cannot update state, and falls back on timeout/quota/error. Never publish raw wallet metadata as instructions to a model.

## 8. Practice and developer testing

`DEMO-01`: Public practice requires no wallet. Seed a fictional villain at T −35, N 70, S 3, with labeled fixture history and controller A. The player makes a decision, simulates inheritance to controller B and continues. Quota remains attached to the character; provide two playable decisions so the transition can be experienced immediately.

`DEMO-02`: Practice uses the same pure rules engine but browser/session-isolated state and a separate identity namespace. Include reset. Practice data never reaches production game tables and never appears as real holder activity. The explicit simulation switch is a practice control, not a production transfer function.

`DEV-01`: Local ERC-721 mock and optional faucet-funded testnet mock support actual ownership transitions. Minting/transfer utilities belong to developer scripts/test environments. They are not eligible Chog NFTs and are not included in the mainnet player interface. Local mocks provide a fully offline $0 fallback if a testnet faucet fails.

## 9. Error and recovery contract

| Code | Meaning | Behavior |
| --- | --- | --- |
| 400 INVALID_INPUT | Invalid token, instance or choice | Correct input; preserve state |
| 401 SIGN_IN_REQUIRED | Missing/expired session | Reauthenticate; no action consumed |
| 403 NOT_CURRENT_OWNER | Wallet does not currently own token | Read-only; refresh ownership |
| 404 TOKEN_NOT_FOUND | Verified nonexistent token | Offer lookup/practice |
| 409 STATE_CHANGED | Another action/epoch/day won the race | Refetch and show updated preview |
| 409 CHOICE_UNAVAILABLE | Eligibility no longer met | Refetch; show reason |
| 409 DAILY_LIMIT | Three decisions already committed | Show next reset |
| 429 RATE_LIMITED | Request cap reached | Retry time; no silent paid fallback |
| 503 CHAIN_UNAVAILABLE | Fresh ownership cannot be verified | Block writes, allow labeled stale read |
| 503 STORAGE_UNAVAILABLE | Canonical state cannot be saved | No success claim; retry safely |

## 10. Acceptance scenarios

1. Anonymous lookup returns real read-only facts without creating a game or asking for a signature.
2. A valid owner activates neutral state; a non-owner cannot initialize or mutate it.
3. Valid choice updates exactly the table-defined stats, one event, one quota count and one version.
4. Five duplicate requests produce one committed action; concurrent distinct requests cannot exceed quota or overwrite state.
5. A feared Chog has intimidation access; a neutral one does not. Redemption opens trusted choices through actual decisions.
6. A new controller receives identical stats/history/quota. Previous owner is rejected despite an unexpired session.
7. Transfer, logout and browser resets cannot replenish daily allowance.
8. RPC failure, signature rejection and database failure consume no action and create no success event.
9. Practice demonstrates inheritance with labeled fixtures and no mutation of mainnet records.
10. Every chain claim links to genuine evidence; gameplay entries remain clearly app-saved fiction.
