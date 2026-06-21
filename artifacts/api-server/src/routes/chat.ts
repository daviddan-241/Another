import { Router } from "express";
import axios from "axios";
import { logger } from "../lib/logger";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { getPrivyToken, getPrivyTokens } from "./auth";
import { PUMP_HEADERS as PUMP_HEADERS_BASE } from "../lib/pumpAuth";
import { fetchHistory as livechatFetchHistory, sendMessage as livechatSendMessage } from "../lib/pumpLivechat";

const router = Router();

const PUMP_API = "https://frontend-api-v3.pump.fun";
const PUMP_HEADERS = PUMP_HEADERS_BASE;

// ── App-level lock store ─────────────────────────────────────────────────────
const appLocks = new Map<string, Set<string>>();

// ── In-app message store (fallback / supplement to pump.fun) ─────────────────
interface StoredMessage {
  id: string;
  pubkey: string;
  username: string;
  text: string;
  timestamp: number;
}
const messageStore = new Map<string, StoredMessage[]>();
const MAX_STORED = 200;

function storeMessage(mint: string, msg: StoredMessage) {
  const msgs = messageStore.get(mint) ?? [];
  msgs.push(msg);
  if (msgs.length > MAX_STORED) msgs.splice(0, msgs.length - MAX_STORED);
  messageStore.set(mint, msgs);
}

function keypairFromPrivateKey(b58: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(b58.trim()));
}

/** Build a bearer token in one of several formats pump.fun may accept */
function buildToken(
  keypair: Keypair,
  sigMessage: string,
  outerEnc: "base64" | "base64url",
  sigEnc: "bs58" | "b64",
): string {
  const ts  = Date.now();
  const msg = sigMessage.replace("{ts}", String(ts));
  const sig = nacl.sign.detached(Buffer.from(msg, "utf-8"), keypair.secretKey);
  const sigStr = sigEnc === "bs58" ? bs58.encode(sig) : Buffer.from(sig).toString("base64");
  return Buffer.from(JSON.stringify({
    publicKey: keypair.publicKey.toBase58(),
    signature: sigStr,
    timestamp: ts,
  })).toString(outerEnc);
}

/** Legacy auth token — used for lock/ban endpoints */
function buildLegacyAuthToken(keypair: Keypair): string {
  return buildToken(keypair, "Sign in to pump.fun: {ts}", "base64", "bs58");
}

function extractError(detail: unknown): string {
  if (typeof detail === "string" && detail) return detail;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    const v = d.message ?? d.error ?? d.detail ?? d.msg ?? d.statusMessage;
    if (v) return String(v);
    return JSON.stringify(detail).slice(0, 200);
  }
  return "";
}

function classifyError(status: number, msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("reply") && (m.includes("disabled") || m.includes("locked") || m.includes("nsfw")))
    return "LOCKED";
  if (status === 403 && (m.includes("hold") || m.includes("balance") || m.includes("own")))
    return "HOLDER";
  if (status === 403) return "FORBIDDEN";
  if (status === 401) return "UNAUTH";
  return "OTHER";
}

function parseReplies(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    for (const key of ["replies", "messages", "chat", "data", "comments", "items", "results"]) {
      if (Array.isArray(d[key])) return d[key] as unknown[];
    }
  }
  return [];
}

function resolveKey(clientKey?: string): string | null {
  const k = (clientKey ?? "").trim() || (process.env.PRIVATE_KEY ?? "").trim();
  return k || null;
}

/** Fallback: fetch comments from pump.fun REST API (no auth required for reading) */
async function fetchPumpFunRepliesRest(mint: string): Promise<unknown[]> {
  const urls = [
    `${PUMP_API}/coins/${mint}/replies?limit=50&offset=0`,
    `https://client-api-2-74b1891ee9f9.herokuapp.com/coins/${mint}/replies?limit=50&offset=0`,
  ];
  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: { ...PUMP_HEADERS, Authorization: undefined },
        timeout: 8000,
        validateStatus: () => true,
      });
      if (res.status === 200) {
        const list = parseReplies(res.data);
        if (list.length > 0) return list;
      }
    } catch { /* try next */ }
  }
  return [];
}

// ── GET /api/chat/replies/:mint ──────────────────────────────────────────────
router.get("/chat/replies/:mint", async (req, res) => {
  const { mint } = req.params;
  const lockInfo = appLocks.get(mint);
  const isAppLocked = lockInfo !== undefined;
  const allowedPubkeys = isAppLocked ? Array.from(lockInfo) : [];

  const clientKeyHeader = req.headers["x-pump-key"] as string | undefined;
  const authKey = resolveKey(clientKeyHeader);

  // 1. Try real pump.fun livechat history via Socket.IO (requires auth)
  if (authKey) {
    try {
      const messages = await Promise.race([
        livechatFetchHistory(authKey, mint),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("pump.fun livechat fetch timeout")), 12_000),
        ),
      ]);
      const replies = messages.map((m) => ({
        id: m.id,
        username: m.username ?? null,
        user_pubkey: m.address ?? m.user_address ?? "",
        profile_image: m.profile_image ?? m.avatarUrl ?? null,
        text: m.message ?? "",
        timestamp:
          typeof m.timestamp === "number"
            ? m.timestamp
            : typeof m.timestamp === "string"
              ? Date.parse(m.timestamp) || Date.now()
              : Date.now(),
      }));
      logger.info({ mint, count: replies.length }, "Fetched real pump.fun livechat history");
      return res.json({
        replies,
        isAppLocked,
        allowedPubkeys,
        source: "pump.fun",
        requiresAuth: false,
      });
    } catch (err) {
      logger.warn({ mint, err: (err as Error).message }, "pump.fun livechat fetch failed, trying REST fallback");
    }
  }

  // 2. Try pump.fun REST API as fallback (no auth needed for reading)
  try {
    const restReplies = await Promise.race([
      fetchPumpFunRepliesRest(mint),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("REST fetch timeout")), 8_000)),
    ]);
    if (restReplies.length > 0) {
      logger.info({ mint, count: restReplies.length }, "Fetched pump.fun replies via REST fallback");
      return res.json({
        replies: restReplies,
        isAppLocked,
        allowedPubkeys,
        source: "pump.fun",
        requiresAuth: false,
      });
    }
  } catch (err) {
    logger.warn({ mint, err: (err as Error).message }, "pump.fun REST fallback also failed");
  }

  // 3. Fall back to in-app stored messages
  const stored = messageStore.get(mint) ?? [];
  const replies = stored.map(m => ({
    id: m.id,
    username: m.username,
    user_pubkey: m.pubkey,
    text: m.text,
    timestamp: m.timestamp,
  }));

  return res.json({
    replies,
    isAppLocked,
    allowedPubkeys,
    source: "inapp",
    requiresAuth: !authKey && stored.length === 0,
  });
});

// ── POST /api/chat/post ──────────────────────────────────────────────────────
router.post("/chat/post", async (req, res) => {
  const { mint, message, privateKey: clientKey } = req.body as {
    mint: string;
    message: string;
    privateKey?: string;
  };
  const privateKey = resolveKey(clientKey);

  if (!mint || !message)
    return res.status(400).json({ error: "mint and message are required" });
  if (!privateKey)
    return res.status(400).json({ error: "Add your Solana private key in Settings to post" });

  let keypair: Keypair;
  let publicKey = "";

  try {
    keypair = keypairFromPrivateKey(privateKey);
    publicKey = keypair.publicKey.toBase58();
  } catch {
    return res.status(400).json({ error: "Invalid private key — must be base58" });
  }

  // App-level lock check
  const lockInfo = appLocks.get(mint);
  if (lockInfo !== undefined && !lockInfo.has(publicKey)) {
    return res.json({ success: false, error: "Chat is locked — only the owner can post", kind: "APP_LOCKED" });
  }

  const text = message.trim();

  // ── Real pump.fun reply via livechat WebSocket (sendMessage event).
  let last401Detail = "";
  let lastNonAuthDetail = "";
  let lastNonAuthKind = "OTHER";
  try {
    const ack = await Promise.race([
      livechatSendMessage(privateKey, mint, text),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("pump.fun livechat send timeout")), 15_000),
      ),
    ]);
    if (ack.ok) {
      const msgId = ack.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const shortKey = publicKey.slice(0, 8) + "…" + publicKey.slice(-4);
      storeMessage(mint, { id: msgId, pubkey: publicKey, username: shortKey, text, timestamp: Date.now() });
      logger.info({ mint, publicKey, msgId }, "pump.fun livechat sendMessage OK");
      return res.json({ success: true, postedToPumpFun: true });
    }
    const errMsg = ack.error ?? "unknown";
    const kind = classifyError(0, errMsg);
    lastNonAuthDetail = errMsg;
    lastNonAuthKind = kind;
    logger.warn({ mint, publicKey, err: errMsg }, "pump.fun livechat sendMessage rejected");
  } catch (pumpErr) {
    last401Detail = (pumpErr as Error).message;
    logger.warn({ mint, publicKey, err: last401Detail }, "pump.fun livechat send failed");
  }

  // All attempts failed — save in-app as fallback
  const msgId    = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const shortKey = publicKey.slice(0, 8) + "…" + publicKey.slice(-4);
  storeMessage(mint, { id: msgId, pubkey: publicKey, username: shortKey, text, timestamp: Date.now() });

  const finalKind   = lastNonAuthKind !== "OTHER" ? lastNonAuthKind : (last401Detail ? "UNAUTH" : "OTHER");
  const finalDetail = lastNonAuthDetail || last401Detail || "all attempts failed";
  logger.warn({ mint, publicKey, kind: finalKind, detail: finalDetail }, "All pump.fun post attempts failed — saved in-app");

  return res.json({
    success: true,
    postedToPumpFun: false,
    pumpFunError: finalKind,
    pumpFunErrorDetail: finalDetail.slice(0, 300),
    pumpFunUrl: `https://pump.fun/coin/${mint}`,
  });
});

// ── POST /api/chat/applock ────────────────────────────────────────────────────
router.post("/chat/applock", async (req, res) => {
  const { mint, privateKey: clientKey, lock, coinCreatorPubkey } = req.body as {
    mint: string;
    privateKey?: string;
    lock: boolean;
    coinCreatorPubkey?: string;
  };
  const privateKey = resolveKey(clientKey);

  if (!mint || lock === undefined)
    return res.status(400).json({ error: "mint and lock are required" });
  if (!privateKey)
    return res.status(400).json({ error: "No private key — add your key in Settings" });

  let keypair: Keypair;
  try { keypair = keypairFromPrivateKey(privateKey); }
  catch { return res.status(400).json({ error: "Invalid private key" }); }

  const publicKey = keypair.publicKey.toBase58();

  if (lock) {
    const allowed = new Set<string>([publicKey]);
    if (coinCreatorPubkey && coinCreatorPubkey !== publicKey) {
      allowed.add(coinCreatorPubkey);
    }
    appLocks.set(mint, allowed);
  } else {
    appLocks.delete(mint);
  }

  // Best-effort pump.fun lock via Privy token
  try {
    const privyToken = await getPrivyToken(privateKey);
    await axios.post(
      `${PUMP_API}/coins/${mint}/set-nsfw`,
      { disable_replies: lock },
      { headers: { ...PUMP_HEADERS, Authorization: `Bearer ${privyToken}` }, timeout: 8000, validateStatus: () => true }
    );
  } catch {
    try {
      const legacyToken = buildLegacyAuthToken(keypair);
      await axios.post(
        `${PUMP_API}/coins/${mint}/set-nsfw`,
        { disable_replies: lock },
        { headers: { ...PUMP_HEADERS, Authorization: `Bearer ${legacyToken}` }, timeout: 8000, validateStatus: () => true }
      );
    } catch { /* non-creator or pump.fun unavailable */ }
  }

  return res.json({
    success: true,
    locked: lock,
    allowedPubkeys: lock ? Array.from(appLocks.get(mint) ?? []) : [],
  });
});

// ── POST /api/chat/lock ───────────────────────────────────────────────────────
router.post("/chat/lock", async (req, res) => {
  const { mint, privateKey: clientKey, lock } = req.body as { mint: string; privateKey?: string; lock: boolean };
  const privateKey = resolveKey(clientKey);
  if (!mint || lock === undefined)
    return res.status(400).json({ error: "mint and lock are required" });
  if (!privateKey)
    return res.status(400).json({ error: "No private key" });

  let keypair: Keypair;
  try { keypair = keypairFromPrivateKey(privateKey); }
  catch { return res.status(400).json({ error: "Invalid private key" }); }

  const publicKey = keypair.publicKey.toBase58();

  const lockEndpoints = [
    `${PUMP_API}/coins/${mint}/set-nsfw`,
    `https://chat-api-v1.pump.fun/coins/${mint}/set-nsfw`,
    `${PUMP_API}/coins/${mint}/replies/disable`,
  ];

  let lastError: { status?: number; data?: unknown; message?: string } = {};
  for (const getToken of [
    () => getPrivyToken(privateKey),
    () => Promise.resolve(buildLegacyAuthToken(keypair)),
  ]) {
    let token: string;
    try { token = await getToken(); }
    catch (err) { lastError = { message: (err as Error).message }; continue; }

    for (const url of lockEndpoints) {
      for (const body of [{ disable_replies: lock }, { disabled: lock }, { locked: lock }]) {
        try {
          const axRes = await axios.post(url, body, {
            headers: { ...PUMP_HEADERS, Authorization: `Bearer ${token}` },
            timeout: 12000,
            validateStatus: () => true,
          });
          if (axRes.status >= 200 && axRes.status < 300) {
            logger.info({ mint, publicKey, lock, url }, "Lock state set via pump.fun");
            return res.json({ success: true, locked: lock });
          }
          lastError = { status: axRes.status, data: axRes.data };
          if (axRes.status === 401 || axRes.status === 403) break;
        } catch (err) {
          lastError = { message: (err as Error).message };
        }
      }
    }
  }

  const status = lastError.status ?? 500;
  const rawMsg = extractError(lastError.data ?? lastError.message);
  return res.json({
    success: false,
    error: status === 403 ? "Only the coin creator can lock/unlock replies." : rawMsg.slice(0, 200),
  });
});

// ── POST /api/chat/ban ───────────────────────────────────────────────────────
router.post("/chat/ban", async (req, res) => {
  const { mint, privateKey: clientKey, banAddress } = req.body as { mint: string; privateKey?: string; banAddress: string };
  const privateKey = resolveKey(clientKey);
  if (!mint || !banAddress)
    return res.status(400).json({ error: "mint and banAddress are required" });
  if (!privateKey)
    return res.status(400).json({ error: "No private key" });

  let keypair: Keypair;
  try { keypair = keypairFromPrivateKey(privateKey); }
  catch { return res.status(400).json({ error: "Invalid private key" }); }

  const publicKey = keypair.publicKey.toBase58();

  let lastError: { status?: number; data?: unknown; message?: string } = {};
  for (const getToken of [
    () => getPrivyToken(privateKey),
    () => Promise.resolve(buildLegacyAuthToken(keypair)),
  ]) {
    try {
      const token = await getToken();
      const axRes = await axios.post(
        `${PUMP_API}/coins/${mint}/ban`,
        { ban_user: banAddress },
        { headers: { ...PUMP_HEADERS, Authorization: `Bearer ${token}` }, timeout: 12000, validateStatus: () => true }
      );
      if (axRes.status >= 200 && axRes.status < 300) {
        logger.info({ mint, publicKey, banAddress }, "User banned via pump.fun");
        return res.json({ success: true });
      }
      lastError = { status: axRes.status, data: axRes.data };
    } catch (err) {
      lastError = { message: (err as Error).message };
    }
  }

  const status = lastError.status ?? 500;
  const rawMsg = extractError(lastError.data ?? lastError.message);
  return res.json({
    success: false,
    error: status === 403 ? "Only the coin creator can ban users." : rawMsg.slice(0, 200),
  });
});

export { getPrivyTokens };
export default router;
