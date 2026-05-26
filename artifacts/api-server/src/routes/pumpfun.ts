import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const PUMP_API = "https://frontend-api-v3.pump.fun";
const TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
const TELEGRAM_CHAT_ID = process.env["TELEGRAM_CHAT_ID"] ?? "";

const sentTelegramIds = new Set<string>();

// ── Telegram ────────────────────────────────────────────────────────────────
async function sendTelegram(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });
  } catch {
    // silent fail
  }
}

function fmtMcap(n?: number): string {
  if (!n) return "N/A";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtAge(createdMs: number): string {
  const s = Math.floor((Date.now() - createdMs) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function buildLiveAlert(coin: any): string {
  const name = coin.name ?? "Unknown";
  const symbol = coin.symbol ?? "???";
  const mcap = fmtMcap(coin.usd_market_cap ?? coin.market_cap);
  const age = fmtAge(coin.created_timestamp ?? 0);
  const replies = coin.reply_count ? ` │ 💬 ${coin.reply_count} replies` : "";
  const pumpLink = `https://pump.fun/${coin.mint}`;
  const liveLink = coin.creator ? `https://pump.fun/profile/${coin.creator}` : pumpLink;
  const extras: string[] = [];
  if (coin.twitter) extras.push(`🐦 <a href="${coin.twitter}">Twitter</a>`);
  if (coin.telegram) extras.push(`✈️ <a href="${coin.telegram}">Telegram</a>`);
  if (coin.website) extras.push(`🌐 <a href="${coin.website}">Website</a>`);

  return (
    `🔴 ━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<b>📺  LIVE STREAM COIN</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💎 <b>${name}</b>  <code>$${symbol}</code>\n` +
    `💰 Market Cap: <b>${mcap}</b>\n` +
    `⏱ Created: <b>${age}</b>${replies}\n` +
    (coin.description ? `📝 ${coin.description.slice(0, 120).trim()}\n` : "") +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📺 <a href="${liveLink}"><b>▶ Watch Livestream</b></a>\n` +
    `🔗 <a href="${pumpLink}"><b>Open on Pump.fun</b></a>\n` +
    (extras.length ? extras.join("  │  ") + "\n" : "") +
    `━━━━━━━━━━━━━━━━━━━━━━`
  );
}

function buildDiscordAlert(coin: any): string {
  const name = coin.name ?? "Unknown";
  const symbol = coin.symbol ?? "???";
  const mcap = fmtMcap(coin.usd_market_cap ?? coin.market_cap);
  const age = fmtAge(coin.created_timestamp ?? 0);
  const replies = coin.reply_count ? ` │ 💬 ${coin.reply_count}` : "";
  const pumpLink = `https://pump.fun/${coin.mint}`;
  const extras: string[] = [];
  if (coin.twitter) extras.push(`🐦 <a href="${coin.twitter}">Twitter</a>`);
  if (coin.telegram) extras.push(`✈️ <a href="${coin.telegram}">Telegram</a>`);
  if (coin.website) extras.push(`🌐 <a href="${coin.website}">Website</a>`);

  return (
    `🟣 ━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<b>💬  NEW DISCORD COIN</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💎 <b>${name}</b>  <code>$${symbol}</code>\n` +
    `💰 Market Cap: <b>${mcap}</b>\n` +
    `⏱ Launched: <b>${age}</b>${replies}\n` +
    (coin.description ? `📝 ${coin.description.slice(0, 120).trim()}\n` : "") +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💬 <a href="${coin.discord}"><b>▶ Join Discord</b></a>\n` +
    `🔗 <a href="${pumpLink}"><b>Open on Pump.fun</b></a>\n` +
    (extras.length ? extras.join("  │  ") + "\n" : "") +
    `━━━━━━━━━━━━━━━━━━━━━━`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pumpFetch(url: string): Promise<any> {
  const resp = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: "https://pump.fun/",
      Origin: "https://pump.fun",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`pump.fun API ${resp.status}`);
  return resp.json();
}

// ── Live coins ──────────────────────────────────────────────────────────────
router.get("/pumpfun/live", async (req: Request, res: Response) => {
  try {
    const oneHourAgoMs = Date.now() - 60 * 60 * 1000;
    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=200&sort=last_trade_unix_time&order=DESC&includeNsfw=false`
    );
    const liveCoins = data.filter(
      (c: any) => (c.created_timestamp ?? 0) > oneHourAgoMs && c.is_currently_live === true
    );
    for (const coin of liveCoins) {
      if (coin.mint && !sentTelegramIds.has(`live:${coin.mint}`)) {
        sentTelegramIds.add(`live:${coin.mint}`);
        await sendTelegram(buildLiveAlert(coin));
      }
    }
    res.json(liveCoins);
  } catch (err) {
    req.log.error({ err }, "Error fetching live coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Discord coins ───────────────────────────────────────────────────────────
router.get("/pumpfun/discord", async (req: Request, res: Response) => {
  try {
    const sixHoursAgoMs = Date.now() - 6 * 60 * 60 * 1000;
    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=200&sort=created_timestamp&order=DESC&includeNsfw=false`
    );
    const discordCoins = data.filter(
      (c: any) =>
        (c.created_timestamp ?? 0) > sixHoursAgoMs &&
        typeof c.discord === "string" &&
        c.discord.trim() !== ""
    );
    for (const coin of discordCoins) {
      if (coin.mint && !sentTelegramIds.has(`discord:${coin.mint}`)) {
        sentTelegramIds.add(`discord:${coin.mint}`);
        await sendTelegram(buildDiscordAlert(coin));
      }
    }
    res.json(discordCoins);
  } catch (err) {
    req.log.error({ err }, "Error fetching discord coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Trending coins ──────────────────────────────────────────────────────────
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

// ── Replies / chat for a coin ───────────────────────────────────────────────
router.get("/pumpfun/coin/:mint/replies", async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;
    const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
    const offset = Number(req.query["offset"] ?? 0);
    const resp = await fetch(
      `${PUMP_API}/replies?mint=${mint}&limit=${limit}&offset=${offset}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Referer: "https://pump.fun/",
          Origin: "https://pump.fun",
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!resp.ok) {
      res.status(502).json({ error: "Failed to fetch replies" });
      return;
    }
    const text = await resp.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any[] = [];
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) data = parsed;
    } catch {
      data = [];
    }
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Error fetching replies");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Coin detail ─────────────────────────────────────────────────────────────
router.get("/pumpfun/coin/:mint", async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;
    const resp = await fetch(`${PUMP_API}/coins/${mint}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://pump.fun/",
      },
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
      `✅ ━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<b>🤖  PUMP SCANNER ACTIVE</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Your Telegram alerts are working!\n\n` +
      `📺 <b>Live alerts</b> → coins livestreaming &lt;1hr old\n` +
      `💬 <b>Discord alerts</b> → new coins with Discord &lt;6hr old\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
