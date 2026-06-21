/**
 * Web Push Notification manager.
 *
 * VAPID keys must be stable across restarts — set VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY as env vars on Render (or anywhere else you deploy).
 *
 * If they are not set, keys are generated at startup and logged so you can
 * copy them into your environment.
 */
import webpush from "web-push";
import { logger } from "./logger";

/* ── VAPID setup ──────────────────────────────────────────────────────────── */

function getOrGenerateVapidKeys(): { publicKey: string; privateKey: string } {
  const pub = process.env["VAPID_PUBLIC_KEY"];
  const priv = process.env["VAPID_PRIVATE_KEY"];
  if (pub && priv) return { publicKey: pub, privateKey: priv };

  const keys = webpush.generateVAPIDKeys();
  logger.warn(
    { vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey },
    "⚠ VAPID keys generated at startup — push subscriptions will break on next restart. " +
    "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars to fix this (copy values above).",
  );
  return keys;
}

const VAPID_EMAIL = process.env["VAPID_EMAIL"] ?? "mailto:admin@pumpradar.app";
const vapidKeys = getOrGenerateVapidKeys();

webpush.setVapidDetails(VAPID_EMAIL, vapidKeys.publicKey, vapidKeys.privateKey);

export function getVapidPublicKey(): string {
  return vapidKeys.publicKey;
}

/* ── Subscription store ───────────────────────────────────────────────────── */

interface StoredSub {
  subscription: webpush.PushSubscription;
  /** Wallet pubkey of the subscriber (to suppress self-notifications) */
  pubkey: string;
  /** Coins the subscriber is watching */
  mints: Set<string>;
  addedAt: number;
}

// Map: endpoint → StoredSub
const subs = new Map<string, StoredSub>();

// Map: mint → creator pubkey (so we can send "Dev replied!" notifications)
const mintCreators = new Map<string, string>();

export function addPushSubscription(
  subscription: webpush.PushSubscription,
  mint: string,
  pubkey = "",
  creatorPubkey = "",
): void {
  const existing = subs.get(subscription.endpoint);
  if (existing) {
    existing.mints.add(mint);
    existing.pubkey = pubkey || existing.pubkey;
  } else {
    subs.set(subscription.endpoint, {
      subscription,
      pubkey,
      mints: new Set([mint]),
      addedAt: Date.now(),
    });
  }
  if (creatorPubkey) mintCreators.set(mint, creatorPubkey);
}

export function removePushSubscription(endpoint: string): void {
  subs.delete(endpoint);
}

export function unsubscribeFromMint(endpoint: string, mint: string): void {
  const s = subs.get(endpoint);
  if (!s) return;
  s.mints.delete(mint);
  if (s.mints.size === 0) subs.delete(endpoint);
}

/* ── Send helpers ─────────────────────────────────────────────────────────── */

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

async function sendOne(
  stored: StoredSub,
  payload: PushPayload,
): Promise<void> {
  try {
    await webpush.sendNotification(
      stored.subscription,
      JSON.stringify(payload),
      { TTL: 3600 },
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 410 || status === 404) {
      // Subscription is gone (uninstalled, expired)
      subs.delete(stored.subscription.endpoint);
      logger.info({ endpoint: stored.subscription.endpoint.slice(-20) }, "Push sub expired/removed");
    } else {
      logger.warn({ err, status }, "Push send failed");
    }
  }
}

/**
 * Send a push notification to every subscriber watching `mint`,
 * EXCEPT the subscriber whose wallet matches `senderPubkey`.
 *
 * If the sender is the coin creator (dev), the title uses "🔔 Dev replied!"
 * so the user knows it's the dev talking — even with the app in background.
 *
 * @param knownCreator  Optional creator pubkey from WebSocket meta (used even
 *                      if no push subscription has been registered yet).
 */
export async function pushNewChatMessage(
  mint: string,
  senderPubkey: string,
  coinName: string,
  coinSymbol: string,
  username: string,
  text: string,
  knownCreator?: string,
): Promise<void> {
  // Populate mintCreators from WebSocket meta so creator detection works
  // even when no one has subscribed to push yet.
  if (knownCreator && !mintCreators.has(mint)) {
    mintCreators.set(mint, knownCreator);
  }
  const isCreator = !!(senderPubkey && mintCreators.get(mint) === senderPubkey);
  const coinLabel = coinSymbol ? `$${coinSymbol}` : coinName;

  const title = isCreator
    ? `🔔 Dev replied in ${coinLabel}`
    : `${coinName} ${coinLabel}`;

  const payload: PushPayload = {
    title,
    body: `${username}: ${text.slice(0, 120)}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `chat-${mint}`,
    data: {
      mint,
      url: `/chat/${mint}`,
      isDevMessage: isCreator,
    },
  };

  const sends: Promise<void>[] = [];
  for (const stored of subs.values()) {
    if (!stored.mints.has(mint)) continue;
    if (senderPubkey && stored.pubkey === senderPubkey) continue; // skip self
    sends.push(sendOne(stored, payload));
  }
  if (sends.length > 0) await Promise.allSettled(sends);
}

/** Test push — sends a single test notification to one subscription endpoint. */
export async function sendTestPush(endpoint: string): Promise<boolean> {
  const stored = subs.get(endpoint);
  if (!stored) return false;
  await sendOne(stored, {
    title: "PumpRadar 🎯 — push works!",
    body: "You'll get notified when the dev replies in coins you're watching.",
    icon: "/icon-192.png",
    tag: "test",
    data: { url: "/" },
  });
  return true;
}
