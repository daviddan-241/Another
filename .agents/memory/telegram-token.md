---
name: Telegram token whitespace
description: The TELEGRAM_BOT_TOKEN secret was stored with a leading space, causing 404 errors
---

The TELEGRAM_BOT_TOKEN secret in Replit was saved with a leading space character, making the API URL become `/bot%20TOKEN/sendMessage` (404).

**Fix:** Always `.trim()` the token and chat ID when reading from env vars:
```typescript
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
const CHAT_ID   = (process.env.TELEGRAM_CHAT_ID   ?? "").trim();
```

**Why:** Replit's secret input doesn't strip whitespace, so users can accidentally add spaces.
