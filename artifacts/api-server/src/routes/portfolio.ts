import { Router } from "express";
import axios from "axios";
import { logger } from "../lib/logger";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const router = Router();

const PUMP_API = "https://frontend-api-v3.pump.fun";
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
// Moralis key from repo (public fallback — same as in GitHub repo)
const MORALIS_SOLANA_URL = "https://solana-gateway.moralis.io/account/mainnet";
const MORALIS_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImZmZGYwZWJkLWZlNGYtNGUyMi04MDgwLWVjNzAxZWNmOWJmYyIsIm9yZ0lkIjoiNTA4OTEzIiwidXNlcklkIjoiNTIzNjIyIiwidHlwZUlkIjoiODk0NGNiNzgtZjg3YS00NDZiLTlkYzctMmE4ZjE4ZDk3MzI1IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzU2ODQ0MjUsImV4cCI6NDkzMTQ0NDQyNX0.dgzOA_cu3qjJtRjjwe25O8-MJAkI00uptxklb27wwfI";

const PUMP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://pump.fun",
  Referer: "https://pump.fun/",
};

function keypairFromPrivateKey(pk: string): Keypair {
  const decoded = bs58.decode(pk.trim());
  return Keypair.fromSecretKey(decoded);
}

// Cache: wallet -> { data, ts }
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 30_000;

function cached(key: string): unknown | null {
  const e = cache.get(key);
  return e && Date.now() - e.ts < TTL ? e.data : null;
}

// ---------------------------------------------------------------------------
// POST /api/wallet/pubkey
// Body: { privateKey }
// Returns: { publicKey }
// ---------------------------------------------------------------------------
router.post("/wallet/pubkey", (req, res) => {
  const { privateKey } = req.body as { privateKey?: string };
  if (!privateKey?.trim()) {
    return res.status(400).json({ error: "privateKey required" });
  }
  try {
    const kp = keypairFromPrivateKey(privateKey);
    return res.json({ publicKey: kp.publicKey.toBase58() });
  } catch {
    return res.status(400).json({ error: "Invalid private key — must be base58 encoded" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/portfolio/:wallet
// Returns pump.fun created coins + pump.fun token holdings
// ---------------------------------------------------------------------------
router.get("/portfolio/:wallet", async (req, res) => {
  const { wallet } = req.params;
  if (!wallet || wallet.length < 32) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  const cacheKey = `portfolio:${wallet}`;
  const hit = cached(cacheKey);
  if (hit) return res.json(hit);

  try {
    const [createdRes, holdingsRes, balanceRes] = await Promise.allSettled([
      axios.get(`${PUMP_API}/coins`, {
        params: { creator: wallet, limit: 50, offset: 0, includeNsfw: true, sort: "created_timestamp", order: "DESC" },
        headers: PUMP_HEADERS,
        timeout: 10000,
      }),
      axios.get(`${PUMP_API}/holdings/by-user/${wallet}`, {
        params: { limit: 50, offset: 0, includeNsfw: true },
        headers: PUMP_HEADERS,
        timeout: 10000,
      }),
      axios.post(
        SOLANA_RPC,
        { jsonrpc: "2.0", id: 1, method: "getBalance", params: [wallet] },
        { timeout: 8000 }
      ),
    ]);

    interface PumpCoin {
      mint?: string;
      name?: string;
      symbol?: string;
      image_uri?: string;
      usd_market_cap?: number;
      market_cap?: number;
      created_timestamp?: number;
      reply_count?: number;
      nsfw?: boolean;
      disable_replies?: boolean;
      king_of_the_hill_timestamp?: number;
    }

    interface PumpHolding {
      mint?: string;
      name?: string;
      symbol?: string;
      image_uri?: string;
      usd_market_cap?: number;
      market_cap?: number;
      balance?: number;
      usd_balance?: number;
    }

    const rawCreated: PumpCoin[] =
      createdRes.status === "fulfilled"
        ? Array.isArray(createdRes.value.data)
          ? createdRes.value.data
          : (createdRes.value.data as { coins?: PumpCoin[] }).coins ?? []
        : [];

    const rawHoldings: PumpHolding[] =
      holdingsRes.status === "fulfilled"
        ? Array.isArray(holdingsRes.value.data)
          ? holdingsRes.value.data
          : (holdingsRes.value.data as { holdings?: PumpHolding[] }).holdings ??
            []
        : [];

    const lamports =
      balanceRes.status === "fulfilled"
        ? ((
            balanceRes.value.data as {
              result?: { value?: number };
            }
          ).result?.value ?? 0)
        : 0;

    const createdCoins = rawCreated.slice(0, 30).map((c) => ({
      mint: c.mint ?? "",
      name: c.name ?? "Unknown",
      symbol: c.symbol ?? "???",
      image: c.image_uri ?? "",
      marketCap: c.usd_market_cap ?? c.market_cap ?? 0,
      createdAt: c.created_timestamp
        ? new Date(
            c.created_timestamp > 1e12
              ? c.created_timestamp
              : c.created_timestamp * 1000
          ).toISOString()
        : "",
      replyCount: c.reply_count ?? 0,
      isGated: !!(c.nsfw || c.disable_replies),
      pumpUrl: `https://pump.fun/${c.mint ?? ""}`,
    }));

    const holdings = rawHoldings
      .filter((h) => h.mint)
      .slice(0, 30)
      .map((h) => ({
        mint: h.mint ?? "",
        name: h.name ?? "Unknown",
        symbol: h.symbol ?? "???",
        image: h.image_uri ?? "",
        marketCap: h.usd_market_cap ?? h.market_cap ?? 0,
        balance: h.balance ?? 0,
        usdValue: h.usd_balance ?? 0,
        pumpUrl: `https://pump.fun/${h.mint ?? ""}`,
      }));

    const result = {
      wallet,
      solBalance: Math.round((lamports / 1e9) * 10000) / 10000,
      createdCoins,
      holdings,
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    logger.info({ wallet, created: createdCoins.length, holdings: holdings.length }, "Portfolio fetched");
    return res.json(result);
  } catch (err) {
    req.log.warn({ msg: (err as Error).message, wallet }, "Portfolio fetch error");
    return res.json({ wallet, solBalance: 0, createdCoins: [], holdings: [] });
  }
});

// ---------------------------------------------------------------------------
// GET /api/holdings/spl/:wallet
// Real SPL token balances via Moralis (merged from GitHub repo pattern)
// ---------------------------------------------------------------------------
router.get("/holdings/spl/:wallet", async (req, res) => {
  const { wallet } = req.params;
  if (!wallet || wallet.length < 32) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  const cacheKey = `spl:${wallet}`;
  const hit = cached(cacheKey);
  if (hit) return res.json(hit);

  try {
    const [balRes, portfolioRes] = await Promise.allSettled([
      axios.post(
        SOLANA_RPC,
        { jsonrpc: "2.0", id: 1, method: "getBalance", params: [wallet] },
        { timeout: 8000 }
      ),
      axios.get(`${MORALIS_SOLANA_URL}/${wallet}/portfolio`, {
        headers: { Accept: "application/json", "X-API-Key": MORALIS_KEY },
        timeout: 12000,
      }),
    ]);

    const lamports =
      balRes.status === "fulfilled"
        ? ((balRes.value.data as { result?: { value?: number } }).result?.value ?? 0)
        : 0;
    const solBalance = lamports / 1e9;

    let solUsdValue: number | null = null;
    let tokens: {
      mint: string; name: string; symbol: string; decimals: number;
      amount: string; usdPrice: number | null; usdValue: number | null; logo: string | null;
    }[] = [];

    if (portfolioRes.status === "fulfilled") {
      const p = portfolioRes.value.data as {
        nativeBalance?: { solana?: string };
        tokens?: {
          mint?: string; associatedTokenAddress?: string;
          name?: string; symbol?: string; decimals?: number;
          amount?: string; usdPrice?: string; usdValue?: string; logo?: string;
        }[];
      };
      solUsdValue = p.nativeBalance?.solana ? parseFloat(p.nativeBalance.solana) : null;
      tokens = (p.tokens ?? [])
        .filter((t) => t.amount && parseFloat(t.amount) > 0)
        .map((t) => ({
          mint: t.mint ?? t.associatedTokenAddress ?? "",
          name: t.name ?? "Unknown",
          symbol: t.symbol ?? "???",
          decimals: t.decimals ?? 0,
          amount: t.amount ?? "0",
          usdPrice: t.usdPrice ? parseFloat(t.usdPrice) : null,
          usdValue: t.usdValue ? parseFloat(t.usdValue) : null,
          logo: t.logo ?? null,
        }))
        .filter((t) => t.usdValue === null || t.usdValue > 0.001);
    }

    const result = { success: true, wallet, solBalance, solUsdValue, tokens };
    cache.set(cacheKey, { data: result, ts: Date.now() });
    logger.info({ wallet, tokens: tokens.length, solBalance }, "SPL holdings fetched");
    return res.json(result);
  } catch (err) {
    req.log.warn({ msg: (err as Error).message, wallet }, "SPL holdings fetch error");
    return res.json({ success: false, wallet, solBalance: 0, solUsdValue: null, tokens: [] });
  }
});

export default router;
