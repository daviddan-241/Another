import { Router } from "express";
import axios from "axios";
import { logger } from "../lib/logger";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const router = Router();

const PUMP_API   = "https://frontend-api-v3.pump.fun";
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const SOL_PRICE_API = "https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112";

const PUMP_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://pump.fun",
  Referer: "https://pump.fun/",
};

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60_000;

function cached(key: string) {
  const e = cache.get(key);
  return e && Date.now() - e.ts < CACHE_TTL ? e.data : null;
}
function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

async function getSolPrice(): Promise<number> {
  const hit = cached("sol_price") as number | null;
  if (hit) return hit;
  try {
    const res = await axios.get(SOL_PRICE_API, { timeout: 5000 });
    const price = (res.data as { data?: { So11111111111111111111111111111111111111112?: { price?: number } } })
      ?.data?.So11111111111111111111111111111111111111112?.price ?? 150;
    setCache("sol_price", price);
    return price;
  } catch { return 150; }
}

async function getSolBalance(wallet: string): Promise<number> {
  const res = await axios.post(SOLANA_RPC, {
    jsonrpc: "2.0", id: 1, method: "getBalance", params: [wallet],
  }, { timeout: 8000 });
  const lamports = (res.data as { result?: { value?: number } }).result?.value ?? 0;
  return lamports / 1e9;
}

interface PumpUserProfile {
  username?: string;
  name?: string;
  profile_image?: string;
  bio?: string;
  followers?: number;
  following?: number;
  twitter?: string;
}

interface PumpCoinLite {
  mint?: string; name?: string; symbol?: string;
  usd_market_cap?: number; market_cap?: number; created_timestamp?: number;
  image_uri?: string;
}

/** Fetch all coins for a wallet using the ?creator= filter (paginated up to 3 pages) */
async function fetchAllDevCoins(wallet: string): Promise<PumpCoinLite[]> {
  const allCoins: PumpCoinLite[] = [];
  const pageSize = 50;

  for (let page = 0; page < 3; page++) {
    try {
      const res = await axios.get(`${PUMP_API}/coins`, {
        params: {
          creator: wallet,
          limit: pageSize,
          offset: page * pageSize,
          includeNsfw: false,
          sort: "created_timestamp",
          order: "DESC",
        },
        headers: PUMP_HEADERS,
        timeout: 10000,
      });

      const raw: PumpCoinLite[] = Array.isArray(res.data)
        ? res.data
        : (res.data as { coins?: PumpCoinLite[] }).coins ?? [];

      allCoins.push(...raw);

      // If we got fewer than pageSize, no more pages
      if (raw.length < pageSize) break;
    } catch {
      break;
    }
  }

  return allCoins;
}

// ── POST /api/dev/me — own profile from private key ─────────────────────────
router.post("/dev/me", async (req, res) => {
  const { privateKey } = req.body as { privateKey?: string };
  if (!privateKey?.trim()) return res.status(400).json({ error: "privateKey required" });

  let keypair: Keypair;
  try {
    keypair = Keypair.fromSecretKey(bs58.decode(privateKey.trim()));
  } catch {
    return res.status(400).json({ error: "Invalid private key — must be base58" });
  }

  const wallet = keypair.publicKey.toBase58();
  const cacheKey = `me:${wallet}`;
  const hit = cached(cacheKey);
  if (hit) return res.json(hit);

  try {
    const [profileRes, coinsRes, balanceRes, solPriceRes] = await Promise.allSettled([
      axios.get(`${PUMP_API}/users/${wallet}`, { headers: PUMP_HEADERS, timeout: 8000 }),
      fetchAllDevCoins(wallet),
      getSolBalance(wallet),
      getSolPrice(),
    ]);

    const profile: PumpUserProfile =
      profileRes.status === "fulfilled" ? (profileRes.value.data as PumpUserProfile) ?? {} : {};

    const rawCoins: PumpCoinLite[] = coinsRes.status === "fulfilled" ? coinsRes.value : [];
    const solBalance = balanceRes.status === "fulfilled" ? balanceRes.value : 0;
    const solPrice   = solPriceRes.status === "fulfilled" ? solPriceRes.value : 150;

    const result = {
      publicKey: wallet,
      username:  profile.username  ?? null,
      name:      profile.name      ?? profile.username ?? null,
      avatar:    profile.profile_image ?? null,
      bio:       profile.bio       ?? null,
      followers: profile.followers ?? 0,
      following: profile.following ?? 0,
      twitter:   profile.twitter   ?? null,
      coinsCreated: rawCoins.length,
      solBalance: Math.round(solBalance * 1_000_000) / 1_000_000,
      solUsd:    Math.round(solBalance * solPrice * 100) / 100,
      recentCoins: rawCoins.slice(0, 10).map((c) => ({
        mint:      c.mint ?? "",
        name:      c.name ?? "Unknown",
        symbol:    c.symbol ?? "???",
        marketCap: c.usd_market_cap ?? c.market_cap ?? 0,
        image:     c.image_uri ?? null,
        createdAt: c.created_timestamp
          ? new Date(c.created_timestamp > 1e12 ? c.created_timestamp : c.created_timestamp * 1000).toISOString()
          : "",
      })),
    };

    setCache(cacheKey, result);
    logger.info({ wallet, username: result.username, solBalance, coinsCreated: result.coinsCreated }, "Own profile loaded");
    return res.json(result);
  } catch (err) {
    logger.warn({ msg: (err as Error).message, wallet }, "Own profile fetch error");
    return res.status(500).json({ error: "Profile fetch failed" });
  }
});

// ── GET /api/dev/:wallet — any wallet profile ─────────────────────────────
router.get("/dev/:wallet", async (req, res) => {
  const { wallet } = req.params;
  if (!wallet || wallet.length < 32) return res.status(400).json({ error: "Invalid wallet" });

  const cacheKey = `dev:${wallet}`;
  const hit = cached(cacheKey);
  if (hit) return res.json(hit);

  try {
    const [profileRes, coinsRes, balanceRes] = await Promise.allSettled([
      axios.get(`${PUMP_API}/users/${wallet}`, { headers: PUMP_HEADERS, timeout: 8000 }),
      fetchAllDevCoins(wallet),
      getSolBalance(wallet),
    ]);

    const profile: PumpUserProfile =
      profileRes.status === "fulfilled" ? (profileRes.value.data as PumpUserProfile) ?? {} : {};

    const rawCoins: PumpCoinLite[] = coinsRes.status === "fulfilled" ? coinsRes.value : [];
    const solBalance = balanceRes.status === "fulfilled" ? balanceRes.value : 0;

    const result = {
      wallet,
      username:  profile.username ?? null,
      name:      profile.name ?? profile.username ?? null,
      avatar:    profile.profile_image ?? null,
      bio:       profile.bio ?? null,
      twitter:   profile.twitter ?? null,
      followers: profile.followers ?? 0,
      coinsCreated: rawCoins.length,
      solBalance: Math.round(solBalance * 1000) / 1000,
      recentCoins: rawCoins.slice(0, 20).map((c) => ({
        mint:      c.mint ?? "",
        name:      c.name ?? "Unknown",
        symbol:    c.symbol ?? "???",
        marketCap: c.usd_market_cap ?? c.market_cap ?? 0,
        image:     c.image_uri ?? null,
        createdAt: c.created_timestamp
          ? new Date(c.created_timestamp > 1e12 ? c.created_timestamp : c.created_timestamp * 1000).toISOString()
          : "",
      })),
    };

    setCache(cacheKey, result);
    return res.json(result);
  } catch (err) {
    req.log.warn({ msg: (err as Error).message, wallet }, "Dev profile fetch error");
    return res.json({ wallet, coinsCreated: 0, solBalance: 0, recentCoins: [] });
  }
});

export default router;
