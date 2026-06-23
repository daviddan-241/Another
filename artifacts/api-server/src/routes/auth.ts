/**
 * Server-side Privy SIWS auth.
 * POST /api/auth/token  { privateKey?: string }
 * Returns { token: string }
 *
 * If privateKey is omitted, falls back to PRIVATE_KEY env var.
 * Runs server-side so Privy's CORS policy never blocks it.
 *
 * POST /api/auth/session  { token: string, privateKey?: string }
 * Saves a manually-obtained Privy JWT (paste from pump.fun browser).
 * Extracts Privy App ID from the JWT aud claim automatically.
 */
import { Router } from "express";
import axios from "axios";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { logger } from "../lib/logger";

const router = Router();

// Default Privy App ID for pump.fun — may be overridden from a pasted JWT.
let privyAppId  = "cm1p2gzot03fzqty5xzgjgthq";
let privyClientId = "client-WY5brZnRUhFQnX6ip6yRzypC9WLtB9j8mFnq4cyPBMq8W";
const PRIVY_SDK = "react-auth:2.4.2";
// pump.fun uses privy.io as the SIWS domain (not pump.fun itself)
const DOMAIN    = "privy.io";
const URI       = "https://privy.io";
const STATEMENT = "By signing, you are proving you own this wallet and logging in. This does not initiate a transaction or cost any fees.";

function getPrivyHeaders() {
  return {
    "Content-Type":    "application/json",
    "privy-app-id":    privyAppId,
    "privy-client-id": privyClientId,
    "privy-client":    PRIVY_SDK,
    "Origin":          "https://pump.fun",
    "Referer":         "https://pump.fun/",
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
}

interface CachedTokens { tokens: string[]; expiresAt: number; }
// Tokens cached by pubkey
const cache = new Map<string, CachedTokens>();
// Manually-provided session tokens by pubkey (from pasting pump.fun JWT)
const manualTokens = new Map<string, { token: string; expiresAt: number }>();

function b64url(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function buildMessage(address: string, nonce: string, issuedAt: string, expiresAt: string): string {
  return [
    `${DOMAIN} wants you to sign in with your Solana account:`,
    address,
    ``,
    STATEMENT,
    ``,
    `URI: ${URI}`,
    `Version: 1`,
    `Chain ID: solana:mainnet`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
  ].join("\n");
}

/**
 * Extracts the Privy App ID from a JWT's aud claim.
 * The aud claim in Privy JWTs is an array like ["<privy-app-id>"].
 */
function extractPrivyAppId(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const aud = decoded["aud"];
    if (Array.isArray(aud) && typeof aud[0] === "string") return aud[0];
    if (typeof aud === "string") return aud;
    return null;
  } catch { return null; }
}

/**
 * Extracts expiry from a JWT exp claim. Returns 0 if not found.
 */
function jwtExpiry(jwt: string): number {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return 0;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const exp = decoded["exp"];
    if (typeof exp === "number") return exp * 1000; // convert to ms
    return 0;
  } catch { return 0; }
}

/**
 * Returns every JWT Privy hands back from the SIWS authenticate call.
 * Pump.fun's chat endpoint is fussy about *which* of these it'll accept —
 * we try them in order. Order: identity_token (Privy verifiable JWT),
 * access_token (session JWT), token (fallback / legacy field).
 */
async function getPrivyTokens(privateKeyB58: string): Promise<string[]> {
  const secretKey = bs58.decode(privateKeyB58.trim());
  const kp = nacl.sign.keyPair.fromSecretKey(secretKey);
  const pubkey = bs58.encode(kp.publicKey);

  // Check for a manually-saved token first — if valid, prefer it.
  const manual = manualTokens.get(pubkey);
  if (manual && manual.expiresAt > Date.now() + 60_000) {
    return [manual.token];
  }

  const cached = cache.get(pubkey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.tokens;
  }

  const PRIVY_API = "https://auth.privy.io/api/v1";
  const initRes = await axios.post<{ nonce: string; expires_at: string }>(
    `${PRIVY_API}/siws/init`,
    { address: pubkey },
    { headers: getPrivyHeaders(), timeout: 10_000, validateStatus: () => true },
  );
  if (initRes.status !== 200) {
    const detail = (initRes.data as Record<string, unknown>)?.error ?? JSON.stringify(initRes.data).slice(0, 200);
    throw new Error(`Privy siws/init failed (${initRes.status}): ${detail}`);
  }
  const init = initRes.data;

  const issuedAt = new Date().toISOString();
  const message  = buildMessage(pubkey, init.nonce, issuedAt, init.expires_at);
  const sig = nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey);

  // Try both signature encodings — Privy accepts base64url on newer SDK, bs58 on older.
  const sigVariants = [b64url(sig), bs58.encode(sig)];
  let lastPrivyError = "";

  for (const sigStr of sigVariants) {
    const authRes = await axios.post<{ token?: string; access_token?: string; identity_token?: string }>(
      `${PRIVY_API}/siws/authenticate`,
      {
        message,
        signature:        sigStr,
        chainId:          "solana:mainnet",
        walletClientType: "phantom",
        connectorType:    "injected",
      },
      { headers: getPrivyHeaders(), timeout: 10_000, validateStatus: () => true },
    );
    if (authRes.status === 200) {
      const auth = authRes.data;
      const tokens = [auth.identity_token, auth.access_token, auth.token]
        .filter((t): t is string => !!t);
      if (tokens.length > 0) {
        const expiresAt = new Date(init.expires_at).getTime() - 5 * 60_000;
        cache.set(pubkey, { tokens, expiresAt });
        return tokens;
      }
    }
    const errData = authRes.data as Record<string, unknown>;
    lastPrivyError = String(errData?.error ?? errData?.message ?? JSON.stringify(authRes.data).slice(0, 200));
    logger.warn({ status: authRes.status, sigEncoding: sigStr.length < 90 ? "bs58" : "b64url", err: lastPrivyError }, "Privy siws/authenticate variant failed");
  }

  throw new Error(`Privy siws/authenticate failed: ${lastPrivyError}`);
}

// Back-compat wrapper used elsewhere — returns the most-likely-to-work token.
async function getPrivyToken(privateKeyB58: string): Promise<string> {
  const [first] = await getPrivyTokens(privateKeyB58);
  return first;
}

export { getPrivyToken, getPrivyTokens };
export default router;

// POST /api/auth/token
router.post("/auth/token", async (req, res) => {
  const { privateKey: clientKey } = req.body as { privateKey?: string };
  const key = (clientKey ?? "").trim() || (process.env.PRIVATE_KEY ?? "").trim();

  if (!key) {
    return res.status(400).json({ error: "No private key — provide one or set PRIVATE_KEY on the server" });
  }

  try {
    bs58.decode(key);
    Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    return res.status(400).json({ error: "Invalid private key — must be base58" });
  }

  try {
    const tokens = await getPrivyTokens(key);
    logger.info({ count: tokens.length }, "Privy tokens issued server-side");
    return res.json({ token: tokens[0], tokens });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ msg }, "Server-side Privy auth failed");
    return res.status(502).json({ error: `Privy auth failed: ${msg.slice(0, 200)}` });
  }
});

/**
 * POST /api/auth/session
 * Body: { token: string, privateKey?: string }
 *
 * Saves a manually-obtained Privy JWT from pump.fun browser session.
 * - Extracts and saves the Privy App ID from the JWT aud claim.
 * - Associates the token with the wallet derived from privateKey (or PRIVATE_KEY env).
 * - From this point on, the app uses this token for livechat auth.
 */
router.post("/auth/session", async (req, res) => {
  const { token, privateKey: clientKey } = req.body as { token?: string; privateKey?: string };

  if (!token || typeof token !== "string" || !token.startsWith("eyJ")) {
    return res.status(400).json({ error: "Invalid token — paste the full JWT starting with eyJ…" });
  }

  // Extract App ID from JWT and update our global config
  const extractedAppId = extractPrivyAppId(token);
  if (extractedAppId && extractedAppId !== privyAppId) {
    logger.info({ old: privyAppId, new: extractedAppId }, "Privy App ID updated from JWT aud claim");
    privyAppId = extractedAppId;
  }

  const expiry = jwtExpiry(token);
  const expiresAt = expiry || (Date.now() + 24 * 60 * 60 * 1000); // default 24h if not parseable

  // If we have a private key, associate the token with that wallet
  const rawKey = (clientKey ?? "").trim() || (process.env.PRIVATE_KEY ?? "").trim();
  if (rawKey) {
    try {
      const secretKey = bs58.decode(rawKey);
      const kp = nacl.sign.keyPair.fromSecretKey(secretKey);
      const pubkey = bs58.encode(kp.publicKey);
      manualTokens.set(pubkey, { token, expiresAt });
      // Also invalidate any cached SIWS tokens for this key
      cache.delete(pubkey);
      logger.info({ pubkey: pubkey.slice(0, 8), extractedAppId }, "Manual Privy session token saved");
      return res.json({
        ok: true,
        pubkey,
        extractedAppId,
        expiresAt: new Date(expiresAt).toISOString(),
      });
    } catch {
      return res.status(400).json({ error: "Invalid private key — cannot derive wallet address" });
    }
  }

  // No private key — still save by token prefix as a fallback key
  const tokenKey = `anon:${token.slice(0, 16)}`;
  manualTokens.set(tokenKey, { token, expiresAt });
  logger.info({ extractedAppId }, "Manual Privy session token saved (no private key)");
  return res.json({ ok: true, extractedAppId, expiresAt: new Date(expiresAt).toISOString() });
});
