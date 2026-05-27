---
name: Telegram supergroup migration
description: When a Telegram group is upgraded to a supergroup, the chat_id changes and sendMessage fails with migrate_to_chat_id in parameters
---

When a Telegram group is upgraded to a supergroup, `sendMessage` returns HTTP 400 with `parameters.migrate_to_chat_id` in the JSON body.

**Rule:** `sendTelegram` in pumpfun.ts uses an `activeChatId` variable (not hardcoded env var) and auto-retries with the new ID on migration error.

**Why:** The TELEGRAM_CHAT_ID secret can't be updated programmatically (Replit secrets are read-only from agent). The server self-heals at runtime instead.

**How to apply:** Any new Telegram-sending code should call the shared `sendTelegram()` helper, never call the API directly with `process.env.TELEGRAM_CHAT_ID`.
