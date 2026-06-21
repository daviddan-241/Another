/**
 * Real pump.fun authentication via POST /auth/login.
 *
 * Pump.fun runs its own SIWS-style login that's simpler than the Privy dance:
 *   1. Build the signed message (SIWS-1 format, with pump.fun as the domain).
 *   2. Sign it locally with the user's Solana private key.
 *   3. POST { wallet, signature, message } → /auth/login.
 *   4. Receive { token } — that JWT is what /replies, /chat etc. expect.
 *
 * We cache the JWT per-pubkey until just before it expires.
 */
import axios from "axios";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";
import { logger } from "./logger";

const PUMP_API = "https://frontend-api-v3.pump.fun";

export const PUMP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Content-Type": "application/json",
  Origin: "https://pump.fun",
  Referer: "https://pump.fun/",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
};

interface Cached { token: string; expiresAt: number; }
const cache = new Map<string, Cached>();

function keypairFromPrivateKey(b58: string): Keypair {
  return Keypair.fromSecretKey(bs58.decode(b58.trim()));
}

/**
 * SIWS-style message body pump.fun's frontend signs. We try several common
 * shapes — the first one their /auth/login accepts wins.
 */
function buildMessageVariants(pubkey: string, ts: number): string[] {
  const iso = new Date(ts).toISOString();
  const nonceish = ts.toString();
  return [
    // Variant A — the format pump.fun's web client actually uses
    [
      "pump.fun wants you to sign in with your Solana account:",
      pubkey,
      "",
      "By signing, you are proving you own this wallet and logging in. This does not initiate a transaction or cost any fees.",
      "",
      "URI: https://pump.fun",
      "Version: 1",
      "Chain ID: solana:mainnet",
      `Nonce: ${nonceish}`,
      `Issued At: ${iso}`,
    ].join("\n"),
    // Variant B — short legacy form
    `Sign in to pump.fun: ${ts}`,
    // Variant C — bare timestamp pump.fun
    `pump.fun: ${ts}`,
  ];
}

/**
 * Returns a pump.fun JWT for the given Solana private key.
 * Tries each message variant against /auth/login until one returns 200 with a token.
 */
export async function getPumpJwt(privateKey: string): Promise<string> {
  const kp = keypairFromPrivateKey(privateKey);
  const pubkey = kp.publicKey.toBase58();

  const cached = cache.get(pubkey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const ts = Date.now();
  const variants = buildMessageVariants(pubkey, ts);

  let lastDetail = "";
  let firstAcceptedButNoToken: string = "";
  for (const message of variants) {
    const sigBytes = nacl.sign.detached(
      new TextEncoder().encode(message),
      kp.secretKey,
    );
    const signature = bs58.encode(sigBytes);

    try {
      const res = await axios.post<{ token?: string; expiresIn?: number }>(
        `${PUMP_API}/auth/login`,
        { wallet: pubkey, signature, message },
        { headers: PUMP_HEADERS, timeout: 8000, validateStatus: () => true },
      );
      if (res.status >= 200 && res.status < 300 && res.data?.token) {
        const expiresAt = Date.now() + (Math.max(60, res.data.expiresIn ?? 3600) * 1000);
        cache.set(pubkey, { token: res.data.token, expiresAt });
        logger.info({ pubkey: pubkey.slice(0, 8), variant: message.slice(0, 40) }, "pump.fun JWT acquired");
        return res.data.token;
      }
      // If signature was good but pump.fun returned no token (e.g. user not registered),
      // remember the message so we can register & retry below.
      if (res.status === 400 || res.status === 404 || res.status === 422) {
        firstAcceptedButNoToken = message;
      }
      lastDetail = `status=${res.status} body=${typeof res.data === "string" ? (res.data as string).slice(0, 120) : JSON.stringify(res.data ?? "").slice(0, 120)}`;
    } catch (err) {
      lastDetail = (err as Error).message;
    }
  }

  throw new Error(`pump.fun /auth/login rejected all message variants — ${lastDetail}${firstAcceptedButNoToken ? " (signature OK; wallet may need to register on pump.fun's website first)" : ""}`);
}

/** Convenience getter for the cached pubkey of a key, without burning a JWT call. */
export function pubkeyFromKey(privateKey: string): string {
  try { return keypairFromPrivateKey(privateKey).publicKey.toBase58(); }
  catch { return ""; }
}
