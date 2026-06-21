import fs from "fs";
import path from "path";
import { logger } from "./logger";

export interface StoredMessage {
  id: string;
  mint: string;
  pubkey: string;
  username: string;
  text: string;
  timestamp: number;
  reactions: Record<string, string[]>;
  isDev?: boolean;
}

const DB_FILE = path.resolve(process.cwd(), "chat-messages.json");
const MAX_PER_COIN = 200;

// In-memory store
const store = new Map<string, StoredMessage[]>();

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const obj: Record<string, StoredMessage[]> = {};
      for (const [mint, msgs] of store.entries()) {
        obj[mint] = msgs.slice(-MAX_PER_COIN);
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(obj));
    } catch (e) {
      logger.warn({ msg: (e as Error).message }, "Chat DB persist error");
    }
  }, 800);
}

export function initDb(): void {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf8");
      const data = JSON.parse(raw) as Record<string, StoredMessage[]>;
      for (const [mint, msgs] of Object.entries(data)) {
        store.set(mint, Array.isArray(msgs) ? msgs : []);
      }
      logger.info({ coins: store.size }, "Chat DB loaded from disk");
    }
  } catch (e) {
    logger.warn({ msg: (e as Error).message }, "Chat DB load error — starting fresh");
  }
}

export function saveMessage(msg: StoredMessage): void {
  const list = store.get(msg.mint) ?? [];
  list.push(msg);
  if (list.length > MAX_PER_COIN) list.splice(0, list.length - MAX_PER_COIN);
  store.set(msg.mint, list);
  persist();
}

export function getHistory(mint: string, limit = 50): StoredMessage[] {
  const msgs = store.get(mint) ?? [];
  return msgs.slice(-limit);
}

export function updateReactions(mint: string, messageId: string, reactions: Record<string, string[]>): void {
  const msgs = store.get(mint) ?? [];
  const msg = msgs.find(m => m.id === messageId);
  if (msg) {
    msg.reactions = reactions;
    persist();
  }
}
