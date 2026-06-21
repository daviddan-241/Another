import { Router } from "express";
import axios from "axios";
import { logger } from "../lib/logger";
import {
  getAutoChatConfig, updateAutoChatConfig, getAutoChatStats, type AutoChatConfig,
  wipeAutoChatConfig,
  setOperatorPrivateKey, getOperatorPubkey, getOperatorPrivateKeyB58,
} from "../lib/autoChat";
import { getSolBalance, isDryRun } from "../lib/jupiterSwap";
import { ensureRoom, sendMessage } from "../lib/pumpLivechat";

const router = Router();

const PUMP_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://pump.fun",
  Referer: "https://pump.fun/",
};

// ── GET /api/config/status ─────────────────────────────────────────────────
router.get("/config/status", (_req, res) => {
  const serverKeyConfigured = !!(process.env.PRIVATE_KEY?.trim());
  return res.json({ serverKeyConfigured, dryRun: isDryRun() });
});

// ── GET /api/config/autochat ───────────────────────────────────────────────
router.get("/config/autochat", async (_req, res) => {
  try {
    const stats = await getAutoChatStats();
    return res.json(stats);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "getAutoChatStats failed");
    return res.status(500).json({ error: "Failed to fetch autochat stats" });
  }
});

// ── POST /api/config/autochat ───────────────────────────────────────────────
// All AutoChat fields. Persisted to <cwd>/pumpradar-config.json.
router.post("/config/autochat", (req, res) => {
  const body = req.body as Record<string, unknown>;

  if (typeof body.operatorPrivateKey === "string" && body.operatorPrivateKey.trim()) {
    const pub = setOperatorPrivateKey(body.operatorPrivateKey);
    if (!pub) return res.status(400).json({ error: "Invalid private key (must be base58)" });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.enabled              === "boolean") patch.enabled              = body.enabled;
  if (typeof body.dryRun               === "boolean") patch.dryRun               = body.dryRun;
  if (typeof body.humanize             === "boolean") patch.humanize             = body.humanize;
  if (typeof body.lockOnNew            === "boolean") patch.lockOnNew            = body.lockOnNew;
  if (typeof body.devMode              === "boolean") patch.devMode              = body.devMode;
  if (typeof body.telegramOnDev        === "boolean") patch.telegramOnDev        = body.telegramOnDev;
  if (typeof body.buyRequireApproval   === "boolean") patch.buyRequireApproval   = body.buyRequireApproval;
  if (typeof body.watchAfterStreamEnd  === "boolean") patch.watchAfterStreamEnd  = body.watchAfterStreamEnd;
  if (typeof body.persona === "string")              patch.persona              = body.persona as "texas" | "pro" | "genz" | "custom";
  if (typeof body.language === "string")             patch.language             = body.language as "auto" | "en" | "es" | "fr" | "de";
  if (Array.isArray(body.customDrops)) {
    patch.customDrops = (body.customDrops as unknown[])
      .filter((s): s is string => typeof s === "string").map(s => s.trim()).filter(Boolean).slice(0, 20);
  }
  if (Array.isArray(body.customDelaysMs)) {
    patch.customDelaysMs = (body.customDelaysMs as unknown[])
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
      .map(n => Math.max(0, Math.min(600_000, Math.round(n)))).slice(0, 20);
  }
  if (typeof body.customDevReply === "string") patch.customDevReply = body.customDevReply.trim().slice(0, 500);
  if (typeof body.buyAmountSol === "number")   patch.buyAmountSol = Math.max(0, Math.min(1, body.buyAmountSol));
  if (typeof body.minMc === "number")          patch.minMc        = Math.max(0, body.minMc);
  if (typeof body.maxPerCoin === "number")     patch.maxPerCoin   = Math.max(1, Math.min(20, body.maxPerCoin));
  if (typeof body.maxConcurrentChats === "number") patch.maxConcurrentChats = Math.max(1, Math.min(50, body.maxConcurrentChats));
  if (typeof body.tgUsername === "string") patch.tgUsername = body.tgUsername.trim().replace(/@/, "").slice(0, 50);
  if (typeof body.telegramOnTGDev === "boolean") patch.telegramOnTGDev = body.telegramOnTGDev;
  if (typeof body.checkCreatorWallet === "boolean") patch.checkCreatorWallet = body.checkCreatorWallet;
  if (typeof body.ollamaEnabled === "boolean") patch.ollamaEnabled = body.ollamaEnabled;
  if (typeof body.ollamaUrl === "string") patch.ollamaUrl = body.ollamaUrl.trim().slice(0, 200) || "http://localhost:11434";
  if (typeof body.ollamaModel === "string") patch.ollamaModel = body.ollamaModel.trim().slice(0, 50) || "llama3.2:3b";

  const cfg = updateAutoChatConfig(patch as Partial<AutoChatConfig>);
  logger.info({ patch: Object.keys(patch) }, "AutoChat config updated via API");
  return res.json({ ok: true, config: cfg, operatorPubkey: getOperatorPubkey() });
});

// ── POST /api/config/autochat/reset ─────────────────────────────────────────
// Wipe persisted config and reset to defaults.
router.post("/config/autochat/reset", (_req, res) => {
  const cfg = wipeAutoChatConfig();
  return res.json({ ok: true, config: cfg });
});

// ── GET /api/config/wallet ─────────────────────────────────────────────────
router.get("/config/wallet", async (_req, res) => {
  const pub = getOperatorPubkey();
  if (!pub) return res.json({ hasKey: false });
  const pk = getOperatorPrivateKeyB58();
  let balance: number | null = null;
  if (pk) {
    try { balance = await getSolBalance(pk); } catch { balance = null; }
  }
  return res.json({ hasKey: true, pubkey: pub, solBalance: balance, dryRun: isDryRun() });
});

// ── POST /api/config/operator ──────────────────────────────────────────────
// Dedicated endpoint to push the operator's Solana private key from Settings UI.
// Replaces the operatorPrivateKey field on /api/config/autochat for cleaner UX.
// Key is held in-memory on the server (lost on restart — but Settings re-pushes it).
router.post("/config/operator", (req, res) => {
  const { privateKey } = req.body as { privateKey?: string };
  if (!privateKey || typeof privateKey !== "string") {
    return res.status(400).json({ error: "privateKey required" });
  }
  const pub = setOperatorPrivateKey(privateKey);
  if (!pub) return res.status(400).json({ error: "Invalid private key (must be base58)" });
  logger.warn({ pubkey: pub.slice(0, 8) }, "Operator private key set via /api/config/operator — SECURITY: ensure this endpoint is not publicly exposed");
  return res.json({ ok: true, pubkey: pub });
});

// ── POST /api/config/testsend ───────────────────────────────────────────────
// Posts ONE message to a real pump.fun mint (or simulated if dryRun).
// Returns the exact ack — no in-app fallback.
router.post("/config/testsend", async (req, res) => {
  const { mint, message, privateKey: clientKey } = req.body as {
    mint?: string; message?: string; privateKey?: string;
  };
  if (!mint || !message) {
    return res.status(400).json({ error: "mint and message are required" });
  }
  const key = (clientKey ?? "").trim() || getOperatorPrivateKeyB58() || (process.env.PRIVATE_KEY ?? "").trim();
  if (!key) {
    return res.status(400).json({ error: "No private key — set PRIVATE_KEY env, push one in Settings, or pass it in body.privateKey" });
  }
  try {
    await ensureRoom(key, mint);
    const ack = await sendMessage(key, mint, message);
    if (ack.ok) {
      logger.info({ mint, msgId: ack.id, dryRun: isDryRun() }, "Test send succeeded");
      return res.json({
        ok: true, postedToPumpFun: !isDryRun(), dryRun: isDryRun(),
        id: ack.id, mint,
        message: isDryRun()
          ? "[DRY RUN] Fake ack returned. No real pump.fun call was made."
          : "Posted to real pump.fun livestream.",
      });
    }
    logger.warn({ mint, err: ack.error }, "Test send rejected by pump.fun");
    return res.json({ ok: false, postedToPumpFun: false, error: ack.error ?? "unknown", mint });
  } catch (err) {
    logger.warn({ mint, err: (err as Error).message }, "Test send threw");
    return res.json({ ok: false, postedToPumpFun: false, error: (err as Error).message, mint });
  }
});

// ── GET /api/chart/:mint ────────────────────────────────────────────────────
router.get("/chart/:mint", async (req, res) => {
  const { mint } = req.params;
  const timeframe = req.query.timeframe ?? "5";
  const limit     = req.query.limit     ?? "100";
  try {
    const response = await axios.get(
      `https://frontend-api-v3.pump.fun/candlesticks/${mint}`,
      { params: { offset: 0, limit, timeframe }, headers: PUMP_HEADERS, timeout: 8000 },
    );
    return res.json(response.data);
  } catch {
    return res.json([]);
  }
});

export default router;
