import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { logger } from "./logger";
import type { ScannedCoin } from "./scanner";
import {
  ensureRoom,
  addMessageListener,
  removeMessageListener,
  type LivechatMessage,
} from "./pumpLivechat";
import { pushNewChatMessage } from "./push";

let wss: WebSocketServer | null = null;

// ── Coin trade subscriptions (PumpPortal) ────────────────────────────────────
const coinSubscribers = new Map<string, Set<WebSocket>>();
let portalWs: WebSocket | null = null;
const subscribedMints = new Set<string>();

// ── Chat subscriptions (pump.fun livechat) ────────────────────────────────────
const chatSubs = new Map<WebSocket, Map<string, string>>(); // ws → Map<mint, listenerId>

// Coin metadata stashed from subscribe_chat messages — used in push notifications
const mintMeta = new Map<string, { name: string; symbol: string; creator: string }>();

function connectPumpPortal() {
  if (portalWs && (portalWs.readyState === WebSocket.OPEN || portalWs.readyState === WebSocket.CONNECTING)) return;
  try {
    portalWs = new WebSocket("wss://pumpportal.fun/api/data");

    portalWs.on("open", () => {
      logger.info("PumpPortal trade WS connected");
      for (const mint of subscribedMints) {
        portalWs?.send(JSON.stringify({ method: "subscribeTokenTrade", keys: [mint] }));
      }
    });

    portalWs.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        const mint = (msg.mint as string) ?? "";
        if (!mint) return;
        const subs = coinSubscribers.get(mint);
        if (!subs || subs.size === 0) return;
        const payload = JSON.stringify({ type: "trade", data: msg });
        for (const client of subs) {
          if (client.readyState === WebSocket.OPEN) client.send(payload);
        }
      } catch {}
    });

    portalWs.on("close", () => {
      logger.warn("PumpPortal trade WS closed, reconnecting in 3s");
      portalWs = null;
      setTimeout(connectPumpPortal, 3000);
    });

    portalWs.on("error", (err) => {
      logger.warn({ err: err.message }, "PumpPortal trade WS error");
      portalWs?.terminate();
      portalWs = null;
    });
  } catch (err) {
    logger.warn({ err }, "Failed to connect PumpPortal trade WS");
    setTimeout(connectPumpPortal, 5000);
  }
}

function subscribeMintToPortal(mint: string) {
  subscribedMints.add(mint);
  if (portalWs?.readyState === WebSocket.OPEN) {
    portalWs.send(JSON.stringify({ method: "subscribeTokenTrade", keys: [mint] }));
  } else {
    connectPumpPortal();
  }
}

function unsubscribeMintFromPortal(mint: string) {
  subscribedMints.delete(mint);
  if (portalWs?.readyState === WebSocket.OPEN) {
    portalWs.send(JSON.stringify({ method: "unsubscribeTokenTrade", keys: [mint] }));
  }
}

/** Normalise a LivechatMessage into the shape the frontend expects. */
function normaliseChatMsg(mint: string, msg: LivechatMessage): Record<string, unknown> {
  const tsRaw = msg.timestamp ?? msg.createdAt ?? Date.now();
  const ts = typeof tsRaw === "number" ? tsRaw : (Date.parse(String(tsRaw)) || Date.now());
  return {
    id: msg.id,
    mint,
    username: msg.username ?? null,
    user_pubkey: msg.address ?? msg.user_address ?? "",
    profile_image: msg.profile_image ?? msg.avatarUrl ?? null,
    text: msg.message ?? "",
    timestamp: ts,
  };
}

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: "/ws" });
  connectPumpPortal();

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    logger.info({ ip: req.socket.remoteAddress }, "WS client connected");
    const clientTradeMints = new Set<string>();
    const clientChatSubs = new Map<string, string>(); // mint → listenerId
    chatSubs.set(ws, clientChatSubs);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          mint?: string;
          privateKey?: string;
          pubkey?: string;
          coinName?: string;
          coinSymbol?: string;
          creatorPubkey?: string;
        };

        // ── Trade subscriptions ──────────────────────────────────────────────
        if (msg.type === "subscribe_coin" && msg.mint) {
          const mint = msg.mint.trim();
          if (!clientTradeMints.has(mint)) {
            clientTradeMints.add(mint);
            if (!coinSubscribers.has(mint)) {
              coinSubscribers.set(mint, new Set());
              subscribeMintToPortal(mint);
            }
            coinSubscribers.get(mint)!.add(ws);
          }

        } else if (msg.type === "unsubscribe_coin" && msg.mint) {
          const mint = msg.mint.trim();
          clientTradeMints.delete(mint);
          const subs = coinSubscribers.get(mint);
          if (subs) {
            subs.delete(ws);
            if (subs.size === 0) {
              coinSubscribers.delete(mint);
              unsubscribeMintFromPortal(mint);
            }
          }

        // ── Chat subscriptions ────────────────────────────────────────────────
        } else if (msg.type === "subscribe_chat" && msg.mint) {
          const mint = msg.mint.trim();

          // Stash coin metadata for push notifications (merge so existing creator isn't wiped)
          {
            const existing = mintMeta.get(mint);
            mintMeta.set(mint, {
              name: msg.coinName ?? existing?.name ?? mint.slice(0, 8),
              symbol: msg.coinSymbol ?? existing?.symbol ?? "",
              creator: msg.creatorPubkey ?? existing?.creator ?? "",
            });
          }

          if (clientChatSubs.has(mint)) return;

          const listenerId = addMessageListener(mint, (m, chatMsg) => {
            const normalised = normaliseChatMsg(m, chatMsg);

            // Forward to this WS client
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "chat_message",
                mint: m,
                message: normalised,
              }));
            }

            // Fire push notifications to background subscribers
            // Pass creator so "Dev replied!" title fires even without a push subscription
            const meta = mintMeta.get(m);
            void pushNewChatMessage(
              m,
              String(normalised.user_pubkey ?? ""),
              meta?.name ?? m.slice(0, 8),
              meta?.symbol ?? "",
              String(normalised.username ?? "Anon"),
              String(normalised.text ?? ""),
              meta?.creator,
            );
          });
          clientChatSubs.set(mint, listenerId);

          // Open the pump.fun livechat room (async, non-blocking)
          if (msg.privateKey?.trim()) {
            ensureRoom(msg.privateKey.trim(), mint)
              .then(() => logger.info({ mint }, "pump.fun livechat room ensured"))
              .catch((err: Error) => {
                logger.warn({ mint, err: err.message }, "Could not open pump.fun livechat room");
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "chat_error", mint, error: err.message }));
                }
              });
          }

        } else if (msg.type === "unsubscribe_chat" && msg.mint) {
          const mint = msg.mint.trim();
          const listenerId = clientChatSubs.get(mint);
          if (listenerId) {
            removeMessageListener(mint, listenerId);
            clientChatSubs.delete(mint);
          }
        }
      } catch {}
    });

    ws.on("close", () => {
      logger.info("WS client disconnected");
      for (const mint of clientTradeMints) {
        const subs = coinSubscribers.get(mint);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) {
            coinSubscribers.delete(mint);
            unsubscribeMintFromPortal(mint);
          }
        }
      }
      const chatSubMap = chatSubs.get(ws);
      if (chatSubMap) {
        for (const [mint, listenerId] of chatSubMap.entries()) {
          removeMessageListener(mint, listenerId);
        }
        chatSubs.delete(ws);
      }
    });

    ws.on("error", (err) => logger.warn({ err }, "WS error"));

    ws.send(JSON.stringify({ type: "connected", message: "Scanner connected" }));
  });

  logger.info("WebSocket server initialized on /ws");
}

function broadcast(msg: string): void {
  if (!wss) return;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

export function broadcastCoin(coin: ScannedCoin): void {
  broadcast(JSON.stringify({ type: "new_coin", coin }));
}

export function broadcastStreamEnded(coin: ScannedCoin): void {
  broadcast(JSON.stringify({ type: "stream_ended", coin }));
  logger.info({ mint: coin.mint, name: coin.name }, "Broadcast: stream_ended");
}
