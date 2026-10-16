# Chog Legacy — UI design AI handoff

Version 2.0 · 16 October 2026

This file retains the required screen and behavior coverage. The current visual design is **The Milkwood Journal**, specified in `UI_DESIGN.md` and implemented in runtime `src/ui/`. The old `_build_plan/ui-design/` package is retired. Apply the new implementation; do not ask another design agent to reinterpret it. FRD remains authoritative for behavior.

## 1. Product to express

**The Chog keeps its past. You choose its next chapter.**

A compact daily story game, not an NFT trading terminal, financial dashboard, chatbot or giant virtual world. A reputation follows the character between owners, affects available choices and develops through gameplay. A visitor can try it in practice without connecting anything.

Read PRD for scope and FRD for behavior. UI visuals may change; game rules, quota and ownership boundaries may not.

## 2. Required screens/surfaces

The designer may combine related surfaces where clear. These are functional coverage requirements, not mandatory page count or layout instructions.

| Surface | Required information | Required actions |
| --- | --- | --- |
| Entry/discovery | Plain-language premise; real token lookup; distinction between real profile and practice | Enter token ID, open profile, start practice, optionally connect |
| Public Chog profile | NFT identity/image/traits if available; observed current owner and freshness; trust, notoriety, supplies, title or unstarted state; gameplay versus chain facts | Inspect chronicle, copy profile link, refresh ownership, connect/sign in to play if eligible |
| Owner activation | Verified wallet/ownership status; neutral first activation or existing history | Activate without resetting; cancel back to read-only |
| Inheritance summary | Existing stats/title, last three choices, previous observed chapters, remaining daily actions; what continues unchanged | Choose optional embrace/redeem intention, continue to play, inspect history |
| Daily encounter | Authored situation, three options, eligibility reasons, exact resulting state previews, remaining actions | Select/confirm eligible choice; leave pending; inspect current state |
| Committed outcome | Saved choice, consequences, updated title/stats, receipt status | Next encounter if available; open chronicle; return later |
| Chronicle | Chronological owner-attributed game chapters and separately labeled provenance; partial-history status | Pagination/filter by event type, genuine chain transaction links, profile navigation |
| Practice scenario | Persistent simulation label; seeded villain; inherited state; simulated controller; same rules | Play initial decision, simulate controller change, continue, reset, leave practice |
| Wallet/session controls | Wallet, sign-in status, authentication purpose, account-change state | Connect, sign in, cancel, disconnect/logout |
| Daily limit state | Three actions used; next reset shown in local time with timezone | Read past chapters, browse public profile, return after reset |

A first-ever app profile has no fictional prior gameplay. The design must work when only chain provenance exists and when metadata/images are unavailable.

## 3. Required state coverage

Supply designs/component states for:

- Initial load, token lookup in progress, valid token, invalid input and verified nonexistent token.
- Metadata missing, image unavailable, partial transfer history, cached/stale facts and RPC unavailable.
- Visitor, connected but unsigned, awaiting signature, signature cancelled, signed owner and signed non-owner.
- Multiple known Chogs where returned by the chosen integration, or manual token lookup when discovery cannot enumerate a wallet's NFTs. Do not assume ERC721Enumerable exists.
- First activation, inherited villain, neutral inherited state and optional intention already chosen.
- Eligible/locked choice, exhausted supplies, clamped stat previews and daily quota exhausted.
- Submission pending, saved outcome, duplicate retry, stale state conflict and failed save.
- Ownership changed mid-session: old controller becomes read-only; incoming controller signs in and continues.
- Session expired, wallet account changed and unsupported signature/wallet type.
- Practice reset and simulated handoff, with no possible confusion about a real chain transfer.
- Narrow mobile screen, desktop screen, keyboard navigation and reduced-motion preferences.

Loading or success treatments must reflect actual API outcomes. Do not imply a choice was saved before the server confirms it. Do not hide unavailable choices without explaining which reputation or supply condition is unmet.

## 4. Interaction facts the design must preserve

1. Public exploration and practice require no wallet.
2. Wallet connection, sign-in and NFT ownership are three distinct states.
3. Sign-in is a free authentication message, not an approval or transaction.
4. The next unresolved encounter has three choices; previews show the actual clamped result.
5. Daily allowance belongs to the Chog and survives inheritance. No purchase/reset CTA.
6. Embrace/redeem chapter intention changes framing only; actual reputation requires gameplay decisions.
7. Chain transfers are not automatically sales or betrayal. App stories are clearly fiction/gameplay.
8. A real transfer happens outside this app. Only practice has a simulated handoff control.
9. New owners cannot edit or delete earlier owner-attributed chapters.
10. No $CHOG, live player count, token rewards, marketplace, factions or unimplemented social feature.

## 5. Content/assets the designer needs to supply or request

- Product identity and any optional brand assets.
- Visual treatment of the real NFT image and fallback when unavailable.
- Encounter presentation assets, if needed, within practical loading cost.
- Stat/title representations and a comprehensible before/after comparison.
- Ownership/chapter/provenance indicators.
- Wallet/signature/read-only/loading/error treatments.
- Practice indicators and next-return presentation.
- Any icons, illustrations or motion assets chosen by the designer, with licensing/source information.

Do not invent real collection artwork, verified owners or transaction hashes. Use retrieved images only when authorized/available; fixture placeholders must remain distinguishable. The implementation agent must not have to guess which assets are missing.

## 6. Implementation contract

The supplied Milkwood Journal redesign is React + TypeScript with CSS Modules and no new runtime dependency. Apply its runtime source faithfully, preserving the current repository's backend and integration handlers. `UI_DESIGN.md` defines the layout and visual direction; `UI_ASSETS.md` records the supplied art and icons. The source in the old `ui-design/` folder is retired.

Components receive server-provided state and exact previews. Existing authentication, ownership checks, database saves and failure semantics remain authoritative. Keep dev fixtures out of production. Confirm unstarted, owner, non-owner, stale/unavailable, neutral/locked-choice, inherited and quota-exhausted states in the full application.

The handoff package contains the OpenCode integration prompt and a limited-scope validation report. Run the full repository's actual test/build scripts after merging. Do not treat the offline visual preview as a real-holder integration test.

## 7. Usability validation

A visitor should identify how to try practice, tell when they are viewing real versus simulated data, understand why one choice is locked, find the next reset, and understand what survives inheritance. A holder should know exactly what they are signing and see when a save fails. Accessibility requires semantic controls, keyboard use, visible focus, non-color-only status distinctions and accessible error explanations; visual implementation is the designer's responsibility.
