# Chog Legacy — project brain

Version 1.0 · 9 October 2026 · Status: direction selected; implementation not started

## One-line pitch

Chog Legacy is a daily story game where every Chog keeps its reputation and past decisions when its NFT changes owners. You inherit the character's consequences, then decide what its next chapter becomes.

## Why build it

Most NFT experiences offer access or cosmetic identity. This project makes external NFT ownership determine who can continue one persistent character's life. A new owner does not start with a fresh account character: they inherit useful privileges, damaged relationships and a record of choices made by previous owners.

The memorable moment is inheriting a feared Chog and discovering that its reputation changes the choices available to you. You may exploit that reputation or repair it. Neither path erases the earlier chapters.

## Product direction

Build a compact, asynchronous, single-character story game with a public chronicle. A living social world is a future direction, not the MVP. Authored non-player characters make the initial loop work with one real holder. Any fictional NPC must be identified as a story character, never presented as another active holder.

The daily loop is: inspect your inherited state → choose an encounter → compare three consequences → act → see updated state and a saved chapter → return for the next daily allowance. Three committed decisions per token per UTC day. Ownership transfer does not replenish the allowance.

## Signature mechanic: inherit a villain

Example fixture: a Chog has trust −35 and notoriety 70 after earlier gameplay. A new owner can use intimidation options unavailable to a neutral Chog, while cooperative options requiring trust remain unavailable. They may choose **lean into the legend** or **begin a redemption chapter**. This choice creates a chapter header only; meaningful change comes from subsequent decisions. No instant stat reset or free bonus.

Previous owners remain attributed to their own gameplay decisions. The current owner can change the future, not rewrite the past. A wallet transfer alone never means betrayal, abandonment or a sale. Those are either explicit gameplay actions or separately verified transaction interpretations; the MVP does not infer them.

## Why the NFT matters

The canonical character identity is `(chain_id, contract_address, token_id)`, not a wallet or user account. The current external NFT owner is the sole player authorized to continue that character. A confirmed ownership change ends the previous controller's authority and starts the new controller's chapter without resetting game state.

This is the essentiality argument, not a claim that ordinary software cannot model transferable characters. The differentiator is continuity attached to an independently owned asset with externally verifiable control, rather than an app-controlled transfer button.

## Locked constraints

- $0 core: no purchase, paid API dependency, custom production contract deployment or on-chain gameplay write.
- No $CHOG integration or monetization in MVP.
- React + TypeScript, plain CSS/CSS Modules; visual design delegated to another AI.
- Gasless sign-in message only; no approvals, transfers, swaps or custody in the production app.
- Deterministic gameplay; optional narration must never determine state or permissions.
- Real mainnet read/play, isolated practice mode, and local developer fixtures are separate modes.
- Persistent server-side gameplay storage; localStorage alone cannot provide inheritance across owners.
- No open world, live multiplayer, chat, marketplace, economy, faction system or browser extension in MVP.

## MVP features

1. Public token lookup and a real Chog profile with source-labeled facts.
2. Safe wallet sign-in and server-side ownership checks.
3. Persistent trust, notoriety, supplies, derived title and append-only gameplay chronicle.
4. Six authored encounter templates, three daily actions, deterministic consequences and a next-return indicator.
5. Ownership epochs, inherited-state summary and chapter intention.
6. Isolated no-wallet practice scenario demonstrating villain inheritance.
7. Public read-only chronicles and a copyable profile link.
8. Ownership refresh, unavailable-data states and honest handling of incomplete provenance.

## Data truth boundaries

| Data | Authority | What may be claimed |
| --- | --- | --- |
| Current owner | Fresh mainnet `ownerOf` read | Current controller as of the recorded observation |
| Mint/transfer record | Canonical contract logs with transaction references | Observed chain event; not automatically a sale |
| NFT traits/image | Retrieved collection metadata | Reported metadata, with retrieval time |
| Trust/notoriety/choices | App database and deterministic rules | In-app reputation and recorded gameplay |
| Practice history | Explicit fixtures | Simulation only |
| Narration | Authored templates or optional AI | Fictional interpretation of known events |

## Research status and sources

- User-supplied candidate Chog Genesis ERC-721 address: `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763`.
- MonadScan search results expose mint and transfer events for that address. A mint event includes token 1425; a transfer event includes token 476. These are research evidence, not guaranteed live demo selections.
- Official Monad developer organization currently lists mainnet chain ID 143 and RPC `https://rpc.monad.xyz`. Verify this in the integration environment before release.
- No successful direct metadata/RPC integration probe has been performed for this specification pack. Standard ERC-721 reads are an implementation plan, not proof they were tested here.
- Direct retrieval of the Chogathon page failed during preparation. Scoring weights are supplied by the user: novelty 30%, fun 20%, retention 20%, clarity 15%, execution 15%, optional $CHOG bonus. Verify dates, eligible collections and acceptance of practice demos with the current official rules.
- No verified competitor directory or competitor count. The earlier 488-project assertion is discarded.

Sources checked on 9 October 2026:

- Official hackathon: https://chogathon.chog.xyz/
- Official Monad developer organization: https://github.com/monad-developers
- Mint evidence: https://monadscan.com/tx/0x730195964d4ec7cfba5b460cad486b5c35356d0edabc3b88506c4547c64bc6d9
- Transfer evidence: https://monadscan.com/tx/0x1e03242260c45bfcc29644903e0a0c88495de165f6c2eaef5f336fb5c26c6a0f
- SIWE verification reference: https://viem.sh/docs/siwe/actions/verifySiweMessage
- Free database plan reference: https://supabase.com/docs/guides/platform/billing-on-supabase

## Open verification gates

Confirm collection linkage from official Chog sources; contract code and ERC-721 behavior; valid token IDs; `ownerOf`, `tokenURI`, image/traits availability; bounded transfer-log access; free RPC limits; free deployment/database eligibility; wallet-signature compatibility; hackathon rules and deadlines. A known holder is needed for genuine mainnet owner testing. Buying an NFT is not a fallback.

Full provenance is supplementary: missing old logs must not block gameplay if current ownership is freshly verifiable. If current ownership cannot be read reliably, mainnet writes are blocked and release is not ready.

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-09 | Daily story game over a full living world | More achievable, works with one holder, provides decisions and repeat use |
| 2026-10-09 | Inherited villain reputation as the showcase | Makes continuity affect gameplay rather than merely generate biography |
| 2026-10-09 | Authored deterministic core; AI optional | Protects $0 budget, consistency, latency and explainability |
| 2026-10-09 | No $CHOG | Optional bonus does not justify cost and integration scope |
| 2026-10-09 | Mainnet reads plus isolated practice | Enables development and judge testing without purchasing an NFT |
| 2026-10-09 | No player-to-player mechanics in MVP | Avoids cold-start dependencies and asynchronous resolution complexity |

## Progress protocol

Implementation agent: after each milestone, record working behavior, tests run, verified integration facts and next action in `IMPLEMENTATION_PROGRESS.md`. Update this brain when scope or assumptions change. Never mark a fixture demonstration as mainnet validation.
