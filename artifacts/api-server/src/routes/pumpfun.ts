import { Router } from "express";
import type { Request, Response } from "express";
import { db, scannedCoins, alertsSent } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

const PUMP_API = "https://frontend-api-v3.pump.fun";
const TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
const TELEGRAM_CHAT_ID = process.env["TELEGRAM_CHAT_ID"] ?? "";

// In-memory fallback for alert dedup (DB is the source of truth when available)
const memAlertIds = new Set<string>();

// ── DB helpers ───────────────────────────────────────────────────────────────
async function hasAlertBeenSent(id: string): Promise<boolean> {
  if (memAlertIds.has(id)) return true;
  try {
    const rows = await db.select({ id: alertsSent.id }).from(alertsSent).where(eq(alertsSent.id, id)).limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function markAlertSent(id: string, mint: string, alertType: string): Promise<void> {
  memAlertIds.add(id);
  try {
    await db.insert(alertsSent).values({ id, mint, alertType }).onConflictDoNothing();
  } catch {
    // DB unavailable — in-memory fallback is fine
  }
}

async function saveCoin(coin: any, category: string): Promise<void> {
  try {
    await db
      .insert(scannedCoins)
      .values({
        mint:             coin.mint,
        name:             coin.name ?? "Unknown",
        symbol:           coin.symbol ?? "???",
        description:      coin.description ?? null,
        imageUri:         coin.image_uri ?? null,
        marketCap:        String(coin.market_cap ?? "0"),
        usdMarketCap:     String(coin.usd_market_cap ?? "0"),
        createdTimestamp: coin.created_timestamp ?? null,
        category,
        isCurrentlyLive:  coin.is_currently_live === true,
        discord:          coin.discord ?? null,
        twitter:          coin.twitter ?? null,
        telegram:         coin.telegram ?? null,
        website:          coin.website ?? null,
        replyCount:       coin.reply_count ?? 0,
        creator:          coin.creator ?? null,
      })
      .onConflictDoUpdate({
        target: scannedCoins.mint,
        set: {
          lastSeenAt:     sql`now()`,
          usdMarketCap:   String(coin.usd_market_cap ?? "0"),
          isCurrentlyLive: coin.is_currently_live === true,
          replyCount:     coin.reply_count ?? 0,
        },
      });
  } catch {
    // Non-fatal — scanner still returns data without DB
  }
}

// ── Telegram ─────────────────────────────────────────────────────────────────
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
    // silent
  }
}

function fmtMcap(n?: number | string | null): string {
  const v = Number(n);
  if (!v || isNaN(v)) return "N/A";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtAge(createdMs: number): string {
  const s = Math.floor((Date.now() - createdMs) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function buildLiveAlert(coin: any): string {
  const pumpLink = `https://pump.fun/${coin.mint}`;
  const liveLink = coin.creator ? `https://pump.fun/profile/${coin.creator}` : pumpLink;
  const extras: string[] = [];
  if (coin.twitter) extras.push(`🐦 <a href="${coin.twitter}">Twitter</a>`);
  if (coin.telegram) extras.push(`✈️ <a href="${coin.telegram}">Telegram</a>`);
  if (coin.website) extras.push(`🌐 <a href="${coin.website}">Website</a>`);
  const replies = coin.reply_count ? ` · 💬 ${coin.reply_count}` : "";
  return (
    `🔴 ━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<b>📺  LIVE STREAM COIN</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💎 <b>${coin.name ?? "Unknown"}</b>  <code>$${coin.symbol ?? "???"}</code>\n` +
    `💰 Market Cap: <b>${fmtMcap(coin.usd_market_cap)}</b>\n` +
    `⏱ Created: <b>${fmtAge(coin.created_timestamp ?? 0)}</b>${replies}\n` +
    (coin.description ? `📝 ${String(coin.description).slice(0, 120).trim()}\n` : "") +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📺 <a href="${liveLink}"><b>▶ Watch Livestream</b></a>\n` +
    `🔗 <a href="${pumpLink}"><b>Open on Pump.fun</b></a>\n` +
    (extras.length ? extras.join("  │  ") + "\n" : "") +
    `━━━━━━━━━━━━━━━━━━━━━━`
  );
}

function buildDiscordAlert(coin: any): string {
  const pumpLink = `https://pump.fun/${coin.mint}`;
  const extras: string[] = [];
  if (coin.twitter) extras.push(`🐦 <a href="${coin.twitter}">Twitter</a>`);
  if (coin.telegram) extras.push(`✈️ <a href="${coin.telegram}">Telegram</a>`);
  if (coin.website) extras.push(`🌐 <a href="${coin.website}">Website</a>`);
  const replies = coin.reply_count ? ` · 💬 ${coin.reply_count}` : "";
  return (
    `🟣 ━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<b>💬  NEW DISCORD COIN</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💎 <b>${coin.name ?? "Unknown"}</b>  <code>$${coin.symbol ?? "???"}</code>\n` +
    `💰 Market Cap: <b>${fmtMcap(coin.usd_market_cap)}</b>\n` +
    `⏱ Launched: <b>${fmtAge(coin.created_timestamp ?? 0)}</b>${replies}\n` +
    (coin.description ? `📝 ${String(coin.description).slice(0, 120).trim()}\n` : "") +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💬 <a href="${coin.discord}"><b>▶ Join Discord</b></a>\n` +
    `🔗 <a href="${pumpLink}"><b>Open on Pump.fun</b></a>\n` +
    (extras.length ? extras.join("  │  ") + "\n" : "") +
    `━━━━━━━━━━━━━━━━━━━━━━`
  );
}

function buildMicroAlert(coin: any): string {
  const pumpLink = `https://pump.fun/${coin.mint}`;
  const extras: string[] = [];
  if (coin.discord) extras.push(`💬 <a href="${coin.discord}">Discord</a>`);
  if (coin.twitter) extras.push(`🐦 <a href="${coin.twitter}">Twitter</a>`);
  if (coin.telegram) extras.push(`✈️ <a href="${coin.telegram}">Telegram</a>`);
  return (
    `💰 ━━━━━━━━━━━━━━━━━━━━━━\n` +
    `<b>🔬  MICRO CAP LAUNCH  &lt;$5K</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💎 <b>${coin.name ?? "Unknown"}</b>  <code>$${coin.symbol ?? "???"}</code>\n` +
    `💰 Market Cap: <b>${fmtMcap(coin.usd_market_cap)}</b>\n` +
    `⏱ Launched: <b>${fmtAge(coin.created_timestamp ?? 0)}</b>\n` +
    (coin.description ? `📝 ${String(coin.description).slice(0, 100).trim()}\n` : "") +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔗 <a href="${pumpLink}"><b>🚀 Ape on Pump.fun</b></a>\n` +
    (extras.length ? extras.join("  │  ") + "\n" : "") +
    `━━━━━━━━━━━━━━━━━━━━━━`
  );
}

// ── Fetch helper ──────────────────────────────────────────────────────────────
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

// ── Routes ────────────────────────────────────────────────────────────────────

// Live coins — currently livestreaming AND <1hr old
router.get("/pumpfun/live", async (req: Request, res: Response) => {
  try {
    const oneHourAgoMs = Date.now() - 60 * 60 * 1000;
    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=200&sort=last_trade_unix_time&order=DESC&includeNsfw=false`
    );
    const coins = (data as any[]).filter(
      (c: any) => (c.created_timestamp ?? 0) > oneHourAgoMs && c.is_currently_live === true
    );
    await Promise.all(
      coins.map(async (coin: any) => {
        await saveCoin(coin, "live");
        const alertId = `live:${coin.mint}`;
        if (!(await hasAlertBeenSent(alertId))) {
          await markAlertSent(alertId, coin.mint, "live");
          await sendTelegram(buildLiveAlert(coin));
        }
      })
    );
    res.json(coins);
  } catch (err) {
    req.log.error({ err }, "Error fetching live coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Discord coins — has Discord link AND <6hr old
router.get("/pumpfun/discord", async (req: Request, res: Response) => {
  try {
    const sixHoursAgoMs = Date.now() - 6 * 60 * 60 * 1000;
    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=200&sort=created_timestamp&order=DESC&includeNsfw=false`
    );
    const coins = (data as any[]).filter(
      (c: any) =>
        (c.created_timestamp ?? 0) > sixHoursAgoMs &&
        typeof c.discord === "string" &&
        c.discord.trim() !== ""
    );
    await Promise.all(
      coins.map(async (coin: any) => {
        await saveCoin(coin, "discord");
        const alertId = `discord:${coin.mint}`;
        if (!(await hasAlertBeenSent(alertId))) {
          await markAlertSent(alertId, coin.mint, "discord");
          await sendTelegram(buildDiscordAlert(coin));
        }
      })
    );
    res.json(coins);
  } catch (err) {
    req.log.error({ err }, "Error fetching discord coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Trending coins — top 50 by market cap
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

// Micro cap coins — under $5K market cap, freshest first
router.get("/pumpfun/micro", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 100), 200);
    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=${limit}&sort=created_timestamp&order=DESC&includeNsfw=false&minMarketCap=0&maxMarketCap=5000`
    );
    const coins = data as any[];
    await Promise.all(
      coins.slice(0, 20).map(async (coin: any) => {
        // Only save & alert the freshest 20 to avoid spam
        await saveCoin(coin, "micro");
        const alertId = `micro:${coin.mint}`;
        if (!(await hasAlertBeenSent(alertId))) {
          await markAlertSent(alertId, coin.mint, "micro");
          await sendTelegram(buildMicroAlert(coin));
        }
      })
    );
    res.json(coins);
  } catch (err) {
    req.log.error({ err }, "Error fetching micro cap coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Saved coins from DB — history of everything we've discovered
router.get("/pumpfun/saved", async (req: Request, res: Response) => {
  try {
    const category = req.query["category"] as string | undefined;
    const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
    const query = db
      .select()
      .from(scannedCoins)
      .orderBy(sql`first_seen_at DESC`)
      .limit(limit);
    const rows = category
      ? await db.select().from(scannedCoins).where(eq(scannedCoins.category, category)).orderBy(sql`first_seen_at DESC`).limit(limit)
      : await query;
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Error fetching saved coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Replies / live chat for a coin
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

// Coin detail
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

// Telegram test
router.post("/pumpfun/telegram-test", async (_req: Request, res: Response) => {
  try {
    await sendTelegram(
      `✅ ━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<b>🤖  PUMP SCANNER ACTIVE</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Your Telegram alerts are working!\n\n` +
      `📺 <b>Live alerts</b> → coins livestreaming &lt;1hr old\n` +
      `💬 <b>Discord alerts</b> → new coins with Discord &lt;6hr old\n` +
      `🔬 <b>Micro cap alerts</b> → fresh launches under $5K market cap\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
