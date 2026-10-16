# Chog Legacy — deployment guide ($0 budget)

Version 1.0 · 16 October 2026 · prepared for Milestone 4

The app is a single Node service: it serves the built SPA (`dist/`), the JSON API under `/api/*`, runs migrations on boot, and needs only a Postgres database. No CLI deploy is possible from the build machine (no provider CLIs/credentials installed), so the steps below are the exact manual path.

**Primary stack (both free):** Render Free Web Service + Neon Free Postgres, same origin (no CORS configuration anywhere).

| Piece | Free tier (verified against official docs, Oct 2026) | Limits to know |
| --- | --- | --- |
| Render Web Service | 0.1 CPU / 512 MB, 750 h/month, custom domains + managed TLS, listens on `$PORT` | Sleeps after ~15 min idle; first request after sleep takes ~1 min (cold start). Health checks keep it awake only while actively checked. |
| Neon Free Postgres | 1 GB storage, 100 CU-h/month, scale-to-zero after 5 min idle | Render's own free Postgres **expires after 30 days** — do not use it for this project. |
| Fallback hosting | Hugging Face Docker Spaces (free, persistent container, public URL) | No managed TLS domain of your own; use the `Dockerfile` already in the repo. |

Never purchase or enable any paid resource.

## 1. One-time: database on Neon

1. Sign up at https://neon.tech (free tier), create a project (region close to your Render region, e.g. us-east-1/us-west).
2. In the Neon console copy the **pooled** connection string (ends with a DB name, e.g. `postgres://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require`). The app sets `DB_SSL=true` on Render; the pool connects with TLS.
3. Nothing else to run: `npm run db:migrate` executes automatically when the server starts (`main.ts` runs migrations on boot; migration files live in `db/migrations/` and are checksum-recorded in `schema_migrations`).

## 2. One-time: push the repo to GitHub

Render builds from a Git repository. If the project is not on GitHub yet, create a repo and push (the `share` workflow can do this, or plain `git init && git add -A && git commit && git remote add … && git push`).

Do **not** commit `.env`, `.env.production`, or any real secrets. `.env.production.example` is the committed checklist.

## 3. Render web service

1. Render dashboard → **New → Web Service** → connect the GitHub repo.
2. Render detects the committed `render.yaml` blueprint and pre-fills:
   - Build command: `npm ci --include=dev && npm run build` (typecheck + Vite client build + esbuild server bundle)
   - Start command: `npm start` (runs `node dist-server/main.js`)
   - Health check path: `/api/health`
   - Instance type: **Free**
3. Environment variables (already declared in `render.yaml`; you only fill the two secrets):

   | Var | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon pooled connection string (you paste) |
   | `SESSION_SECRET` | leave to Render's `generateValue`, or paste ≥16 random chars |
   | `APP_ORIGIN` | `https://<your-service>.onrender.com` — **must match the public URL exactly, scheme included**; this is the SIWE message domain (`<service>.onrender.com wants you to sign in…`) |
   | `NODE_ENV` | `production` |
   | `HOST` | `0.0.0.0` (Render provides `PORT`; the server falls back `API_PORT → PORT`) |
   | `TRUST_PROXY` | `true` (rate limits key on `x-forwarded-for` behind Render's proxy) |
   | `DB_SSL` | `true` (Neon requires TLS) |
   | `IDENTITY_NAMESPACE` | `chog-mainnet` (identity-space label, not a domain; letters/digits/dashes only) |

4. Deploy. First build takes a few minutes; watch the logs for `[chog-api] listening on http://0.0.0.0:<port>` and the migration lines.

If `render.yaml` is not auto-detected: create the service manually and paste the build/start commands and env vars above from `render.yaml` + `.env.production.example`.

## 4. Post-deploy verification (5 minutes)

```bash
curl -s https://<service>.onrender.com/api/health
# expect {"ok":true,"db":true,"chain":{"ok":true,...},"contractName":"Chog Genesis","chainId":143}
```

1. Open the URL in a browser (wait out the cold start on the first load).
2. Entry page renders, `Start practice` works (practice needs no wallet and no API).
3. Look up `/chog/1425` — real owner + metadata from mainnet.
4. **Sign-in domain check:** connect a wallet, click `Sign in`, and in the wallet popup confirm the message starts with `<your-service>.onrender.com wants you to sign in…` and shows `Chain ID: 143`. If `APP_ORIGIN` was wrong, fix it and redeploy — never sign a mismatched domain.
5. A non-owner wallet on `/chog/1425` sees `Signed in, does not own this Chog` and play stays read-only.
6. `Log out` returns the UI to `Connect wallet`.

## 5. Keeping it alive (optional, free)

Render free services sleep after ~15 min idle. For demo day, either:

- ping `https://<service>.onrender.com/api/health` every ~10 minutes from any free uptime monitor (e.g. an UptimeRobot free account) before/while recording the demo, or
- accept the ~1 minute cold start and mention it in the demo.

## 6. Environment checklist

Copy `.env.production.example` and tick every **Required** var. The browser must never see any of them (no `VITE_` prefixes, no secrets in the client bundle). Local production-parity smoke (what the browser verification ran against):

```powershell
$env:DATABASE_URL='postgres://…'; $env:NODE_ENV='production'; $env:SESSION_SECRET='…';
$env:APP_ORIGIN='http://127.0.0.1:8090'; $env:HOST='127.0.0.1'; $env:API_PORT='8090';
node dist-server/main.js
```

## 7. Fallback: Hugging Face Docker Space

1. Create a free Space → SDK **Docker** → blank.
2. Push the repo (it contains the multi-stage `Dockerfile`; runtime exposes `8080`, `API_PORT=8080`, `HOST=0.0.0.0`).
3. Set the same env vars in the Space settings (`DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN=https://<user>.hf.space`, `DB_SSL=true`, `TRUST_PROXY=true` if behind a proxy).
4. `APP_ORIGIN` must again match the public Space URL exactly.

## 8. What is intentionally not in this repo

- No paid-tier config, no purchased domains, no API keys for the chain (the public `https://rpc.monad.xyz` works keyless).
- No holder private keys, ever — sign-in is a free `personal_sign` message only.
- No CI deploy pipeline — deployment is the manual path above (provider CLIs are absent on the build machine).
