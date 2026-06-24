/**
 * Real pump.fun livechat — reverse-engineered from pump.fun's own browser
 * bundle. Events confirmed against chunks downloaded 2026-06-09:
 *
 *   transport: socket.io v4 over WebSocket
 *   url       : wss://livestream-api.pump.fun
 *   auth      : { token: <privyJwt> } passed as Socket.IO auth payload
 *
 *   Server → client events:
 *     newMessage, messageDeleted, messagePinned, messageUnpinned,
 *     userMessagesWiped, messageReactionUpdated,
 *     roomModeratorAssigned, roomModeratorUnassigned
 *
 *   Client → server emits (all with ack callback):
 *     joinRoom        { roomId, username }
 *     leaveRoom       { roomId, username }
 *     getMessageHistory { roomId, before, limit }
 *     sendMessage     { roomId, message, username, replyToId, replyPreview }
 *
 * We keep ONE Socket.IO client per (mint, pubkey) pair, reuse it across
 * requests, and tear it down after 5 min of inactivity to free sockets.
 *
 * AUTH: pump.fun's livechat requires a Privy JWT (not a pump.fun SIWS token).
 * We try each Privy token variant (identity_token, access_token) in order.
 *
 * REAL-TIME PUSH: callers can register message listeners per mint via
 * addMessageListener / removeMessageListener. The listener fires for every
 * newMessage event received on any room for that mint. websocket.ts uses
 * this to push messages to connected browser clients.
 */
import { io, type Socket } from "socket.io-client";
import { logger } from "./logger";
import { getPrivyTokens } from "../routes/auth";

const LIVECHAT_URL = "wss://livestream-api.pump.fun";
const IDLE_TTL_MS  = 5 * 60 * 1000;

export interface LivechatMessage {
  id: string;
  roomId?: string;
  message?: string;
  username?: string | null;
  address?: string;
  user_address?: string;
  profile_image?: string | null;
  avatarUrl?: string | null;
  timestamp?: number | string;
  createdAt?: number | string;
  replyToId?: string | null;
}

export type MessageListener = (mint: string, msg: LivechatMessage) => void;

interface RoomEntry {
  socket: Socket;
  ready: Promise<void>;
  history: LivechatMessage[];
  pubkey: string;
  username: string;
  lastUsed: number;
  mint: string;
}

const rooms = new Map<string, RoomEntry>();
const HISTORY_CAP = 200;

// Per-mint listener registry — keyed mint → (listenerId → callback)
const mintListeners = new Map<string, Map<string, MessageListener>>();
let listenerSeq = 0;

/** Register a callback that fires whenever a new message arrives for `mint`.
 *  Returns a listener ID you must pass to removeMessageListener to clean up. */
export function addMessageListener(mint: string, cb: MessageListener): string {
  const id = String(++listenerSeq);
  if (!mintListeners.has(mint)) mintListeners.set(mint, new Map());
  mintListeners.get(mint)!.set(id, cb);
  return id;
}

/** Remove a previously registered listener. */
export function removeMessageListener(mint: string, id: string): void {
  const map = mintListeners.get(mint);
  if (!map) return;
  map.delete(id);
  if (map.size === 0) mintListeners.delete(mint);
}

/** Fire all registered listeners for a mint. */
function fireListeners(mint: string, msg: LivechatMessage): void {
  const map = mintListeners.get(mint);
  if (!map) return;
  for (const cb of map.values()) {
    try { cb(mint, msg); } catch {}
  }
}

function key(mint: string, pubkey: string): string { return `${mint}::${pubkey}`; }

function shortName(pubkey: string): string {
  return pubkey.length > 12 ? pubkey.slice(0, 6) + "…" + pubkey.slice(-4) : pubkey;
}

/** Open (or reuse) a pump.fun livechat socket for this key+mint pair.
 *  Also exported so websocket.ts can ensure a room is open before subscribing. */
export async function ensureRoom(privateKey: string, mint: string): Promise<void> {
  await openRoom(privateKey, mint);
}

async function openRoom(privateKey: string, mint: string, privyJwt?: string): Promise<RoomEntry> {
  const { default: bs58 } = await import("bs58");
  const nacl = (await import("tweetnacl")).default;
  const sk = bs58.decode(privateKey.trim());
  const kp = nacl.sign.keyPair.fromSecretKey(sk);
  const pubkey = bs58.encode(kp.publicKey);
  const username = shortName(pubkey);

  const k = key(mint, pubkey);
  const existing = rooms.get(k);
  if (existing) {
    existing.lastUsed = Date.now();
    await existing.ready;
    return existing;
  }

  // If a JWT is provided directly, use it without SIWS
  let tokens: string[];
  if (privyJwt && privyJwt.startsWith("eyJ")) {
    tokens = [privyJwt];
    logger.info({ mint, pubkey: pubkey.slice(0, 8) }, "pump.fun livechat: using provided Privy JWT directly");
  } else {
    tokens = await getPrivyTokens(privateKey);
    if (!tokens.length) throw new Error("No Privy tokens available");
  }

  let lastErr = "";
  for (const jwt of tokens) {
    try {
      const entry = await _tryOpenRoom(jwt, pubkey, username, mint, k);
      return entry;
    } catch (err) {
      lastErr = (err as Error).message;
      logger.warn({ mint, pubkey: pubkey.slice(0, 8), err: lastErr }, "pump.fun livechat token variant failed, trying next");
    }
  }
  throw new Error(`pump.fun livechat: all token variants failed — ${lastErr}`);
}

async function _tryOpenRoom(jwt: string, pubkey: string, username: string, mint: string, k: string): Promise<RoomEntry> {
  const socket = io(LIVECHAT_URL, {
    transports: ["websocket"],
    auth: { token: jwt },
    extraHeaders: { Authorization: `Bearer ${jwt}` },
    reconnection: true,
    reconnectionAttempts: 3,
    timeout: 8000,
  });

  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("pump.fun livechat connect timeout"));
    }, 10_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.emit("joinRoom", { roomId: mint, username }, (ack: unknown) => {
        logger.info({ mint, pubkey: pubkey.slice(0, 8), ack: JSON.stringify(ack).slice(0, 120) }, "pump.fun joinRoom ack");
        resolve();
      });
    });
    socket.once("connect_error", (err) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error(`pump.fun livechat connect_error: ${err.message}`));
    });
  });

  const entry: RoomEntry = { socket, ready, history: [], pubkey, username, lastUsed: Date.now(), mint };
  rooms.set(k, entry);

  await ready;

  socket.on("newMessage", (msg: LivechatMessage) => {
    if (!msg?.id) return;
    entry.history.push(msg);
    if (entry.history.length > HISTORY_CAP) entry.history.splice(0, entry.history.length - HISTORY_CAP);
    socket.emit("messageReceived", { messageId: msg.id });
    // Push to all registered listeners for this mint (e.g. websocket.ts)
    fireListeners(mint, msg);
  });

  socket.on("messageDeleted", (evt: { messageId: string }) => {
    if (!evt?.messageId) return;
    entry.history = entry.history.filter((m) => m.id !== evt.messageId);
  });

  socket.on("disconnect", (reason) => {
    logger.warn({ mint, reason }, "pump.fun livechat disconnected");
    rooms.delete(k);
  });

  return entry;
}

/** Fetch up to 50 most recent messages for a coin. */
export async function fetchHistory(privateKey: string, mint: string, privyJwt?: string): Promise<LivechatMessage[]> {
  const entry = await openRoom(privateKey, mint, privyJwt);
  return new Promise<LivechatMessage[]>((resolve) => {
    const fallbackTimer = setTimeout(() => resolve(entry.history.slice()), 4_000);
    entry.socket.emit(
      "getMessageHistory",
      { roomId: mint, before: null, limit: 50 },
      (ack: unknown) => {
        clearTimeout(fallbackTimer);
        const arr = parseHistoryAck(ack);
        if (arr.length > 0) {
          entry.history = arr.slice(-HISTORY_CAP);
        }
        resolve(entry.history.slice());
      },
    );
  });
}

/** Post a message to pump.fun's real livechat. Returns the server ack. */
export async function sendMessage(privateKey: string, mint: string, text: string, privyJwt?: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const entry = await openRoom(privateKey, mint, privyJwt);
  return new Promise<{ ok: boolean; id?: string; error?: string }>((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: "pump.fun sendMessage ack timeout" }), 8_000);
    entry.socket.emit(
      "sendMessage",
      { roomId: mint, message: text, username: entry.username, replyToId: null, replyPreview: null },
      (ack: { id?: string; error?: string; error_code?: string } | undefined) => {
        clearTimeout(t);
        if (!ack) return resolve({ ok: false, error: "no ack from pump.fun" });
        if (ack.error) return resolve({ ok: false, error: ack.error });
        if (ack.id) {
          const newMsg: LivechatMessage = {
            id: ack.id,
            roomId: mint,
            message: text,
            username: entry.username,
            address: entry.pubkey,
            timestamp: Date.now(),
          };
          entry.history.push(newMsg);
          if (entry.history.length > HISTORY_CAP) entry.history.splice(0, entry.history.length - HISTORY_CAP);
          // Also fire listeners so WS clients see the sent message immediately
          fireListeners(mint, newMsg);
        }
        resolve({ ok: true, id: ack.id });
      },
    );
  });
}

function parseHistoryAck(ack: unknown): LivechatMessage[] {
  if (!ack) return [];
  if (Array.isArray(ack)) return ack as LivechatMessage[];
  if (typeof ack === "object") {
    const o = ack as Record<string, unknown>;
    for (const k of ["messages", "history", "data", "items", "results"]) {
      if (Array.isArray(o[k])) return o[k] as LivechatMessage[];
    }
  }
  return [];
}

// Idle GC — close sockets unused for 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of rooms.entries()) {
    if (now - entry.lastUsed > IDLE_TTL_MS) {
      try { entry.socket.emit("leaveRoom", { roomId: entry.mint, username: entry.username }); } catch {}
      try { entry.socket.disconnect(); } catch {}
      rooms.delete(k);
    }
  }
}, 60_000).unref?.();
