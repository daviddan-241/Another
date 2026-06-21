/**
 * Privy token helper — proxied through our own backend to avoid CORS.
 *
 * Instead of calling auth.privy.io directly from the browser (blocked by CORS),
 * we POST to /api/auth/token on our own server which does the Privy SIWS flow
 * server-side and returns the JWT.
 */

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface CachedToken {
  token: string;
  expiresAt: number;
}

// In-memory cache: pubkey → token info (derived from private key hash)
const tokenCache = new Map<string, CachedToken>();

function cacheKey(privateKeyB58: string): string {
  // Use last 8 chars of the key as a stable cache key (not the full key)
  return privateKeyB58.trim().slice(-8);
}

/**
 * Get a Privy JWT for the given private key via server-side proxy.
 * Caches the token until 60s before expiry.
 */
export async function getPrivyToken(privateKeyB58: string): Promise<string> {
  const key = privateKeyB58.trim();
  if (!key) throw new Error("No private key provided");

  const ck = cacheKey(key);
  const cached = tokenCache.get(ck);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const res = await fetch(`${BASE}/api/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privateKey: key }),
  });

  const data = await res.json() as { token?: string; error?: string };

  if (!res.ok || !data.token) {
    throw new Error(data.error ?? `Auth failed (${res.status})`);
  }

  // Cache for ~10 min (Privy tokens are short-lived; server manages precise expiry)
  tokenCache.set(ck, { token: data.token, expiresAt: Date.now() + 10 * 60_000 });
  return data.token;
}

/** Clear cached token for a given private key (e.g. when auth fails) */
export function clearPrivyToken(privateKeyB58: string): void {
  tokenCache.delete(cacheKey(privateKeyB58.trim()));
}

/** Get public key from private key via backend */
export function getPublicKey(_privateKeyB58: string): string {
  // Not used client-side anymore; kept for import compatibility
  return "";
}
