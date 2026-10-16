# Chog Legacy — real-holder verification checklist (REAL_HOLDER_CHECK)

Version 1.0 · 16 October 2026 · Milestone 4 consent walkthrough

Purpose: produce the one piece of evidence no test can fabricate — **a consenting Chog holder signing in and saving one real choice on their actual NFT** through the deployed app. Until this completes, that evidence stays marked **UNVERIFIED** in `INTEGRATION_EVIDENCE.md` §10(D).

## Safety rules (non-negotiable)

- The holder **never** shares a private key, seed phrase, or wallet file. Sign-in is a free `personal_sign` message — it can move nothing.
- The app only ever requests `eth_requestAccounts`, `personal_sign`, `eth_chainId`. If a wallet popup ever shows a **transaction, approval, token permit, or payment**, cancel and report it.
- Do not ask the holder to transfer, list, or buy anything. No fallback to buying an NFT for anyone.
- Do not contact holders without their consent; the team itself never signs in as someone else.
- Never record or store: signatures, session cookies, or any wallet secret. Screenshots must not show seed phrases.

## Prerequisites

1. Deployed URL live (see `DEPLOYMENT.md`) and `GET /api/health` returns `"chainId":143`.
2. Holder wallet is on **Monad mainnet (chain 143)** and owns a Chog Genesis NFT (`0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763`).
3. Holder opens the deployed URL **themselves** in their own browser with their own wallet — no screen-share signing by the team.
4. First load may take ~1 minute if the free host slept (cold start) — not a failure.

## Walkthrough (≈3 minutes)

| # | Step | Pass criterion |
| --- | --- | --- |
| 1 | Open the deployed URL | Entry page renders; “Start practice” works with no wallet |
| 2 | Connect wallet (read-only) | Address chip shows their wallet; UI stays read-only; no transaction popup |
| 3 | Click **Sign in** | Wallet shows a **free message** whose domain is exactly the deployed host (e.g. `your-app.onrender.com wants you to sign in…`), `Chain ID: 143`, and the statement that it is not a transaction/approval/transfer. Holder confirms and signs. |
| 4 | Open **their own Chog** profile (`/chog/<their token id>`) | Chip reads `Signed in, owns this Chog`; real owner address matches their wallet |
| 5 | Click into mainnet play → **Activate** | Activation screen states in plain language that activation creates their character in app history and that confirming a choice changes saved state and consumes one of today's actions (informed agreement) |
| 6 | Preview a choice → **Confirm** | Receipt appears (`✓ Saved`); quota decrements (e.g. “2 of 3 decisions left today”) |
| 7 | **Refresh the page**, reopen the profile/chronicle | The saved choice and receipt persist; chronicle shows the new entry with correct before→after stats |
| 8 | **Log out** | UI returns to `Connect wallet`; a repeated save attempt is rejected (401) |

Record for each step: pass/fail + timestamp + deployed URL. Screenshot optional (no secrets, no signatures).

## Explicitly out of scope for this walkthrough

- No transfer of the NFT, no approval, no payment, no marketplace action — by anyone, ever.
- Mainnet *inheritance* (controller change on chain) remains simulated in practice mode unless a voluntary real transfer independently happens; this walkthrough does **not** require one.
- Rate-limit / cold-start hiccups on the free tier are environment notes, not app failures — retry once after the service wakes.

## After the walkthrough

Mark `INTEGRATION_EVIDENCE.md` §10(D) from **UNVERIFIED → VERIFIED** with the date, step results, and deployed URL (no secrets). If any step fails, file it as a release blocker before the 23 Oct 15:00 UTC submission deadline.
