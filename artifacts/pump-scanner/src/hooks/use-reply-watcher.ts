import { useEffect, useRef, useCallback } from "react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface Reply {
  id?: string;
  username?: string;
  user?: string;
  text?: string;
  message?: string;
  user_pubkey?: string;
  pubkey?: string;
  timestamp?: string | number;
  mint?: string;
}

interface WatcherOptions {
  publicKey: string;
  activeMints: string[];
  enabled: boolean;
  telegramChatId?: string;
  onNewReply?: (reply: Reply & { coinSymbol?: string }) => void;
}

async function sendTelegramNotify(chatId: string, text: string) {
  try {
    await fetch(`${BASE}/api/telegram/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, text }),
    });
  } catch {
    // silently ignore
  }
}

export function useReplyWatcher({
  publicKey,
  activeMints,
  enabled,
  telegramChatId,
  onNewReply,
}: WatcherOptions) {
  const seenIds  = useRef<Set<string>>(new Set());
  const lastPoll = useRef<number>(Date.now());

  const poll = useCallback(async () => {
    if (!enabled || !publicKey || activeMints.length === 0) return;
    const since = lastPoll.current;
    lastPoll.current = Date.now();

    for (const mint of activeMints) {
      try {
        const res  = await fetch(`${BASE}/api/chat/replies/${mint}`);
        const data = await res.json() as { replies: Reply[]; symbol?: string };
        const replies = data.replies ?? [];

        for (const r of replies) {
          const id  = String(r.id ?? `${mint}-${r.user_pubkey ?? r.pubkey}-${r.timestamp}`);
          const ts  = r.timestamp
            ? (typeof r.timestamp === "number" && r.timestamp < 1e12
                ? r.timestamp * 1000
                : Number(r.timestamp))
            : 0;

          const addr = r.user_pubkey ?? r.pubkey ?? "";
          const isNew = !seenIds.current.has(id) && ts > since && addr !== publicKey;

          if (isNew) {
            seenIds.current.add(id);
            onNewReply?.({ ...r, mint });

            const name = r.username ?? r.user ?? (addr ? addr.slice(0, 8) + "…" : "anon");
            const text = r.text ?? r.message ?? "";

            // Browser notification
            if (
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              new Notification("💬 New reply on pump.fun", {
                body: `${name}: ${text.slice(0, 80)}`,
                icon: "/favicon.ico",
                tag: id,
              });
            }

            // Telegram notification
            if (telegramChatId?.trim()) {
              const msgText =
                `💬 <b>New reply on pump.fun</b>\n` +
                `👤 <b>${name}</b>: ${text.slice(0, 200)}\n` +
                `🔗 <a href="https://pump.fun/coin/${mint}">View on Pump.fun</a>`;
              void sendTelegramNotify(telegramChatId.trim(), msgText);
            }
          } else if (!seenIds.current.has(id)) {
            seenIds.current.add(id);
          }
        }
      } catch {}
    }
  }, [publicKey, activeMints, enabled, telegramChatId, onNewReply]);

  // Seed existing replies on first load without triggering notifications
  useEffect(() => {
    if (!enabled || !publicKey) return;
    const seed = async () => {
      for (const mint of activeMints) {
        try {
          const res  = await fetch(`${BASE}/api/chat/replies/${mint}`);
          const data = await res.json() as { replies: Reply[] };
          for (const r of data.replies ?? []) {
            const id = String(r.id ?? `${mint}-${r.user_pubkey ?? r.pubkey}-${r.timestamp}`);
            seenIds.current.add(id);
          }
        } catch {}
      }
      lastPoll.current = Date.now();
    };
    void seed();
  }, [publicKey, activeMints.join(",")]); // eslint-disable-line

  useEffect(() => {
    if (!enabled || !publicKey) return;
    const interval = setInterval(() => void poll(), 10_000);
    return () => clearInterval(interval);
  }, [poll, enabled, publicKey]);
}
