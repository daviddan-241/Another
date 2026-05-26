import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const PUMP_API = "https://frontend-api-v3.pump.fun";
const TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
const TELEGRAM_CHAT_ID = process.env["TELEGRAM_CHAT_ID"] ?? "";

const sentTelegramIds = new Set<string>();

async function sendTelegram(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
  } catch {
    // silent fail
  }
}

async function pumpFetch(url: string) {
  const resp = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`pump.fun API error: ${resp.status}`);
  return resp.json() as Promise<any[]>;
}

// ── Live coins: is_currently_live AND created < 1hr ago ─────────────────────
router.get("/pumpfun/live", async (req: Request, res: Response) => {
  try {
    const oneHourAgoMs = Date.now() - 60 * 60 * 1000;

    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=200&sort=last_trade_unix_time&order=DESC&includeNsfw=false`
    );

    const liveCoins = data.filter((coin: any) => {
      const createdAtMs = coin.created_timestamp ?? 0;
      return createdAtMs > oneHourAgoMs && coin.is_currently_live === true;
    });

    for (const coin of liveCoins) {
      const id: string = coin.mint;
      if (id && !sentTelegramIds.has(`live:${id}`)) {
        sentTelegramIds.add(`live:${id}`);
        const name = coin.name ?? "Unknown";
        const symbol = coin.symbol ?? "???";
        const pumpLink = `https://pump.fun/${id}`;
        const liveLink = coin.creator
          ? `https://pump.fun/profile/${coin.creator}`
          : pumpLink;
        await sendTelegram(
          `🟢 <b>LIVE COIN ALERT</b>\n` +
            `<b>${name} (${symbol})</b>\n` +
            `📺 <a href="${liveLink}">Watch Livestream</a>\n` +
            `🔗 <a href="${pumpLink}">View on Pump.fun</a>\n` +
            `🕐 Created &lt;1hr ago`
        );
      }
    }

    res.json(liveCoins);
  } catch (err) {
    req.log.error({ err }, "Error fetching live coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Discord coins: has discord link AND created < 6hr ago ───────────────────
router.get("/pumpfun/discord", async (req: Request, res: Response) => {
  try {
    const sixHoursAgoMs = Date.now() - 6 * 60 * 60 * 1000;

    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=200&sort=created_timestamp&order=DESC&includeNsfw=false`
    );

    const discordCoins = data.filter((coin: any) => {
      const createdAtMs = coin.created_timestamp ?? 0;
      return (
        createdAtMs > sixHoursAgoMs &&
        typeof coin.discord === "string" &&
        coin.discord.trim() !== ""
      );
    });

    for (const coin of discordCoins) {
      const id: string = coin.mint;
      if (id && !sentTelegramIds.has(`discord:${id}`)) {
        sentTelegramIds.add(`discord:${id}`);
        const name = coin.name ?? "Unknown";
        const symbol = coin.symbol ?? "???";
        const pumpLink = `https://pump.fun/${id}`;
        await sendTelegram(
          `🟣 <b>NEW DISCORD COIN</b>\n` +
            `<b>${name} (${symbol})</b>\n` +
            `💬 <a href="${coin.discord}">Join Discord</a>\n` +
            `🔗 <a href="${pumpLink}">View on Pump.fun</a>\n` +
            `🕐 Just launched`
        );
      }
    }

    res.json(discordCoins);
  } catch (err) {
    req.log.error({ err }, "Error fetching discord coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Trending coins: top by market cap, no time filter ──────────────────────
router.get("/pumpfun/trending", async (req: Request, res: Response) => {
  try {
    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=50&sort=market_cap&order=DESC&includeNsfw=false`
    );
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Error fetching trending coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Single coin detail ──────────────────────────────────────────────────────
router.get("/pumpfun/coin/:mint", async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;
    const resp = await fetch(`${PUMP_API}/coins/${mint}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      res.status(502).json({ error: "Coin not found" });
      return;
    }
    res.json(await resp.json());
  } catch (err) {
    req.log.error({ err }, "Error fetching coin detail");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Telegram test ───────────────────────────────────────────────────────────
router.post("/pumpfun/telegram-test", async (_req: Request, res: Response) => {
  try {
    await sendTelegram(
      "✅ <b>Pump.fun Scanner connected!</b>\nYour Telegram alerts are working correctly."
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to send test message" });
  }
});

export default router;
