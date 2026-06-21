import axios from "axios";
import { logger } from "./logger";

export type Platform = string; // "pump.fun", "raydium", "flap.sh", "four.meme", "bonk.fun", etc.

export interface ScannedCoin {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  marketCap: number;
  createdAt: string;
  ageMinutes: number;
  hasLivestream: boolean;
  hasDiscord: boolean;
  discordUrl: string;
  livestreamUrl: string;
  pumpUrl: string;
  chatUrl: string;
  seenAt: string;
  type: "livestream" | "discord";
  creator: string;
  replyCount: number;
  streamEnded: boolean;
  streamEndedAt: string | null;
  platform: Platform;
}

export interface ScannerStats {
  totalScanned: number;
  livestreamCoins: number;
  discordCoins: number;
  under5kMc: number;
  lastScanAt: string;
}

const PUMP_API        = "https://frontend-api-v3.pump.fun";
const DEXSCREENER_API = "https://api.dexscreener.com";
const GECKO_API       = "https://api.geckoterminal.com/api/v2";
const BIRDEYE_API     = "https://public-api.birdeye.so";
const FOURMEME_API    = "https://four.meme/meme-api/v1";

// Both tabs enforce <$5k MC (HARD CAP — applies to every source)
const MAX_MC_LIVESTREAM         = 5_000;
const MAX_MC_DISCORD            = 5_000;
const MAX_AGE_DISCORD_MINUTES   = 60;   // 1 h window for newly-created Discord coins
const MAX_AGE_LIVESTREAM_MINUTES = 60;  // 1 h window for livestream coins too
const STREAM_ENDED_TTL_MS       = 60 * 60 * 1000;
const DISCORD_TTL_MS            = 3  * 60 * 60 * 1000;

const BIRDEYE_API_KEY = (process.env.BIRDEYE_API_KEY ?? "").trim();

// Networks we ask GeckoTerminal for new pools on.
// Add/remove freely — anything DexScreener doesn't already see in its
// token-profiles feed will be picked up here.
const GECKO_NETWORKS = ["solana", "eth", "bsc", "base", "arbitrum", "polygon_pos", "avax"];

const DISCORD_RE = /https?:\/\/(discord\.gg|discord\.com\/invite)\/[^\s"')>,]+/i;

const PUMP_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:            "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Origin:            "https://pump.fun",
  Referer:           "https://pump.fun/",
};

const GENERIC_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:       "application/json",
};

// ─── State ────────────────────────────────────────────────────────────────────

const coinStore = new Map<string, ScannedCoin>();

let stats: ScannerStats = {
  totalScanned:  0,
  livestreamCoins: 0,
  discordCoins:  0,
  under5kMc:     0,
  lastScanAt:    "",
};

let scannerRunning  = false;
let scanInterval:       ReturnType<typeof setInterval> | null = null;
let liveCheckInterval:  ReturnType<typeof setInterval> | null = null;
let telegramCallback:   ((coin: ScannedCoin) => void) | null = null;
let wsCallback:         ((coin: ScannedCoin) => void) | null = null;
let streamEndedCallback:((coin: ScannedCoin) => void) | null = null;

export function onNewCoin(cb: (coin: ScannedCoin) => void)      { telegramCallback    = cb; }
export function onNewCoinWs(cb: (coin: ScannedCoin) => void)    { wsCallback          = cb; }
export function onStreamEnded(cb: (coin: ScannedCoin) => void)  { streamEndedCallback = cb; }

// ─── Public reads ─────────────────────────────────────────────────────────────

export function getCoins(type?: string, limit = 100): ScannedCoin[] {
  let coins = Array.from(coinStore.values());

  if (type === "livestream") {
    // pump.fun only, must be <$5k MC AND <1h old (or MC unknown)
    coins = coins.filter((c) =>
      c.hasLivestream &&
      (c.marketCap <= MAX_MC_LIVESTREAM || c.marketCap === 0) &&
      c.ageMinutes <= MAX_AGE_LIVESTREAM_MINUTES
    );
  } else if (type === "discord") {
    // Any platform, must have real Discord link, <$5k MC
    coins = coins.filter((c) => c.hasDiscord && !c.hasLivestream && (c.marketCap <= MAX_MC_DISCORD || c.marketCap === 0));
  }

  coins.sort((a, b) => {
    if (a.streamEnded !== b.streamEnded) return a.streamEnded ? 1 : -1;
    return new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime();
  });
  return coins.slice(0, limit);
}

export function getStats(): ScannerStats { return { ...stats }; }
export function isRunning(): boolean     { return scannerRunning; }

// ─── URL helpers ──────────────────────────────────────────────────────────────

function coinViewUrl(mint: string, platform: Platform): string {
  switch (platform) {
    case "pump.fun":   return `https://pump.fun/coin/${mint}`;
    case "flap.sh":    return `https://flap.sh/token/${mint}`;
    case "four.meme":  return `https://four.meme/token/${mint}`;
    case "bonk.fun":   return `https://bonk.fun/meme/${mint}`;
    case "moonshot":   return `https://moonshot.money/${mint}`;
    default:           return `https://dexscreener.com/search?q=${mint}`;
  }
}

function coinChatUrl(mint: string, platform: Platform): string {
  if (platform === "pump.fun") return `https://chat-api-v1.pump.fun/invites/coin/${mint}`;
  return coinViewUrl(mint, platform);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageInMinutes(ts: number): number {
  const ms = ts > 1e12 ? ts : ts * 1000;
  return (Date.now() - ms) / 60_000;
}

function extractDiscord(...fields: string[]): string | null {
  const m = fields.join(" ").match(DISCORD_RE);
  return m ? m[0] : null;
}

function platformFromDexChain(chainId: string, dexId: string): Platform {
  const d = dexId.toLowerCase();
  if (d.includes("pumpfun") || d.includes("pump.fun")) return "pump.fun";
  if (d.includes("flap"))     return "flap.sh";
  if (d.includes("four") || d.includes("4meme")) return "four.meme";
  if (d.includes("bonk"))     return "bonk.fun";
  if (d.includes("raydium"))  return "raydium";
  if (d.includes("meteora"))  return "meteora";
  if (d.includes("orca"))     return "orca";
  if (d.includes("moonshot")) return "moonshot";
  if (d.includes("pancake"))  return "pancakeswap";
  if (chainId === "bsc")      return dexId || "bsc-dex";
  return dexId || "solana-dex";
}

// ─── Coin builder / emitter ───────────────────────────────────────────────────

function buildCoin(opts: {
  mint: string; name: string; symbol: string; description: string; image: string;
  marketCap: number; createdTimestamp: number; hasLivestream: boolean;
  discordUrl: string; creator: string; replyCount: number; platform: Platform;
}): ScannedCoin {
  const age = ageInMinutes(opts.createdTimestamp);
  return {
    mint:         opts.mint,
    name:         opts.name    || "Unknown",
    symbol:       opts.symbol  || "???",
    description:  opts.description.slice(0, 200),
    image:        opts.image,
    marketCap:    opts.marketCap,
    createdAt:    new Date(opts.createdTimestamp > 1e12 ? opts.createdTimestamp : opts.createdTimestamp * 1000).toISOString(),
    ageMinutes:   Math.round(age),
    hasLivestream: opts.hasLivestream,
    hasDiscord:   !!opts.discordUrl,
    discordUrl:   opts.discordUrl,
    livestreamUrl: opts.hasLivestream ? coinViewUrl(opts.mint, opts.platform) : "",
    pumpUrl:      coinViewUrl(opts.mint, opts.platform),
    chatUrl:      coinChatUrl(opts.mint, opts.platform),
    seenAt:       new Date().toISOString(),
    type:         opts.hasLivestream ? "livestream" : "discord",
    creator:      opts.creator,
    replyCount:   opts.replyCount,
    streamEnded:  false,
    streamEndedAt: null,
    platform:     opts.platform,
  };
}

function emitCoin(coin: ScannedCoin, mcRaw: number) {
  coinStore.set(coin.mint, coin);
  if (coin.hasLivestream) stats.livestreamCoins++;
  else                    stats.discordCoins++;
  stats.totalScanned++;
  if (mcRaw > 0 && mcRaw < 5000) stats.under5kMc++;
  logger.info({ mint: coin.mint, name: coin.name, mc: mcRaw, platform: coin.platform }, "New coin");
  telegramCallback?.(coin);
  wsCallback?.(coin);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUMP.FUN scanner (native REST API)
// ─────────────────────────────────────────────────────────────────────────────

interface PumpCoin {
  mint: string; name: string; symbol: string;
  description?: string; image_uri?: string;
  usd_market_cap?: number; market_cap?: number;
  created_timestamp?: number;
  website?: string; twitter?: string; telegram?: string;
  is_currently_live?: boolean;
  creator?: string; reply_count?: number;
}

function processPumpLiveCoin(c: PumpCoin): void {
  const mint  = c.mint;
  if (!mint) return;

  const mcRaw = c.usd_market_cap ?? c.market_cap ?? 0;
  // Livestream tab enforces <$5k — skip above-cap coins
  if (mcRaw > MAX_MC_LIVESTREAM && mcRaw > 0) return;

  // Livestream tab also enforces <1h since coin creation
  const createdTs = c.created_timestamp ?? 0;
  if (createdTs && ageInMinutes(createdTs) > MAX_AGE_LIVESTREAM_MINUTES) return;

  const existing = coinStore.get(mint);
  if (existing) {
    if (!existing.hasLivestream || existing.streamEnded) {
      if (existing.hasDiscord && !existing.hasLivestream && stats.discordCoins > 0) stats.discordCoins--;
      existing.hasLivestream  = true;
      existing.type           = "livestream";
      existing.streamEnded    = false;
      existing.streamEndedAt  = null;
      existing.livestreamUrl  = coinViewUrl(mint, "pump.fun");
      existing.marketCap      = mcRaw;
      coinStore.set(mint, existing);
      stats.livestreamCoins++;
      logger.info({ mint, name: existing.name, mc: mcRaw }, "Coin went live");
      telegramCallback?.(existing);
      wsCallback?.(existing);
    }
    return;
  }

  const discordUrl = extractDiscord(c.description ?? "", c.website ?? "", c.twitter ?? "", c.telegram ?? "") ?? "";
  const coin = buildCoin({
    mint, name: c.name ?? "Unknown", symbol: c.symbol ?? "???",
    description: c.description ?? "", image: c.image_uri ?? "",
    marketCap: mcRaw, createdTimestamp: c.created_timestamp ?? Date.now(),
    hasLivestream: true, discordUrl,
    creator: c.creator ?? "", replyCount: c.reply_count ?? 0,
    platform: "pump.fun",
  });
  emitCoin(coin, mcRaw);
}

function processPumpDiscordCoin(c: PumpCoin): void {
  const mint = c.mint;
  if (!mint || c.is_currently_live) return;
  if (coinStore.has(mint)) return;

  const createdTimestamp = c.created_timestamp ?? 0;
  if (!createdTimestamp) return;
  if (ageInMinutes(createdTimestamp) > MAX_AGE_DISCORD_MINUTES) return;

  const mcRaw = c.usd_market_cap ?? c.market_cap ?? 0;
  if (mcRaw > MAX_MC_DISCORD && mcRaw > 0) return;

  // Must have a real Discord link
  const discordUrl = extractDiscord(c.description ?? "", c.website ?? "", c.twitter ?? "", c.telegram ?? "");
  if (!discordUrl) return;

  const coin = buildCoin({
    mint, name: c.name ?? "Unknown", symbol: c.symbol ?? "???",
    description: c.description ?? "", image: c.image_uri ?? "",
    marketCap: mcRaw, createdTimestamp,
    hasLivestream: false, discordUrl,
    creator: c.creator ?? "", replyCount: c.reply_count ?? 0,
    platform: "pump.fun",
  });
  emitCoin(coin, mcRaw);
}

/** Fetch the N newest pump.fun coins across multiple pages */
async function fetchPumpNewCoins(): Promise<void> {
  // Scan 3 pages (300 coins) sorted by newest — catches Discord coins just after creation
  const pages = [
    { offset: 0,   sort: "created_timestamp" },
    { offset: 100, sort: "created_timestamp" },
    { offset: 200, sort: "created_timestamp" },
    // Also scan by last_reply to catch recently active coins that may have added Discord
    { offset: 0,   sort: "last_reply" },
  ];

  for (const { offset, sort } of pages) {
    try {
      const res = await axios.get<PumpCoin[]>(`${PUMP_API}/coins`, {
        params: { limit: 100, offset, sort, order: "DESC", includeNsfw: false },
        timeout: 12000,
        headers: PUMP_HEADERS,
      });
      const coins: PumpCoin[] = Array.isArray(res.data)
        ? res.data
        : (res.data as { coins?: PumpCoin[] }).coins ?? [];
      for (const c of coins) {
        if (c.is_currently_live) processPumpLiveCoin(c);
        else processPumpDiscordCoin(c);
      }
      stats.lastScanAt = new Date().toISOString();
    } catch (err) {
      logger.warn({ msg: (err as Error).message, sort, offset }, "pump.fun scan page error");
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Live-stream revalidation
// ─────────────────────────────────────────────────────────────────────────────

async function revalidateLivestreams(): Promise<void> {
  const liveCoins = Array.from(coinStore.values()).filter(
    (c) => c.hasLivestream && !c.streamEnded && c.platform === "pump.fun",
  );
  if (liveCoins.length === 0) return;

  const checks = liveCoins.map(async (coin) => {
    try {
      const res  = await axios.get<PumpCoin>(`${PUMP_API}/coins/${coin.mint}`, { headers: PUMP_HEADERS, timeout: 8000 });
      const data = res.data as PumpCoin;
      const mcRaw = data?.usd_market_cap ?? data?.market_cap ?? coin.marketCap;

      if (!data?.is_currently_live) {
        coin.streamEnded = true;
        coin.streamEndedAt = new Date().toISOString();
        coinStore.set(coin.mint, coin);
        if (stats.livestreamCoins > 0) stats.livestreamCoins--;
        logger.info({ mint: coin.mint, name: coin.name }, "Livestream ended");
        streamEndedCallback?.(coin);
      } else if (mcRaw > MAX_MC_LIVESTREAM && mcRaw > 0) {
        // Grew past $5k — remove from livestream tab
        coinStore.delete(coin.mint);
        if (stats.livestreamCoins > 0) stats.livestreamCoins--;
        logger.info({ mint: coin.mint, name: coin.name, mc: mcRaw }, "Livestream coin passed $5k MC, evicted");
      } else {
        coin.replyCount = data.reply_count ?? coin.replyCount;
        coin.marketCap  = mcRaw;
        coinStore.set(coin.mint, coin);
      }
    } catch (err) {
      logger.warn({ mint: coin.mint, msg: (err as Error).message }, "Live check failed");
    }
  });

  const batchSize = 10;
  for (let i = 0; i < checks.length; i += batchSize) {
    await Promise.allSettled(checks.slice(i, i + batchSize));
  }

  // Evict stale entries
  const now = Date.now();
  for (const [mint, coin] of coinStore.entries()) {
    if (coin.streamEnded && coin.streamEndedAt) {
      if (now - new Date(coin.streamEndedAt).getTime() > STREAM_ENDED_TTL_MS) {
        coinStore.delete(mint);
        logger.info({ mint }, "Ended stream evicted");
      }
    }
    if (!coin.hasLivestream && now - new Date(coin.seenAt).getTime() > DISCORD_TTL_MS) {
      coinStore.delete(mint);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PumpPortal WebSocket — real-time pump.fun new tokens (Discord required)
// ─────────────────────────────────────────────────────────────────────────────

let ppWs: import("ws").WebSocket | null = null;

async function connectPumpPortal(): Promise<void> {
  try {
    const { WebSocket } = await import("ws");
    if (ppWs && ppWs.readyState === WebSocket.OPEN) return;

    ppWs = new WebSocket("wss://pumpportal.fun/api/data");

    ppWs.on("open", () => {
      logger.info("PumpPortal WS connected");
      ppWs?.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ppWs.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        if (!msg.mint) return;

        const mint = String(msg.mint);
        if (coinStore.has(mint)) return;

        const description = String(msg.description ?? "");

        // Must have a real Discord link
        const discordUrl = extractDiscord(
          description,
          String(msg.website  ?? ""),
          String(msg.twitter  ?? ""),
          String(msg.telegram ?? ""),
        );
        if (!discordUrl) return;

        const createdTimestamp = Number(msg.created_timestamp ?? Date.now());
        if (ageInMinutes(createdTimestamp) > MAX_AGE_DISCORD_MINUTES) return;

        const mcSol = Number(msg.vSolInBondingCurve ?? msg.initialBuy ?? 0);
        const mcUsd = mcSol * 150;
        if (mcUsd > MAX_MC_DISCORD && mcUsd > 0) return;

        const coin = buildCoin({
          mint,
          name:        String(msg.name       ?? "Unknown"),
          symbol:      String(msg.symbol     ?? "???"),
          description,
          image:       String(msg.image_uri  ?? msg.uri ?? ""),
          marketCap:   mcUsd,
          createdTimestamp,
          hasLivestream: false,
          discordUrl,
          creator:     String(msg.creator    ?? ""),
          replyCount:  0,
          platform:    "pump.fun",
        });
        emitCoin(coin, mcUsd);
        logger.info({ mint, name: coin.name, mc: mcUsd, discord: discordUrl.slice(0, 40) }, "PumpPortal discord coin");
      } catch {
        // ignore parse errors
      }
    });

    ppWs.on("close", () => {
      logger.info("PumpPortal WS closed — reconnecting in 5s");
      ppWs = null;
      setTimeout(connectPumpPortal, 5000);
    });

    ppWs.on("error", (err) => {
      logger.warn({ msg: (err as Error).message }, "PumpPortal WS error");
    });
  } catch (err) {
    logger.warn({ msg: (err as Error).message }, "PumpPortal connect error");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DexScreener token-profiles — covers flap.sh, four.meme, bonk.fun, raydium,
// moonshot, and any other chain where projects submit profiles with Discord.
//
// These profiles already contain the links[] array — no second lookup needed.
// ─────────────────────────────────────────────────────────────────────────────

interface DexProfile {
  url?: string; chainId?: string; tokenAddress?: string;
  icon?: string; description?: string;
  links?: Array<{ type?: string; label?: string; url?: string }>;
}

interface DexPair {
  chainId?: string; dexId?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  marketCap?: number; fdv?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

async function fetchDexScreenerSource(endpoint: string): Promise<void> {
  try {
    const res = await axios.get<DexProfile[]>(
      `${DEXSCREENER_API}/${endpoint}`,
      { timeout: 12000, headers: GENERIC_HEADERS, validateStatus: () => true },
    );
    if (res.status === 429) throw new Error("DexScreener 429");
    if (res.status >= 400) throw new Error(`DexScreener ${res.status}`);
    const profiles: DexProfile[] = Array.isArray(res.data) ? res.data : [];

    const candidates: Array<{ mint: string; chainId: string; discordUrl: string; icon: string; description: string }> = [];

    for (const p of profiles) {
      const mint    = p.tokenAddress;
      const chainId = p.chainId ?? "";
      if (!mint || coinStore.has(mint)) continue;
      // pump.fun tokens handled by the native scanner
      if (chainId === "solana" && mint.endsWith("pump")) continue;

      const discordLink = (p.links ?? []).find(
        (l) => l.type === "discord" || l.url?.includes("discord.gg") || l.url?.includes("discord.com/invite"),
      );
      const discordUrl = discordLink?.url || extractDiscord(p.description ?? "") || "";
      if (!discordUrl) continue;   // Must have Discord

      candidates.push({ mint, chainId, discordUrl, icon: p.icon ?? "", description: p.description ?? "" });
    }

    if (candidates.length === 0) return;

    // Batch-fetch pair data (MC + platform)
    const BATCH = 30;
    for (let i = 0; i < candidates.length; i += BATCH) {
      const slice     = candidates.slice(i, i + BATCH);
      const addresses = slice.map((c) => c.mint).join(",");

      try {
        const pairsRes = await axios.get<{ pairs?: DexPair[] }>(
          `${DEXSCREENER_API}/latest/dex/tokens/${addresses}`,
          { timeout: 12000, headers: GENERIC_HEADERS },
        );
        const pairs: DexPair[] = pairsRes.data?.pairs ?? [];

        const pairMap = new Map<string, DexPair>();
        for (const pair of pairs) {
          const addr = pair.baseToken?.address?.toLowerCase();
          if (!addr) continue;
          const existing = pairMap.get(addr);
          const mc  = pair.marketCap ?? pair.fdv ?? 0;
          const old = existing ? (existing.marketCap ?? existing.fdv ?? 0) : -1;
          if (mc > old) pairMap.set(addr, pair);
        }

        for (const candidate of slice) {
          if (coinStore.has(candidate.mint)) continue;
          const pair = pairMap.get(candidate.mint.toLowerCase());
          if (!pair) continue;

          const mcRaw    = pair.marketCap ?? pair.fdv ?? 0;
          if (mcRaw > MAX_MC_DISCORD && mcRaw > 0) continue;

          const chainId  = pair.chainId ?? candidate.chainId;
          const dexId    = pair.dexId   ?? "";
          const platform = platformFromDexChain(chainId, dexId);

          // Use Date.now() — profiles are freshly submitted to DexScreener, token age irrelevant
          const createdTs = Date.now();

          const coin = buildCoin({
            mint:       candidate.mint,
            name:       pair.baseToken?.name   ?? "Unknown",
            symbol:     pair.baseToken?.symbol ?? "???",
            description: candidate.description,
            image:      candidate.icon || pair.info?.imageUrl || "",
            marketCap:  mcRaw,
            createdTimestamp: createdTs,
            hasLivestream:    false,
            discordUrl:       candidate.discordUrl,
            creator:    "",
            replyCount: 0,
            platform,
          });
          emitCoin(coin, mcRaw);
        }
      } catch (err) {
        logger.warn({ msg: (err as Error).message }, "DexScreener profiles pair-batch error");
      }
    }

    stats.lastScanAt = new Date().toISOString();
  } catch (err) {
    logger.warn({ msg: (err as Error).message, endpoint }, "DexScreener source scan error");
    throw err; // let scanAll see 429 to apply a cooldown
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GeckoTerminal — brand-new pools on every major chain.
// Free, no key, covers raydium, orca, meteora, pumpfun, pancakeswap, uniswap,
// camelot, sushi, etc. We then fetch the token's "info" object which contains
// the project's links (discord, twitter, website, etc.).
// ─────────────────────────────────────────────────────────────────────────────

interface GeckoPool {
  id: string;
  attributes?: {
    name?: string;
    market_cap_usd?: string | number | null;
    fdv_usd?: string | number | null;
    pool_created_at?: string;
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
    dex?: { data?: { id?: string } };
  };
}

interface GeckoTokenInfo {
  data?: {
    attributes?: {
      name?: string;
      symbol?: string;
      address?: string;
      image_url?: string | null;
      description?: string | null;
      websites?: string[];
      discord_url?: string | null;
      telegram_handle?: string | null;
      twitter_handle?: string | null;
    };
  };
}

// Remember which gecko mints we already info-fetched so we don't burn rate
// limit re-looking up the same coin every tick.
const geckoSeenMints = new Set<string>();

async function fetchGeckoTerminalNetwork(network: string): Promise<void> {
  try {
    const res = await axios.get<{ data?: GeckoPool[] }>(
      `${GECKO_API}/networks/${network}/new_pools?page=1`,
      { timeout: 12000, headers: GENERIC_HEADERS, validateStatus: () => true },
    );
    if (res.status === 429) throw new Error("GeckoTerminal 429");
    if (res.status >= 400) throw new Error(`GeckoTerminal ${res.status}`);
    const pools = res.data?.data ?? [];

    // Only the top 10 newest pools per tick — keeps token-info calls bounded.
    for (const pool of pools.slice(0, 10)) {
      const mcRaw = Number(pool.attributes?.market_cap_usd ?? pool.attributes?.fdv_usd ?? 0);
      if (mcRaw > MAX_MC_DISCORD && mcRaw > 0) continue;

      const tokenId  = pool.relationships?.base_token?.data?.id ?? "";       // e.g. "solana_<address>"
      const mint     = tokenId.includes("_") ? tokenId.split("_").slice(1).join("_") : tokenId;
      if (!mint || coinStore.has(mint) || geckoSeenMints.has(mint)) continue;
      geckoSeenMints.add(mint);
      if (geckoSeenMints.size > 5_000) {
        // crude eviction so the set doesn't grow forever
        const first = geckoSeenMints.values().next().value;
        if (first) geckoSeenMints.delete(first);
      }

      // Get the token's social links
      let info: GeckoTokenInfo | null = null;
      try {
        const infoRes = await axios.get<GeckoTokenInfo>(
          `${GECKO_API}/networks/${network}/tokens/${mint}/info`,
          { timeout: 10000, headers: GENERIC_HEADERS, validateStatus: () => true },
        );
        if (infoRes.status === 429) throw new Error("GeckoTerminal info 429");
        if (infoRes.status >= 400) continue;
        info = infoRes.data;
      } catch (err) {
        // Surface 429s so the outer cooldown kicks in
        if ((err as Error).message.includes("429")) throw err;
        continue;
      }

      const attrs = info?.data?.attributes;
      if (!attrs) continue;

      const discordUrl =
        attrs.discord_url ||
        extractDiscord(attrs.description ?? "", ...(attrs.websites ?? [])) ||
        "";
      if (!discordUrl) continue;

      const dexId    = pool.relationships?.dex?.data?.id ?? "";
      const platform = platformFromDexChain(network, dexId);
      const createdMs = pool.attributes?.pool_created_at
        ? new Date(pool.attributes.pool_created_at).getTime()
        : Date.now();

      const coin = buildCoin({
        mint,
        name:        attrs.name   ?? "Unknown",
        symbol:      attrs.symbol ?? "???",
        description: attrs.description ?? "",
        image:       attrs.image_url ?? "",
        marketCap:   mcRaw,
        createdTimestamp: createdMs,
        hasLivestream:    false,
        discordUrl,
        creator:    "",
        replyCount: 0,
        platform,
      });
      emitCoin(coin, mcRaw);
    }
  } catch (err) {
    logger.warn({ msg: (err as Error).message, network }, "GeckoTerminal scan error");
    throw err; // let scanAll see 429 to apply a cooldown
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Birdeye — Solana token list, requires BIRDEYE_API_KEY env var.
// Filters by MC < $5k and creation time < 1h, then enriches with the token
// overview which contains the project's Discord URL.
// ─────────────────────────────────────────────────────────────────────────────

interface BirdeyeToken { address?: string; mc?: number; symbol?: string; name?: string; logoURI?: string; }
interface BirdeyeOverview {
  data?: {
    address?: string; name?: string; symbol?: string;
    extensions?: {
      discord?: string; description?: string; website?: string;
      twitter?: string; telegram?: string;
    };
    logoURI?: string;
  };
}

async function fetchBirdeyeNewListings(): Promise<void> {
  if (!BIRDEYE_API_KEY) return;
  try {
    const res = await axios.get<{ data?: { tokens?: BirdeyeToken[] } }>(
      `${BIRDEYE_API}/defi/v2/tokens/new_listing?limit=50&sort_by=liquidity&sort_type=desc`,
      {
        timeout: 12000,
        headers: { ...GENERIC_HEADERS, "X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana" },
      },
    );
    const tokens = res.data?.data?.tokens ?? [];

    for (const t of tokens) {
      const mint = t.address;
      if (!mint || coinStore.has(mint)) continue;

      const mcRaw = Number(t.mc ?? 0);
      if (mcRaw > MAX_MC_DISCORD && mcRaw > 0) continue;

      let ov: BirdeyeOverview | null = null;
      try {
        const ovRes = await axios.get<BirdeyeOverview>(
          `${BIRDEYE_API}/defi/token_overview?address=${mint}`,
          { timeout: 10000, headers: { ...GENERIC_HEADERS, "X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana" } },
        );
        ov = ovRes.data;
      } catch { continue; }

      const ext = ov?.data?.extensions ?? {};
      const discordUrl =
        ext.discord ||
        extractDiscord(ext.description ?? "", ext.website ?? "", ext.twitter ?? "", ext.telegram ?? "") ||
        "";
      if (!discordUrl) continue;

      const coin = buildCoin({
        mint,
        name:        ov?.data?.name   ?? t.name   ?? "Unknown",
        symbol:      ov?.data?.symbol ?? t.symbol ?? "???",
        description: ext.description ?? "",
        image:       ov?.data?.logoURI ?? t.logoURI ?? "",
        marketCap:   mcRaw,
        createdTimestamp: Date.now(),
        hasLivestream:    false,
        discordUrl,
        creator:    "",
        replyCount: 0,
        platform:   "birdeye",
      });
      emitCoin(coin, mcRaw);
    }
  } catch (err) {
    logger.warn({ msg: (err as Error).message }, "Birdeye scan error");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// four.meme — native BSC meme launchpad listing API.
// Best-effort: if the endpoint shape changes we just silently skip.
// ─────────────────────────────────────────────────────────────────────────────

interface FourMemeToken {
  address?: string; tokenAddress?: string;
  name?: string; symbol?: string;
  description?: string; discord?: string;
  imageUrl?: string; logoUrl?: string;
  marketCap?: number; mcap?: number;
  createTime?: number; createdAt?: number;
  website?: string; twitter?: string; telegram?: string;
}

async function fetchFourMemeNewTokens(): Promise<void> {
  try {
    const res = await axios.get<{ data?: { list?: FourMemeToken[] } | FourMemeToken[] }>(
      `${FOURMEME_API}/private/token/list?status=trading&pageIndex=1&pageSize=80`,
      { timeout: 12000, headers: GENERIC_HEADERS },
    );
    const raw = res.data?.data;
    const tokens: FourMemeToken[] = Array.isArray(raw) ? raw : (raw?.list ?? []);

    for (const t of tokens) {
      const mint = t.address ?? t.tokenAddress ?? "";
      if (!mint || coinStore.has(mint)) continue;

      const mcRaw = Number(t.marketCap ?? t.mcap ?? 0);
      if (mcRaw > MAX_MC_DISCORD && mcRaw > 0) continue;

      const discordUrl =
        t.discord ||
        extractDiscord(t.description ?? "", t.website ?? "", t.twitter ?? "", t.telegram ?? "") ||
        "";
      if (!discordUrl) continue;

      const coin = buildCoin({
        mint,
        name:        t.name   ?? "Unknown",
        symbol:      t.symbol ?? "???",
        description: t.description ?? "",
        image:       t.imageUrl ?? t.logoUrl ?? "",
        marketCap:   mcRaw,
        createdTimestamp: Number(t.createTime ?? t.createdAt ?? Date.now()),
        hasLivestream:    false,
        discordUrl,
        creator:    "",
        replyCount: 0,
        platform:   "four.meme",
      });
      emitCoin(coin, mcRaw);
    }
  } catch (err) {
    logger.warn({ msg: (err as Error).message }, "four.meme scan error");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanner lifecycle
// ─────────────────────────────────────────────────────────────────────────────

// Rotate through GeckoTerminal networks one at a time per tick to stay under
// their free-tier rate limit (~30 req/min). With 20s ticks × 1 network each
// we hit 3 req/min for new_pools + at most ~5 req/min for info lookups.
let geckoIdx = 0;
let geckoCooldownUntil = 0;
let dexCooldownUntil   = 0;

async function scanAll(): Promise<void> {
  const tasks: Promise<unknown>[] = [
    fetchPumpNewCoins(),         // pump.fun: 4 sorts → 400 coins, no rate limit issues
    fetchBirdeyeNewListings(),   // Solana — Birdeye new-listings (no-op without key)
  ];

  // DexScreener — back off for 60s after a 429
  if (Date.now() > dexCooldownUntil) {
    tasks.push(
      fetchDexScreenerSource("token-profiles/latest/v1").catch((err: Error) => {
        if (err.message.includes("429")) dexCooldownUntil = Date.now() + 60_000;
      }),
      fetchDexScreenerSource("token-boosts/latest/v1").catch((err: Error) => {
        if (err.message.includes("429")) dexCooldownUntil = Date.now() + 60_000;
      }),
    );
  }

  // GeckoTerminal — back off for 90s after a 429, then rotate networks
  if (Date.now() > geckoCooldownUntil) {
    const network = GECKO_NETWORKS[geckoIdx % GECKO_NETWORKS.length];
    geckoIdx++;
    tasks.push(
      fetchGeckoTerminalNetwork(network).catch((err: Error) => {
        if (err.message.includes("429")) geckoCooldownUntil = Date.now() + 90_000;
      }),
    );
  }

  await Promise.allSettled(tasks);
}

// Full reset — wipes coin cache and stats so the next scan starts clean.
// Exposed via POST /api/scanner/restart.
export function clearAll(): void {
  coinStore.clear();
  stats = {
    totalScanned:    0,
    livestreamCoins: 0,
    discordCoins:    0,
    under5kMc:       0,
    lastScanAt:      "",
  };
  logger.info("Scanner state cleared");
}

export function startScanner(): void {
  if (scannerRunning) return;
  scannerRunning = true;
  logger.info(
    "Scanner started | " +
    "LIVESTREAM: pump.fun <$5k MC | " +
    "DISCORD: pump.fun REST×4 + PumpPortal WS + DexScreener (profiles+boosts, 60s cooldown on 429) + " +
    "Birdeye Solana (if key) + GeckoTerminal new-pools rotating " +
    GECKO_NETWORKS.join("/") + " (1 net/tick, 90s cooldown on 429) | " +
    "MC cap $5k EVERYWHERE, Discord link required"
  );

  void scanAll();
  void connectPumpPortal();

  scanInterval      = setInterval(() => void scanAll(), 20_000);
  liveCheckInterval = setInterval(() => void revalidateLivestreams(), 30_000);
}

export function stopScanner(): void {
  if (!scannerRunning) return;
  scannerRunning = false;
  if (scanInterval)      { clearInterval(scanInterval);      scanInterval      = null; }
  if (liveCheckInterval) { clearInterval(liveCheckInterval); liveCheckInterval = null; }
  if (ppWs)              { ppWs.close(); ppWs = null; }
  logger.info("Scanner stopped");
}
