#!/bin/bash
# Run this once in the Shell tab to push to GitHub
set -e

REPO="https://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@github.com/daviddan-241/Another.git"

git config user.email "build@pumpscan.app"
git config user.name "PumpScan Build"

# Add or update the GitHub remote
git remote remove github 2>/dev/null || true
git remote add github "$REPO"

# Stage everything and commit
git add -A
git commit -m "feat: persist live/discord coins, mobile-first UI, no micro Telegram alerts

- Live coins: merged with DB (last 2h) — streams stay visible after ending
- Discord coins: merged with DB (last 6h) — coins persist across polls
- Micro cap: saved to DB only, no Telegram alerts (Live + Discord only)
- CoinCard: stream-ended badge, grayscale, creation date + time shown
- Mobile: no zoom on inputs (font-size 16px), 44px touch targets, scrollable tabs
- ChatPanel: textarea 16px font prevents iOS zoom
- Telegram: auto-migrates supergroup chat_id on the fly" || echo "Nothing new to commit"

# Push to GitHub
git push github main --force-with-lease || git push github main

echo ""
echo "✅  Pushed to https://github.com/daviddan-241/Another"
