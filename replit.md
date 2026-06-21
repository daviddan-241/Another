# PumpRadar

Real-time pump.fun coin scanner — finds livestream and Discord-active coins, shows live chat, tracks dev wallets and portfolios, and fires Telegram alerts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/pump-scanner run dev` — run the frontend (port 5000)
- `pnpm run build:render` — production build (frontend + backend, BASE_PATH=/)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 20+, TypeScript 5.9
- Frontend: React + Vite (port 5000 in dev)
- API: Express 5 (port 8080 in dev, 10000 on Render)
- No database — all data is fetched live from pump.fun APIs
- Build: esbuild (ESM bundle)

## Where things live

- `artifacts/pump-scanner/` — React + Vite frontend
- `artifacts/api-server/` — Express backend
- `artifacts/api-server/src/routes/` — all API routes
- `artifacts/api-server/src/lib/scanner.ts` — the coin scanner loop
- `artifacts/api-server/src/lib/telegram.ts` — Telegram alerting
- `render.yaml` — Render deployment config (single web service)

## Architecture decisions

- **Single Render service**: the backend Express app serves the built frontend as static files from `artifacts/pump-scanner/dist/public`. No separate static hosting needed.
- **No database**: all state is in-memory (scanner coin list, caches). Resets on each deploy — intentional for simplicity.
- **pump.fun API**: uses `frontend-api-v3.pump.fun`. Chat requires auth via Solana keypair signature (`Authorization: Bearer <base64-token>`). Private key stored in browser session only, never persisted.
- **Dev coins endpoint**: `/coins?creator={wallet}` (was `/coins/user-created-coins/{wallet}` — now 404).
- **Chat endpoints**: `GET /chat/{mint}` with Bearer auth for reading; `POST /chat` for writing (with `/reply` fallback).

## Product

- Scans pump.fun every 15s for coins with active livestreams or Discord chat
- Per-coin status polling every 30s; stream-ended coins kept for 1 hour
- Chat view per coin (requires wallet connection for auth)
- Developer profile page with coin history and portfolio
- Telegram alerts on new coin detection
- Settings page: private key, Telegram config

## User preferences

- Push all changes to GitHub repo `daviddan-241/Another` (main branch)
- Deploy target: Render (free tier, single web service)

## Render Deployment

1. Go to https://render.com → New → Web Service → Connect GitHub repo `daviddan-241/Another`
2. Render will auto-detect `render.yaml` — just click **Deploy**
3. Set these env vars in the Render dashboard (optional):
   - `PRIVATE_KEY` — base58 Solana private key (enables server-side chat auth)
   - `TELEGRAM_BOT_TOKEN` — for Telegram alerts
   - `TELEGRAM_CHAT_ID` — Telegram chat ID to send alerts to
   - `VAPID_PUBLIC_KEY` — Web Push public key (generate once with `node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k))"`)
   - `VAPID_PRIVATE_KEY` — Web Push private key (same command as above)
   - `VAPID_EMAIL` — Contact email for push (default: `mailto:admin@pumpradar.app`)
   - **Important**: VAPID keys must be stable — if not set, new random keys are generated each restart and all subscribers lose their push subscriptions
4. Health check is at `/api/healthz`

## Gotchas

- Always rebuild backend after route changes: `pnpm --filter @workspace/api-server run build`
- pump.fun chat requires wallet auth — without a private key, chat shows a "Connect wallet" message with a link to pump.fun
- The `pnpm-lock.yaml` must stay committed for Render's `--no-frozen-lockfile` to resolve correctly
- Render free tier spins down after 15 min of inactivity — first request after sleep takes ~30s

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
