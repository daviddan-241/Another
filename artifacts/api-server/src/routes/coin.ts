import { Router } from "express";
import axios from "axios";
import { logger } from "../lib/logger";

const router = Router();

const PUMP_API = "https://frontend-api-v3.pump.fun";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://pump.fun",
  Referer: "https://pump.fun/",
};

// Short TTL cache: 15s so MC feels live
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 15_000;

function cached(key: string): unknown | null {
  const e = cache.get(key);
  return e && Date.now() - e.ts < TTL ? e.data : null;
}

// GET /api/coin/:mint
// Returns live coin details: name, symbol, marketCap, replyCount, isGated, is_currently_live
router.get("/coin/:mint", async (req, res) => {
  const { mint } = req.params;
  if (!mint || mint.length < 32) {
    return res.status(400).json({ error: "Invalid mint address" });
  }

  const hit = cached(`coin:${mint}`);
  if (hit) return res.json(hit);

  try {
    const r = await axios.get(`${PUMP_API}/coins/${mint}`, {
      headers: HEADERS,
      timeout: 8000,
    });

    const c = r.data as {
      mint?: string;
      name?: string;
      symbol?: string;
      usd_market_cap?: number;
      market_cap?: number;
      reply_count?: number;
      nsfw?: boolean;
      disable_replies?: boolean;
      is_currently_live?: boolean;
      description?: string;
      image_uri?: string;
      creator?: string;
      created_timestamp?: number;
      website?: string;
      twitter?: string;
      telegram?: string;
    };

    const result = {
      mint: c.mint ?? mint,
      name: c.name ?? "Unknown",
      symbol: c.symbol ?? "???",
      marketCap: c.usd_market_cap ?? c.market_cap ?? 0,
      replyCount: c.reply_count ?? 0,
      isGated: !!(c.nsfw || c.disable_replies),
      isLive: !!c.is_currently_live,
      description: (c.description ?? "").slice(0, 300),
      image: c.image_uri ?? "",
      creator: c.creator ?? "",
      pumpUrl: `https://pump.fun/coin/${mint}`,
    };

    cache.set(`coin:${mint}`, { data: result, ts: Date.now() });
    logger.info({ mint, mc: result.marketCap }, "Coin detail fetched");
    return res.json(result);
  } catch (err) {
    const axErr = err as { response?: { status?: number } };
    req.log.warn({ mint, msg: (err as Error).message }, "Coin detail fetch error");
    return res.status(axErr.response?.status ?? 500).json({ error: "Failed to fetch coin" });
  }
});

export default router;
