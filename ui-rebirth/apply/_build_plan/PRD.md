# Chog Legacy — product requirements

> UI revision, 16 October 2026: `UI_DESIGN.md` and runtime `src/ui/` now define the Milkwood Journal presentation. The old `ui-design/` prototype is retired. This note changes no gameplay, permissions, API, or acceptance rules.

Version 1.0 · 9 October 2026

## 1. Product outcome

Build a usable NFT character game in which ownership inheritance changes the player's starting situation. A holder returns for short daily decisions, and a visitor can understand the inheritance mechanic without buying anything or connecting a wallet.

Promise: **The Chog keeps its past. You choose its next chapter.**

## 2. Problem and opportunity

An NFT biography may be interesting once, but reading historical transfers is not a repeatable game. Chog Legacy converts accumulated in-app behavior into persistent opportunities and constraints. The same feared Chog offers a different experience from a trusted one, regardless of which wallet currently owns it.

The ownership transfer is an important payoff, not the daily retention requirement. Players should enjoy the loop even when their NFT stays in one wallet for months.

## 3. Users

| User | Need | Successful experience |
| --- | --- | --- |
| Existing holder | Meaningful, brief activity tied to their Chog | Makes a choice and sees a lasting consequence |
| New owner | Understand inherited baggage and available paths | Sees prior chapters and continues without resetting |
| Non-holder/judge | Try the premise safely | Plays a labeled inheritance scenario without a wallet |
| Developer/tester | Verify transfer and authorization with no purchase | Uses fixtures/local ERC-721 and a consenting real holder |

## 4. Experience and player loop

### Public entry

A visitor can enter a token ID, open a shared profile, or start practice. Real profiles expose current chain facts and app chronicle separately. Public viewing requires no signature. A profile without gameplay is an unstarted life, not a fabricated history.

### First owner session

The holder connects and signs an authentication message. Server checks current ownership, loads existing state, and presents an inherited-state summary when relevant. First-ever app use initializes neutral game stats; chain history is imported as factual provenance, not converted into moral reputation.

### Daily play

The player has three decisions per Chog per UTC day. Six authored templates provide choices with explicit consequences. The system supplies the next encounter from a deterministic daily order. The player may act, or leave it pending; there is no penalty for absence. Unused decisions do not accumulate.

Reputation thresholds change which options are available. A high-notoriety Chog may intimidate someone and gain supplies; low trust prevents a cooperative offer. A player pursuing redemption must spend multiple decisions earning trust. All paths are viable, and no stat represents the owner's real-world character.

After each committed decision, state and chronicle update together. The profile communicates remaining actions and next reset in the user's local time. Return motivation is continuing a chosen arc, experimenting with available options, and seeing a character's record develop. No streak penalty or compulsory notification system.

### Inheritance

When ownership changes externally, the previous controller loses access to new decisions. The new owner sees the same game stats, previous choices, title and daily usage. The new chapter records the incoming owner and an intention: embrace the legacy or pursue redemption. Intention changes narrative framing only, not numerical state.

The app never performs a transfer. Do not require frequent trading to enjoy the game. Do not describe unknown transfer reasons as abandonment or betrayal.

### Practice

A visitor plays a seeded villain scenario, changes the fictional controller, and observes that reputation/history remain. The practice transition is explicitly simulated and isolated from mainnet. It stays available in the submitted app for non-holders. Development-only minting and account controls are absent from production.

## 5. Scope and priority

| Priority | Requirement | Release condition |
| --- | --- | --- |
| P0 | Real token lookup/profile | Valid metadata and owner read; failures clearly surfaced |
| P0 | SIWE sign-in and owner authorization | No production approvals or transactions; fresh server checks |
| P0 | Persistent game state/chronicle | Survives refresh, device change and controller change |
| P0 | Deterministic encounters | Six templates, three actions daily, published effects |
| P0 | Inheritance | Old controller blocked, new controller continues same identity |
| P0 | Practice experience | No wallet required; simulated data unambiguously labeled |
| P0 | Data truth and recovery | Chain facts separated from fiction; unavailable reads fail closed |
| P1 | Public profile/chronicle links | Copying/opening a link requires no wallet |
| P1 | Previous chapter summary | Summarizes actual saved decisions, not invented memories |
| P2 | Optional generated prose | Only after P0/P1; deterministic fallback; no paid requirement |

P2 is not required for the hackathon submission. The game itself must work without an AI service.

## 6. Out of scope

$CHOG, token rewards, purchases, marketplace, real financial scores, custom mainnet contract deployment, on-chain gameplay storage, live multiplayer, player-to-player battles, faction politics, direct messaging, freeform chatbot, 3D world, extension, native mobile app, push/email notifications and arbitrary player-authored public text.

Social depth may later come from owner-verified pacts and rivals, but this release uses authored NPC encounters. Do not build fake populated multiplayer screens.

## 7. Rubric strategy

| Supplied criterion | Product response | Evidence to demonstrate |
| --- | --- | --- |
| Novelty 30% | External NFT control carries gameplay consequences across owners | Same token, changed controller, unchanged past |
| Fun 20% | Choices with advantages, costs and unlocks | A villain uses an option a neutral character cannot |
| Retention 20% | Short daily actions and multi-day reputation arcs | A next-day plan and visible next availability |
| Clarity 15% | Simple inheritance promise and no-wallet practice | Visitor can explain the premise after one scenario |
| Execution 15% | Atomic state, ownership refresh and dependable fallback | Rejected stale owner; no duplicates or false history |
| Optional bonus | Omit $CHOG | Scope kept within $0 core |

These are hypotheses, not numerical score predictions. The supplied judging gate must be confirmed against current official rules.

## 8. Success criteria

Before submission, observe at least one non-holder and one consenting holder. Targets:

- Non-holder starts practice without a wallet in under 30 seconds, excluding network outage.
- After practice, tester explains that ownership changes control while past state persists.
- Tester identifies one concrete consequence of inherited reputation.
- A real holder signs in and commits a game action without a blockchain transaction.
- Mainnet ownership checks and metadata reads are recorded with genuine evidence.
- Inheritance is verified using a local/testnet ERC-721 transfer; a real mainnet transfer is optional and never required to spend money.
- Duplicate submits, stale owner, RPC failure and storage failure do not corrupt state.
- Refresh and a second browser session reproduce the canonical server state.

Daily return and choice diversity can be observed during testing, but no measured retention claim should be made from a single demo. No analytics vendor is required; structured server logs and a short tester notes file suffice.

## 9. Budget and feasibility

Core runs without an LLM. Use free eligible hosting, a free managed Postgres tier and bounded public RPC reads. Free tiers have quotas, availability limits and terms; confirm them at Gate 0. Cache metadata/provenance, not authorization for gameplay mutations. No silent paid upgrades. If free infrastructure cannot support the core, record the limitation rather than treating a local demo as a hosted mainnet release.

## 10. Visual design boundary

Visual design belongs to the other AI. `UI_HANDOFF.md` lists the required surfaces, information, actions and states. This document does not prescribe layout, palette, typography, artwork, transitions or branding assets.
