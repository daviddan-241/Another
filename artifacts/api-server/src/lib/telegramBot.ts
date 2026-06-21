/**
 * Telegram Bot — full two-way communication.
 *
 * WHAT IT DOES:
 *   1. OUTGOING: send alerts (coin detected, dev replied, approval buttons)
 *   2. INCOMING: respond to ANYONE who messages the bot first on Telegram
 *   3. LONG POLL: no webhooks needed — just polls api.telegram.org every 3s
 *   4. APPROVAL FLOW: [Approve] [Skip] buttons for holder-locked coins
 *   5. DM THE USER: when dev responds on pump.fun, we DM you everything
 *
 * WORKS OFFLINE — no AI, no external APIs, just templates.
 */
import axios from "axios";
import { logger } from "./logger";
import type { ScannedCoin } from "./scanner";

const API = (token: string) => `https://api.telegram.org/bot${token}`;

let pollOffset = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const callbackHandlers = new Map<string, (chatId: string, data: string) => Promise<void> | void>();
const messageHandlers: Array<(msg: Record<string, unknown>) => void> = [];

/** Register a handler for incoming Telegram messages (anyone who DMs the bot). */
export function onTGMessage(handler: (msg: Record<string, unknown>) => void): void {
  messageHandlers.push(handler);
}

/** Start long-polling. Safe to call multiple times. */
export function startTelegramBot(): void {
  if (pollTimer) return;
  if (!(process.env.TELEGRAM_BOT_TOKEN ?? "").trim()) {
    logger.info("Telegram bot token not set — polling skipped");
    return;
  }
  logger.info("Telegram bot polling started");
  void pollOnce();
  pollTimer = setInterval(() => { void pollOnce(); }, 3_000);
  pollTimer.unref?.();
}

export function stopTelegramBot(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

export function onCallbackQuery(prefix: string, handler: (chatId: string, data: string) => Promise<void> | void): void {
  callbackHandlers.set(prefix, handler);
}

async function pollOnce(): Promise<void> {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) return;
  try {
    const r = await axios.get(`${API(token)}/getUpdates`, {
      params: {
        timeout: 25,
        offset: pollOffset || undefined,
        allowed_updates: JSON.stringify(["message", "callback_query"]),
      },
      timeout: 30_000,
    });
    const updates = (r.data?.result ?? []) as Array<Record<string, unknown>>;
    for (const u of updates) {
      pollOffset = (u.update_id as number) + 1;
      const cb = u.callback_query as Record<string, unknown> | undefined;
      if (cb) {
        await handleCallback(cb, token);
        continue;
      }
      const m = u.message as Record<string, unknown> | undefined;
      if (m) {
        for (const h of messageHandlers) {
          try { h(m); } catch (e) {
            logger.warn({ err: (e as Error).message }, "TG message handler error");
          }
        }
      }
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (!/timeout/i.test(msg)) logger.warn({ err: msg }, "TG poll error");
  }
}

async function handleCallback(cb: Record<string, unknown>, token: string): Promise<void> {
  const data  = String(cb.data ?? "");
  const from  = cb.from as Record<string, unknown> | undefined;
  const chat  = ((cb.message as Record<string, unknown> | undefined)?.chat ?? {}) as Record<string, unknown>;
  const chatId = String(chat.id ?? from?.id ?? "");
  const cbId   = String(cb.id ?? "");

  try {
    const reply = data.startsWith("approve:") ? "✅ Executing…" : data.startsWith("skip:") ? "⏭ Skipped" : "OK";
    await axios.post(`${API(token)}/answerCallbackQuery`, {
      callback_query_id: cbId,
      text: reply,
      show_alert: false,
    }, { timeout: 8_000 });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "TG answerCallbackQuery failed");
  }

  for (const [prefix, handler] of callbackHandlers.entries()) {
    if (data.startsWith(prefix)) {
      try { await handler(chatId, data); } catch (err) {
        logger.warn({ prefix, err: (err as Error).message }, "TG callback handler error");
      }
      return;
    }
  }
}

/* ── Outgoing helpers ────────────────────────────────────────────────────── */

export async function tgSend(chatId: string, text: string, opts: {
  parseMode?: "HTML" | "MarkdownV2";
  disablePreview?: boolean;
  replyMarkup?: Record<string, unknown>;
} = {}): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN not set" };
  try {
    const r = await axios.post(`${API(token)}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: opts.parseMode ?? "HTML",
      disable_web_page_preview: opts.disablePreview ?? true,
      reply_markup: opts.replyMarkup,
    }, { timeout: 10_000 });
    return { ok: true, messageId: r.data?.result?.message_id };
  } catch (err) {
    const ax = err as { response?: { data?: { description?: string } }; message?: string };
    return { ok: false, error: ax.response?.data?.description ?? ax.message ?? String(err) };
  }
}

export async function sendBuyApprovalPrompt(opts: {
  chatId: string;
  coin: ScannedCoin;
  amountSol: number;
  estimatedOutput?: number;
  walletBalance?: number;
}): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const text =
    `🔒 <b>${opts.coin.name}</b> ($${opts.coin.symbol}) chat is locked to holders.\n\n` +
    `💸 Buy ~<b>${opts.amountSol.toFixed(2)} SOL</b>` +
    (opts.estimatedOutput ? ` (~${Math.round(opts.estimatedOutput).toLocaleString()} $${opts.coin.symbol})` : "") +
    ` to post my messages?\n\n` +
    (opts.walletBalance !== undefined ? `Wallet: <b>${opts.walletBalance.toFixed(4)} SOL</b>\n` : "") +
    `<a href="${opts.coin.pumpUrl}">Open coin →</a>`;
  return tgSend(opts.chatId, text, {
    replyMarkup: {
      inline_keyboard: [[
        { text: "✅ Approve & Post", callback_data: `approve:buy:${opts.coin.mint}` },
        { text: "⏭ Skip",            callback_data: `skip:buy:${opts.coin.mint}` },
      ]],
    },
  });
}

export async function editMessage(chatId: string, messageId: number, text: string): Promise<void> {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) return;
  try {
    await axios.post(`${API(token)}/editMessageText`, {
      chat_id: chatId, message_id: messageId, text,
      parse_mode: "HTML", disable_web_page_preview: true,
    }, { timeout: 8_000 });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "TG editMessage failed");
  }
}

export async function tgTyping(chatId: string): Promise<void> {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) return;
  try {
    await axios.post(`${API(token)}/sendChatAction`, {
      chat_id: chatId, action: "typing",
    }, { timeout: 4_000 });
  } catch { /* non-fatal */ }
}

export function tgTypingLoop(chatId: string, durationMs: number): () => void {
  let stopped = false;
  const tick = async () => {
    while (!stopped) {
      await tgTyping(chatId);
      await new Promise(r => setTimeout(r, 4500));
    }
  };
  void tick();
  return () => { stopped = true; };
}

/* ── Inbound message auto-responder ─────────────────────────────────────── */

let inboundResponder: ((msg: Record<string, unknown>) => Promise<void>) | null = null;

export function setInboundResponder(
  fn: (msg: Record<string, unknown>) => Promise<void>
): void {
  inboundResponder = fn;
  logger.info("Telegram inbound responder registered");
}

// Register the inbound responder as a message handler
onTGMessage(async (msg) => {
  if (!inboundResponder) return;
  try { await inboundResponder(msg); }
  catch (e) { logger.warn({ err: (e as Error).message }, "Inbound responder error"); }
});

export async function tgSendPhoto(chatId: string, photoUrl: string, caption: string): Promise<void> {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) return;
  try {
    await axios.post(`${API(token)}/sendPhoto`, {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: "HTML",
    }, { timeout: 10_000 });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "TG sendPhoto failed");
  }
}
