import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import nacl from "tweetnacl";
import bs58 from "bs58";
import axios from "axios";
import { logger } from "./logger";
import { initDb, saveMessage, getHistory, updateReactions } from "./chatdb";

/* ── Types ───────────────────────────────────────────────────────────────── */

interface SocketData {
  mint: string;
  pubkey: string;
  username: string;
  isDev: boolean;
  isGranted: boolean;
}

interface RoomState {
  locked: boolean;
  devPubkey: string | null;
  grantedPubkeys: Set<string>;
}

/* ── In-memory room state ────────────────────────────────────────────────── */

const rooms = new Map<string, RoomState>();

// Hoisted io reference so external modules can broadcast room events
// (used by AutoChat to lock newly-detected coins).
let ioRef: SocketIOServer | null = null;

function getRoom(mint: string): RoomState {
  if (!rooms.has(mint)) {
    rooms.set(mint, { locked: false, devPubkey: null, grantedPubkeys: new Set() });
  }
  return rooms.get(mint)!;
}

function onlineCount(io: SocketIOServer, mint: string): number {
  return io.sockets.adapter.rooms.get(`coin:${mint}`)?.size ?? 0;
}

/* ── Crypto helpers ──────────────────────────────────────────────────────── */

function verifySig(pubkeyB58: string, sigB58: string, message: string): boolean {
  try {
    const pubBytes = bs58.decode(pubkeyB58);
    const sigBytes = bs58.decode(sigB58);
    const msgBytes = new TextEncoder().encode(message);
    return nacl.sign.detached.verify(msgBytes, sigBytes, pubBytes);
  } catch { return false; }
}

async function fetchCreator(mint: string): Promise<string | null> {
  try {
    const r = await axios.get<{ creator?: string }>(
      `https://frontend-api-v3.pump.fun/coins/${mint}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "application/json",
          "Origin": "https://pump.fun",
          "Referer": "https://pump.fun/",
        },
        timeout: 8000,
      }
    );
    return r.data.creator ?? null;
  } catch { return null; }
}

/* ── Socket.io server ────────────────────────────────────────────────────── */

export function initChatRooms(server: HTTPServer): SocketIOServer {
  initDb();

  const io = new SocketIOServer(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io",
    transports: ["websocket", "polling"],
  });

  // Per-socket data (we track outside of socket.data for type safety)
  const socketData = new Map<string, SocketData>();

  // Expose io to other modules so AutoChat can lock rooms at runtime.
  ioRef = io;

  io.on("connection", (socket) => {
    logger.debug({ id: socket.id }, "Chat socket connected");

    /* ── JOIN room ─────────────────────────────────────────────────────── */
    socket.on("join", async (payload: { mint: string; pubkey?: string; username?: string }) => {
      const mint = String(payload.mint ?? "").trim();
      if (!mint) return;

      // Leave previous room
      const prev = socketData.get(socket.id);
      if (prev) {
        await socket.leave(`coin:${prev.mint}`);
        socketData.delete(socket.id);
        const prevRoom = getRoom(prev.mint);
        io.to(`coin:${prev.mint}`).emit("room:status", {
          locked: prevRoom.locked,
          onlineCount: onlineCount(io, prev.mint),
        });
      }

      const pubkey = String(payload.pubkey ?? "").trim();
      const username = pubkey
        ? (payload.username ?? `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`)
        : "Anon";

      const room = getRoom(mint);
      const isDev = !!pubkey && room.devPubkey === pubkey;
      const isGranted = !!pubkey && room.grantedPubkeys.has(pubkey);

      const sd: SocketData = { mint, pubkey, username, isDev, isGranted };
      socketData.set(socket.id, sd);

      await socket.join(`coin:${mint}`);

      const history = getHistory(mint, 80);
      const count = onlineCount(io, mint);

      socket.emit("joined", {
        history,
        locked: room.locked,
        onlineCount: count,
        isDev,
        isGranted,
        devPubkey: room.devPubkey,
      });

      // Update everyone else's online count
      socket.to(`coin:${mint}`).emit("room:status", {
        locked: room.locked,
        onlineCount: count,
      });

      logger.info({ mint, pubkey: pubkey || "anon" }, "Socket joined room");
    });

    /* ── SEND message ──────────────────────────────────────────────────── */
    socket.on("send", (payload: { text: string }) => {
      const sd = socketData.get(socket.id);
      if (!sd) return;

      const room = getRoom(sd.mint);
      if (room.locked && !sd.isDev && !sd.isGranted) {
        socket.emit("error", { code: "LOCKED", message: "Room is locked. Request access from the dev." });
        return;
      }

      const text = String(payload.text ?? "").trim().slice(0, 500);
      if (!text) return;

      const msg = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        mint: sd.mint,
        pubkey: sd.pubkey,
        username: sd.username,
        text,
        timestamp: Date.now(),
        reactions: {} as Record<string, string[]>,
        isDev: sd.isDev,
      };

      saveMessage(msg);
      io.to(`coin:${sd.mint}`).emit("message", msg);
    });

    /* ── TYPING indicator ──────────────────────────────────────────────── */
    socket.on("typing", (payload: { isTyping: boolean }) => {
      const sd = socketData.get(socket.id);
      if (!sd) return;
      socket.to(`coin:${sd.mint}`).emit("typing", {
        pubkey: sd.pubkey,
        username: sd.username,
        isTyping: !!payload.isTyping,
      });
    });

    /* ── REACT to message ──────────────────────────────────────────────── */
    socket.on("react", (payload: { messageId: string; emoji: string }) => {
      const sd = socketData.get(socket.id);
      if (!sd || !sd.pubkey) return;

      const history = getHistory(sd.mint, 200);
      const msg = history.find(m => m.id === payload.messageId);
      if (!msg) return;

      const reactions = { ...msg.reactions };
      const pubkey = sd.pubkey;

      if (!reactions[payload.emoji]) reactions[payload.emoji] = [];
      const idx = reactions[payload.emoji].indexOf(pubkey);
      if (idx >= 0) {
        reactions[payload.emoji].splice(idx, 1);
        if (reactions[payload.emoji].length === 0) delete reactions[payload.emoji];
      } else {
        reactions[payload.emoji].push(pubkey);
      }

      updateReactions(sd.mint, payload.messageId, reactions);
      io.to(`coin:${sd.mint}`).emit("reaction", { messageId: payload.messageId, reactions });
    });

    /* ── DEV CLAIM (verify as coin creator) ────────────────────────────── */
    socket.on("dev:claim", async (payload: { pubkey: string; signature: string; timestamp: number; mint: string }) => {
      const sd = socketData.get(socket.id);
      if (!sd) return;

      const { pubkey, signature, timestamp, mint } = payload;
      if (!pubkey || !signature || !timestamp || !mint) {
        socket.emit("error", { code: "BAD_PAYLOAD", message: "Missing fields." });
        return;
      }

      // Timestamp freshness check (5 min)
      if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
        socket.emit("error", { code: "EXPIRED", message: "Signature expired. Try again." });
        return;
      }

      const message = `PumpRadar dev claim: ${mint} at ${timestamp}`;
      if (!verifySig(pubkey, signature, message)) {
        socket.emit("error", { code: "BAD_SIG", message: "Signature invalid — check your private key." });
        return;
      }

      const creator = await fetchCreator(mint);
      if (!creator) {
        socket.emit("error", { code: "FETCH_FAIL", message: "Could not fetch coin creator from pump.fun." });
        return;
      }

      if (creator.toLowerCase() !== pubkey.toLowerCase()) {
        socket.emit("error", {
          code: "NOT_DEV",
          message: `Your wallet (${pubkey.slice(0, 6)}…) is not the creator of this coin.`,
        });
        return;
      }

      // Grant dev status
      const room = getRoom(mint);
      room.devPubkey = pubkey;
      sd.isDev = true;

      socket.emit("dev:verified", { pubkey });
      io.to(`coin:${mint}`).emit("dev:online", { pubkey });
      logger.info({ mint, pubkey }, "Dev verified");
    });

    /* ── ROOM LOCK (dev only) ───────────────────────────────────────────── */
    socket.on("room:lock", () => {
      const sd = socketData.get(socket.id);
      if (!sd?.isDev) { socket.emit("error", { code: "NOT_DEV", message: "Only the dev can lock the room." }); return; }
      const room = getRoom(sd.mint);
      room.locked = true;
      const count = onlineCount(io, sd.mint);
      io.to(`coin:${sd.mint}`).emit("room:status", { locked: true, onlineCount: count });
      logger.info({ mint: sd.mint }, "Room locked by dev");
    });

    /* ── ROOM UNLOCK (dev only) ─────────────────────────────────────────── */
    socket.on("room:unlock", () => {
      const sd = socketData.get(socket.id);
      if (!sd?.isDev) return;
      const room = getRoom(sd.mint);
      room.locked = false;
      const count = onlineCount(io, sd.mint);
      io.to(`coin:${sd.mint}`).emit("room:status", { locked: false, onlineCount: count });
      logger.info({ mint: sd.mint }, "Room unlocked by dev");
    });

    /* ── REQUEST ACCESS (user → dev notification) ───────────────────────── */
    socket.on("access:request", () => {
      const sd = socketData.get(socket.id);
      if (!sd) return;
      const room = getRoom(sd.mint);
      if (!room.locked) return;
      // Broadcast to everyone in room (dev will see it as a notification)
      io.to(`coin:${sd.mint}`).emit("access:requested", { pubkey: sd.pubkey, username: sd.username });
    });

    /* ── GRANT ACCESS (dev only) ───────────────────────────────────────── */
    socket.on("access:grant", (payload: { pubkey: string }) => {
      const sd = socketData.get(socket.id);
      if (!sd?.isDev) return;
      const room = getRoom(sd.mint);
      room.grantedPubkeys.add(payload.pubkey);
      // Update the target user's socket data
      for (const [sid, data] of socketData.entries()) {
        if (data.mint === sd.mint && data.pubkey === payload.pubkey) {
          data.isGranted = true;
          io.to(sid).emit("access:result", { granted: true, pubkey: payload.pubkey });
        }
      }
      io.to(`coin:${sd.mint}`).emit("access:result", { granted: true, pubkey: payload.pubkey });
    });

    /* ── DENY ACCESS (dev only) ────────────────────────────────────────── */
    socket.on("access:deny", (payload: { pubkey: string }) => {
      const sd = socketData.get(socket.id);
      if (!sd?.isDev) return;
      io.to(`coin:${sd.mint}`).emit("access:result", { granted: false, pubkey: payload.pubkey });
    });

    /* ── DISCONNECT ────────────────────────────────────────────────────── */
    socket.on("disconnect", () => {
      const sd = socketData.get(socket.id);
      socketData.delete(socket.id);
      if (sd) {
        setTimeout(() => {
          const room = getRoom(sd.mint);
          const count = onlineCount(io, sd.mint);
          io.to(`coin:${sd.mint}`).emit("room:status", { locked: room.locked, onlineCount: count });
        }, 150);
      }
    });
  });

  logger.info("Socket.io chat rooms initialized");
  return io;
}

/**
 * AutoChat helper — lock a coin's in-app chat so only the operator and
 * the coin creator can post. Everyone else gets the standard LOCKED error.
 * Idempotent: re-running on the same mint is safe.
 */
export function lockRoomForAuto(mint: string, operatorPubkey: string, creatorPubkey: string | null): void {
  const room = getRoom(mint);
  room.locked = true;
  room.devPubkey = creatorPubkey ?? operatorPubkey;
  room.grantedPubkeys.clear();
  room.grantedPubkeys.add(operatorPubkey);
  if (creatorPubkey && creatorPubkey !== operatorPubkey) {
    room.grantedPubkeys.add(creatorPubkey);
  }
  if (ioRef) {
    const count = onlineCount(ioRef, mint);
    ioRef.to(`coin:${mint}`).emit("room:status", { locked: true, onlineCount: count });
  }
  logger.info(
    { mint, operator: operatorPubkey.slice(0, 8), creator: creatorPubkey?.slice(0, 8) ?? "?" },
    "Room auto-locked for new coin",
  );
}

/** Read-only inspection of a room's state — used by /api/config/autochat. */
export function getRoomState(mint: string): {
  locked: boolean; devPubkey: string | null; granted: string[];
} {
  const room = getRoom(mint);
  return {
    locked: room.locked,
    devPubkey: room.devPubkey,
    granted: Array.from(room.grantedPubkeys),
  };
}
