import { Router } from "express";
import type { Request, Response } from "express";
import { db, scannedCoins, alertsSent } from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";

const router = Router();

const PUMP_API = "https://frontend-api-v3.pump.fun";
const TELEGRAM_BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
const TELEGRAM_CHAT_ID = process.env["TELEGRAM_CHAT_ID"] ?? "";

// In-memory short-circuit so we never double-send within the same process
const memAlertIds = new Set<string>();

// Pump browser headers (Cloudflare bypass)
const PUMP_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://pump.fun/",
  Origin: "https://pump.fun",
};

// ── DB helpers ───────────────────────────────────────────────────────────────
// ttlHours = only deduplicate if alert was sent within this window
async function hasAlertBeenSent(id: string, ttlHours: number): Promise<boolean> {
  if (memAlertIds.has(id)) return true;
  try {
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
    const rows = await db
      .select({ id: alertsSent.id })
      .from(alertsSent)
      .where(and(eq(alertsSent.id, id), gt(alertsSent.sentAt, cutoff)))
      .limit(1);
    if (rows.length > 0) {
      memAlertIds.add(id); // cache the result
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function markAlertSent(id: string, mint: string, alertType: string): Promise<void> {
  memAlertIds.add(id);
  try {
    await db
      .insert(alertsSent)
      .values({ id, mint, alertType })
      .onConflictDoUpdate({ target: alertsSent.id, set: { sentAt: sql`now()` } });
  } catch {
    // DB down — in-memory fallback handles dedup within this process
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
    // Non-fatal
  }
}

// ── Telegram ──────────────────────────────────────────────────────────────────
// Auto-migrates chat_id if the group was upgraded to a supergroup
let activeChatId = TELEGRAM_CHAT_ID;

async function sendTelegramTo(chatId: string, message: string): Promise<void> {
  const resp = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    }
  );
  if (!resp.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await resp.json().catch(() => ({}));
    // Auto-migrate: Telegram tells us the new supergroup ID
    const newId: string | undefined = body?.parameters?.migrate_to_chat_id?.toString();
    if (newId) {
      activeChatId = newId;
      // Retry with the new ID immediately
      const retry = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: newId, text: message, parse_mode: "HTML", disable_web_page_preview: false }),
        }
      );
      if (!retry.ok) {
        const rb = await retry.text();
        throw new Error(`Telegram (migrated) ${retry.status}: ${rb.slice(0, 200)}`);
      }
      return;
    }
    const desc: string = (body?.description as string | undefined) ?? JSON.stringify(body).slice(0, 200);
    throw new Error(`Telegram ${resp.status}: ${desc}`);
  }
}

async function sendTelegram(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !activeChatId) return;
  await sendTelegramTo(activeChatId, message);
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
  const desc = coin.description ? `\n📝 ${String(coin.description).slice(0, 80).trim()}` : "";
  const discord = coin.discord ? `\n💬 <a href="${coin.discord}">Discord</a>` : "";
  return (
    `🔴 <b>LIVESTREAM</b>  •  <b>${coin.name ?? "Unknown"}</b>  <code>$${coin.symbol ?? "???"}</code>\n` +
    `💰 ${fmtMcap(coin.usd_market_cap)}  •  ⏱ ${fmtAge(coin.created_timestamp ?? 0)}` +
    desc +
    `\n📺 <a href="${liveLink}">Watch stream</a>  •  <a href="${pumpLink}">pump.fun</a>` +
    discord
  );
}

function buildDiscordAlert(coin: any): string {
  const pumpLink = `https://pump.fun/${coin.mint}`;
  const desc = coin.description ? `\n📝 ${String(coin.description).slice(0, 80).trim()}` : "";
  return (
    `🟣 <b>DISCORD</b>  •  <b>${coin.name ?? "Unknown"}</b>  <code>$${coin.symbol ?? "???"}</code>\n` +
    `💰 ${fmtMcap(coin.usd_market_cap)}  •  ⏱ ${fmtAge(coin.created_timestamp ?? 0)}` +
    desc +
    `\n<a href="${pumpLink}">pump.fun</a>  •  <a href="${coin.discord}">Join Discord</a>`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pumpFetch(url: string): Promise<any> {
  const resp = await fetch(url, {
    headers: PUMP_HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!resp.ok) throw new Error(`pump.fun API ${resp.status}`);
  return resp.json();
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// Live coins — all currently livestreaming + recently ended ones from DB (TTL: 2h dedup)
router.get("/pumpfun/live", async (req: Request, res: Response) => {
  try {
    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=200&sort=last_trade_unix_time&order=DESC&includeNsfw=false`
    );
    const currentLive = (data as any[]).filter((c: any) => c.is_currently_live === true);

    // Save + alert current live coins
    await Promise.all(
      currentLive.map(async (coin: any) => {
        await saveCoin(coin, "live");
        const alertId = `live:${coin.mint}`;
        if (!(await hasAlertBeenSent(alertId, 2))) {
          await markAlertSent(alertId, coin.mint, "live");
          await sendTelegram(buildLiveAlert(coin)).catch((e) =>
            req.log.error({ err: e }, "Telegram send failed")
          );
        }
      })
    );

    // Load recently seen live coins from DB (last 2h) — keeps ended streams visible
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const savedLive = await db
      .select()
      .from(scannedCoins)
      .where(and(eq(scannedCoins.category, "live"), gt(scannedCoins.lastSeenAt, twoHoursAgo)))
      .orderBy(sql`last_seen_at DESC`)
      .limit(100);

    const currentMints = new Set(currentLive.map((c: any) => c.mint as string));
    const endedCoins = savedLive
      .filter((row) => !currentMints.has(row.mint))
      .map((row) => ({
        mint: row.mint,
        name: row.name,
        symbol: row.symbol,
        description: row.description,
        image_uri: row.imageUri,
        created_timestamp: row.createdTimestamp ?? 0,
        usd_market_cap: parseFloat(row.usdMarketCap ?? "0"),
        is_currently_live: false,
        streamEnded: true,
        reply_count: row.replyCount ?? 0,
        creator: row.creator,
        twitter: row.twitter,
        telegram: row.telegram,
        website: row.website,
        discord: row.discord,
      }));

    res.json([...currentLive, ...endedCoins]);
  } catch (err) {
    req.log.error({ err }, "Error fetching live coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Discord coins — has Discord + persisted from DB (TTL: 8h dedup)
router.get("/pumpfun/discord", async (req: Request, res: Response) => {
  try {
    const sixHoursAgoMs = Date.now() - 6 * 60 * 60 * 1000;
    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=200&sort=created_timestamp&order=DESC&includeNsfw=false`
    );
    const currentDiscord = (data as any[]).filter(
      (c: any) =>
        (c.created_timestamp ?? 0) > sixHoursAgoMs &&
        typeof c.discord === "string" &&
        c.discord.trim() !== ""
    );

    // Save + alert current discord coins
    await Promise.all(
      currentDiscord.map(async (coin: any) => {
        await saveCoin(coin, "discord");
        const alertId = `discord:${coin.mint}`;
        if (!(await hasAlertBeenSent(alertId, 8))) {
          await markAlertSent(alertId, coin.mint, "discord");
          await sendTelegram(buildDiscordAlert(coin)).catch((e) =>
            req.log.error({ err: e }, "Telegram send failed")
          );
        }
      })
    );

    // Load persisted discord coins from DB (last 6h) so they stay visible
    const sixHoursAgo = new Date(sixHoursAgoMs);
    const savedDiscord = await db
      .select()
      .from(scannedCoins)
      .where(and(eq(scannedCoins.category, "discord"), gt(scannedCoins.firstSeenAt, sixHoursAgo)))
      .orderBy(sql`first_seen_at DESC`)
      .limit(200);

    const currentMints = new Set(currentDiscord.map((c: any) => c.mint as string));
    const dbOnly = savedDiscord
      .filter((row) => !currentMints.has(row.mint))
      .map((row) => ({
        mint: row.mint,
        name: row.name,
        symbol: row.symbol,
        description: row.description,
        image_uri: row.imageUri,
        created_timestamp: row.createdTimestamp ?? 0,
        usd_market_cap: parseFloat(row.usdMarketCap ?? "0"),
        is_currently_live: false,
        discord: row.discord,
        reply_count: row.replyCount ?? 0,
        creator: row.creator,
        twitter: row.twitter,
        telegram: row.telegram,
        website: row.website,
      }));

    res.json([...currentDiscord, ...dbOnly]);
  } catch (err) {
    req.log.error({ err }, "Error fetching discord coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Trending — top 50 by market cap  (no Telegram alerts)
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

// Micro cap — under $5K, freshest first  (TTL: 1h dedup)
router.get("/pumpfun/micro", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 100), 200);
    const data = await pumpFetch(
      `${PUMP_API}/coins?limit=${limit}&sort=created_timestamp&order=DESC&includeNsfw=false&minMarketCap=0&maxMarketCap=5000`
    );
    const coins = data as any[];
    // Save micro coins to DB only — no Telegram alerts for micro cap
    await Promise.all(
      coins.slice(0, 30).map((coin: any) => saveCoin(coin, "micro"))
    );
    res.json(coins);
  } catch (err) {
    req.log.error({ err }, "Error fetching micro cap coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Saved coins from DB
router.get("/pumpfun/saved", async (req: Request, res: Response) => {
  try {
    const category = req.query["category"] as string | undefined;
    const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
    const rows = category
      ? await db
          .select()
          .from(scannedCoins)
          .where(eq(scannedCoins.category, category))
          .orderBy(sql`first_seen_at DESC`)
          .limit(limit)
      : await db.select().from(scannedCoins).orderBy(sql`first_seen_at DESC`).limit(limit);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Error fetching saved coins");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Replies — live comment feed for a coin
router.get("/pumpfun/coin/:mint/replies", async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;
    const limit = Math.min(Number(req.query["limit"] ?? 50), 100);
    const offset = Number(req.query["offset"] ?? 0);
    const resp = await fetch(
      `${PUMP_API}/replies?mint=${mint}&limit=${limit}&offset=${offset}`,
      { headers: PUMP_HEADERS, signal: AbortSignal.timeout(10000) }
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

// Proxy: pump.fun wallet auth (avoids CORS from browser)
router.post("/pumpfun/auth", async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PUMP_API}/auth`, {
      method: "POST",
      headers: { ...PUMP_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(10000),
    });
    const text = await resp.text();
    res.status(resp.status).set("Content-Type", "application/json").send(text);
  } catch (err) {
    req.log.error({ err }, "pump.fun auth proxy error");
    res.status(502).json({ error: "Auth proxy failed" });
  }
});

// Proxy: post a reply on pump.fun (avoids CORS from browser)
router.post("/pumpfun/coin/:mint/reply", async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;
    const { text, jwt } = req.body as { text: string; jwt: string };
    if (!text?.trim() || !jwt) {
      res.status(400).json({ error: "text and jwt are required" });
      return;
    }
    const resp = await fetch(`${PUMP_API}/replies`, {
      method: "POST",
      headers: {
        ...PUMP_HEADERS,
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ mint, text: text.trim() }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await resp.text();
    res.status(resp.status).set("Content-Type", "application/json").send(body);
  } catch (err) {
    req.log.error({ err }, "pump.fun reply proxy error");
    res.status(502).json({ error: "Reply proxy failed" });
  }
});

// Coin detail
router.get("/pumpfun/coin/:mint", async (req: Request, res: Response) => {
  try {
    const { mint } = req.params;
    const resp = await fetch(`${PUMP_API}/coins/${mint}`, {
      headers: PUMP_HEADERS,
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

// Telegram test — sends a rich test message
router.post("/pumpfun/telegram-test", async (req: Request, res: Response) => {
  try {
    await sendTelegram(
      `✅ ━━━━━━━━━━━━━━━━━━━━━━\n` +
      `<b>🤖  PUMP SCANNER ACTIVE</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Your Telegram alerts are working! 🎉\n\n` +
      `📺 <b>Live alerts</b> → coins livestreaming &lt;1hr old\n` +
      `💬 <b>Discord alerts</b> → new coins with Discord &lt;6hr old\n` +
      `🔬 <b>Micro cap alerts</b> → fresh launches under <b>$5K</b>\n\n` +
      `⚡ <i>New coins alert within 1 hour of launch</i>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━`
    );
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Telegram test failed");
    res.status(500).json({ error: "Telegram send failed — check BOT_TOKEN and CHAT_ID" });
  }
});

export default router;
