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

router.get("/pumpfun/live", async (req: Request, res: Response) => {
  try {
    // created_timestamp is in milliseconds from this API
    const oneHourAgoMs = Date.now() - 60 * 60 * 1000;

    const resp = await fetch(
      `${PUMP_API}/coins?limit=50&sort=last_trade_unix_time&order=DESC&includeNsfw=false`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!resp.ok) {
      res.status(502).json({ error: "Failed to fetch from pump.fun API" });
      return;
    }

    const data = (await resp.json()) as any[];

    const liveCoins = data.filter((coin: any) => {
      const createdAtMs = coin.created_timestamp ?? 0;
      const isRecent = createdAtMs > oneHourAgoMs;
      const isLive = coin.is_currently_live === true;
      return isRecent && isLive;
    });

    for (const coin of liveCoins) {
      const id = coin.mint;
      if (id && !sentTelegramIds.has(`live:${id}`)) {
        sentTelegramIds.add(`live:${id}`);
        const name = coin.name ?? "Unknown";
        const symbol = coin.symbol ?? "???";
        const pumpLink = `https://pump.fun/${id}`;
        const liveLink = coin.creator
          ? `https://pump.fun/profile/${coin.creator}`
          : pumpLink;
        const msg =
          `🟢 <b>LIVE COIN ALERT</b>\n` +
          `<b>${name} (${symbol})</b>\n` +
          `📺 <a href="${liveLink}">Watch Livestream</a>\n` +
          `🔗 <a href="${pumpLink}">View on Pump.fun</a>\n` +
          `🕐 Created &lt;1hr ago`;
        await sendTelegram(msg);
      }
    }

    res.json(liveCoins);
  } catch (err) {
    req.log.error({ err }, "Error fetching live coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pumpfun/discord", async (req: Request, res: Response) => {
  try {
    const oneHourAgoMs = Date.now() - 60 * 60 * 1000;

    const resp = await fetch(
      `${PUMP_API}/coins?limit=50&sort=created_timestamp&order=DESC&includeNsfw=false`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!resp.ok) {
      res.status(502).json({ error: "Failed to fetch from pump.fun API" });
      return;
    }

    const data = (await resp.json()) as any[];

    const discordCoins = data.filter((coin: any) => {
      const createdAtMs = coin.created_timestamp ?? 0;
      const isRecent = createdAtMs > oneHourAgoMs;
      const hasDiscord = Boolean(coin.discord && coin.discord.trim() !== "");
      return isRecent && hasDiscord;
    });

    for (const coin of discordCoins) {
      const id = coin.mint;
      if (id && !sentTelegramIds.has(`discord:${id}`)) {
        sentTelegramIds.add(`discord:${id}`);
        const name = coin.name ?? "Unknown";
        const symbol = coin.symbol ?? "???";
        const pumpLink = `https://pump.fun/${id}`;
        const discordLink = coin.discord;
        const msg =
          `🟣 <b>NEW DISCORD COIN</b>\n` +
          `<b>${name} (${symbol})</b>\n` +
          `💬 <a href="${discordLink}">Join Discord</a>\n` +
          `🔗 <a href="${pumpLink}">View on Pump.fun</a>\n` +
          `🕐 Just launched`;
        await sendTelegram(msg);
      }
    }

    res.json(discordCoins);
  } catch (err) {
    req.log.error({ err }, "Error fetching discord coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/pumpfun/coin/:mint", async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;
    const resp = await fetch(`${PUMP_API}/coins/${mint}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      res.status(502).json({ error: "Coin not found" });
      return;
    }

    const coin = await resp.json();
    res.json(coin);
  } catch (err) {
    req.log.error({ err }, "Error fetching coin detail");
    res.status(500).json({ error: "Internal server error" });
  }
});

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
