/**
 * Push notification routes.
 *
 * GET  /api/push/vapid-key          → { publicKey }
 * POST /api/push/subscribe           → { ok }
 * POST /api/push/unsubscribe         → { ok }
 * POST /api/push/test                → { ok }
 */
import { Router } from "express";
import {
  getVapidPublicKey,
  addPushSubscription,
  removePushSubscription,
  unsubscribeFromMint,
  sendTestPush,
} from "../lib/push";
import type { PushSubscription } from "web-push";

const router = Router();

router.get("/push/vapid-key", (_req, res) => {
  return res.json({ publicKey: getVapidPublicKey() });
});

router.post("/push/subscribe", (req, res) => {
  const { subscription, mint, pubkey, creatorPubkey } = req.body as {
    subscription?: PushSubscription;
    mint?: string;
    pubkey?: string;
    creatorPubkey?: string;
  };
  if (!subscription?.endpoint || !subscription.keys || !mint) {
    return res.status(400).json({ error: "subscription and mint are required" });
  }
  addPushSubscription(subscription, mint, pubkey ?? "", creatorPubkey ?? "");
  return res.json({ ok: true });
});

router.post("/push/unsubscribe", (req, res) => {
  const { endpoint, mint } = req.body as { endpoint?: string; mint?: string };
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  if (mint) {
    unsubscribeFromMint(endpoint, mint);
  } else {
    removePushSubscription(endpoint);
  }
  return res.json({ ok: true });
});

router.post("/push/test", async (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  const ok = await sendTestPush(endpoint);
  if (!ok) return res.status(404).json({ error: "Subscription not found — subscribe first" });
  return res.json({ ok: true });
});

export default router;
