---
name: pump.fun API patterns
description: Working endpoints and headers for the pump.fun API
---

## Working endpoints
- Main API: `https://frontend-api-v3.pump.fun` (v1 and v2 return Cloudflare 530/1016)
- Real-time new coins: `wss://pumpportal.fun/api/data` — subscribe with `{ method: "subscribeNewToken" }`
- Chat/replies: `GET https://frontend-api-v3.pump.fun/replies/{mint}?limit=100&offset=0`
- Post reply: `POST https://frontend-api-v3.pump.fun/reply` with `{ mint, text }` + auth header
- Chat iframe: `https://chat-api-v1.pump.fun/invites/coin/{mint}`

## Required headers
```
User-Agent: Mozilla/5.0 Chrome/124...
Accept: application/json
Origin: https://pump.fun
Referer: https://pump.fun/
```

## Key fields
- `is_currently_live` (bool) — active livestream
- `usd_market_cap` — market cap in USD
- `created_timestamp` — milliseconds since epoch
- Discord links found in: description, website, twitter, telegram fields

## Auth for posting
pump.fun uses Privy for browser auth. For server-side, we sign with Solana Keypair (bs58 private key) and encode as base64 JSON `{ publicKey, signature }` for the Authorization Bearer token.

## Lock/unlock
`POST https://frontend-api-v3.pump.fun/coins/{mint}/set-nsfw` with `{ disable_replies: true/false }` — requires creator's auth token.
