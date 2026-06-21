import React, { useState, useEffect, useRef } from "react";
import { Send, Lock, Unlock, RefreshCw, Ban, MessageSquare, ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/contexts/settings-context";
import nacl from "tweetnacl";
import bs58 from "bs58";

interface Reply {
  id?: string;
  username?: string;
  user?: string;
  user_profile_image?: string;
  profile_image?: string;
  text?: string;
  message?: string;
  timestamp?: string | number;
  user_pubkey?: string;
  pubkey?: string;
}

interface ChatPanelProps {
  mint: string;
  symbol: string;
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const PUMP_API = "https://frontend-api-v3.pump.fun";

function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function buildPumpAuthToken(privateKeyB58: string, msgTpl?: string): { token: string } | null {
  try {
    const secretKey = bs58.decode(privateKeyB58.trim());
    if (secretKey.length !== 64) return null;
    const publicKeyBytes = secretKey.slice(32);
    const publicKey = bs58.encode(publicKeyBytes);
    const ts = Date.now();
    const message = (msgTpl ?? "Sign in to pump.fun: {ts}").replace("{ts}", String(ts));
    const sig = nacl.sign.detached(new TextEncoder().encode(message), secretKey);
    const token = toBase64Url(JSON.stringify({ publicKey, signature: bs58.encode(sig), timestamp: ts }));
    return { token };
  } catch { return null; }
}

async function postDirectToPumpFun(mint: string, text: string, privateKey: string): Promise<boolean> {
  const msgs = ["Sign in to pump.fun: {ts}", "pump.fun: {ts}"];
  for (const msgTpl of msgs) {
    const auth = buildPumpAuthToken(privateKey, msgTpl);
    if (!auth) continue;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${auth.token}`,
    };
    for (const body of [{ mint, text }, { mint, message: text }]) {
      try {
        const res = await fetch(`${PUMP_API}/chat`, { method: "POST", headers, body: JSON.stringify(body) });
        if (res.ok) return true;
        const detail = await res.text().catch(() => "");
        console.warn("[PumpRadar] Direct post status", res.status, detail.slice(0, 200));
        if (res.status === 401 || res.status === 403) break;
      } catch (e) {
        console.warn("[PumpRadar] Direct post CORS/network:", e);
      }
    }
  }
  return false;
}

async function fetchReplies(mint: string): Promise<Reply[]> {
  const res = await fetch(`${BASE}/api/chat/replies/${mint}`);
  const data = (await res.json()) as { replies: Reply[] };
  return data.replies ?? [];
}

async function postReply(mint: string, message: string, privateKey: string) {
  const res = await fetch(`${BASE}/api/chat/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mint, message, privateKey }),
  });
  const json = await res.json() as { success?: boolean; error?: string; detail?: string; postedToPumpFun?: boolean; pumpFunError?: string };
  return { ok: res.ok, ...json };
}

async function setLock(mint: string, privateKey: string, lock: boolean) {
  const res = await fetch(`${BASE}/api/chat/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mint, privateKey, lock }),
  });
  return res.json() as Promise<{ success?: boolean; error?: string }>;
}

async function banUser(mint: string, privateKey: string, banAddress: string) {
  const res = await fetch(`${BASE}/api/chat/ban`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mint, privateKey, banAddress }),
  });
  return res.json() as Promise<{ success?: boolean; error?: string }>;
}

function isHolderError(error: string): boolean {
  const lower = error.toLowerCase();
  return lower.includes("hold") || lower.includes("balance") || lower.includes("own") || lower.includes("403") || lower.includes("forbidden");
}

function formatTime(ts?: string | number): string {
  if (!ts) return "";
  try {
    const d = new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export function ChatPanel({ mint, symbol }: ChatPanelProps) {
  const { privateKey } = useSettings();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [locking, setLocking] = useState(false);
  const [banning, setBanning] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "warn"; text: string; pumpUrl?: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const load = async () => {
    try {
      const data = await fetchReplies(mint);
      setReplies(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [mint]);

  useEffect(() => {
    if (replies.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = replies.length;
  }, [replies.length]);

  const flash = (type: "success" | "error" | "warn", text: string, pumpUrl?: string) => {
    setFeedback({ type, text, pumpUrl });
    setTimeout(() => setFeedback(null), 6000);
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    const text = message.trim();
    setMessage("");
    try {
      const result = await postReply(mint, text, privateKey);
      if (result.success) {
        if (result.postedToPumpFun) {
          flash("success", "Posted to pump.fun ✓");
        } else if (isHolderError(result.error ?? result.detail ?? result.pumpFunError ?? "")) {
          flash("warn", "Must hold this token to post on pump.fun.", `https://pump.fun/coin/${mint}`);
        } else {
          // pump.fun API is CORS-locked to their own domain — copy & link
          try { await navigator.clipboard.writeText(text); } catch {}
          flash("warn", "Saved here — message copied. Paste it on pump.fun:", `https://pump.fun/coin/${mint}`);
        }
        await load();
      } else {
        const errStr = String(result.error ?? result.detail ?? "Failed to send");
        if (isHolderError(errStr)) {
          flash("warn", "Must hold this token to post on pump.fun.", `https://pump.fun/coin/${mint}`);
        } else {
          flash("error", errStr.slice(0, 120));
        }
      }
    } catch {
      flash("error", "Network error — try again");
    } finally {
      setSending(false);
    }
  };

  const handleLock = async () => {
    if (!privateKey.trim()) { flash("warn", "Add your private key in Settings ⚙ first."); return; }
    setLocking(true);
    try {
      const result = await setLock(mint, privateKey, !locked);
      if (result.success) {
        setLocked((v) => !v);
        flash("success", !locked ? "🔒 Chat locked — only you can post" : "🔓 Chat unlocked");
      } else {
        flash("error", String(result.error ?? "Lock failed — are you the coin creator?"));
      }
    } catch {
      flash("error", "Network error");
    } finally {
      setLocking(false);
    }
  };

  const handleBan = async (address: string, username: string) => {
    if (!privateKey.trim()) { flash("warn", "Add your private key in Settings ⚙ first."); return; }
    if (!address) { flash("error", "No wallet address for this user"); return; }
    setBanning(address);
    try {
      const result = await banUser(mint, privateKey, address);
      if (result.success) {
        flash("success", `Banned ${username || address.slice(0, 8)}`);
        setReplies((r) => r.filter((x) => (x.user_pubkey ?? x.pubkey) !== address));
      } else {
        flash("error", String(result.error ?? "Ban failed — are you the coin creator?"));
      }
    } catch {
      flash("error", "Network error");
    } finally {
      setBanning(null);
    }
  };

  const hasKey = !!privateKey;
  const pumpUrl = `https://pump.fun/coin/${mint}`;

  return (
    <div className="flex flex-col border-t border-border/40" style={{ height: "460px", background: "hsla(150,18%,5%,0.98)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 flex-shrink-0"
        style={{ background: "hsla(150,18%,7%,0.95)" }}>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-primary/70" />
          <span className="font-mono text-[11px] font-bold tracking-wider text-foreground/70 uppercase">
            ${symbol} Chat
          </span>
          {replies.length > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
              style={{ background: "hsla(150,15%,14%,0.9)", color: "hsl(150,8%,55%)" }}>
              {replies.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {locked && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold mr-1"
              style={{ background: "hsla(0,70%,45%,0.12)", border: "1px solid hsla(0,70%,50%,0.2)", color: "hsl(0,70%,65%)" }}>
              LOCKED
            </span>
          )}
          {hasKey && (
            <Button size="sm" variant="ghost"
              className={`h-7 px-2 text-[10px] font-mono gap-1 rounded-lg ${
                locked ? "text-emerald-400 hover:text-emerald-300" : "text-muted-foreground/60 hover:text-red-400"
              }`}
              disabled={locking}
              onClick={handleLock}
              title={locked ? "Unlock chat" : "Lock chat — only you can post"}>
              {locking ? <RefreshCw className="w-3 h-3 animate-spin" /> :
               locked ? <><ShieldCheck className="w-3 h-3" /><span className="hidden sm:inline">Unlock</span></> :
                        <><ShieldAlert className="w-3 h-3" /><span className="hidden sm:inline">Lock</span></>}
            </Button>
          )}
          <Button size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-foreground rounded-lg"
            onClick={() => void load()}
            title="Refresh">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <a href={pumpUrl} target="_blank" rel="noreferrer"
            className="h-7 w-7 flex items-center justify-center text-muted-foreground/40 hover:text-primary transition-colors rounded-lg"
            title="Open on Pump.fun">
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`px-4 py-2.5 text-[11px] font-mono flex-shrink-0 flex items-start gap-2 border-b ${
          feedback.type === "success" ? "border-emerald-500/10 text-emerald-400" :
          feedback.type === "warn"    ? "border-yellow-500/10 text-yellow-400" :
                                        "border-red-500/10 text-red-400"
        }`}
          style={{
            background: feedback.type === "success" ? "hsla(150,60%,35%,0.06)" :
                        feedback.type === "warn"    ? "hsla(45,80%,40%,0.07)" :
                                                      "hsla(0,70%,45%,0.07)"
          }}>
          <span className="flex-shrink-0 mt-0.5">
            {feedback.type === "success" ? "✓" : feedback.type === "warn" ? "⚠" : "✗"}
          </span>
          <span className="flex-1 leading-relaxed">{feedback.text}
            {feedback.pumpUrl && (
              <> <a href={feedback.pumpUrl} target="_blank" rel="noreferrer"
                className="underline opacity-80 hover:opacity-100 ml-1">
                Buy on Pump.fun →
              </a></>
            )}
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 overscroll-contain">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground/40">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span className="font-mono text-xs">Loading chat…</span>
          </div>
        ) : replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageSquare className="w-8 h-8 opacity-12" />
            <p className="font-mono text-[11px] text-muted-foreground/40 text-center">
              No comments yet.<br />Be the first to post.
            </p>
          </div>
        ) : (
          replies.map((r, i) => {
            const name = r.username ?? r.user ?? "anon";
            const text = r.text ?? r.message ?? "";
            const time = formatTime(r.timestamp);
            const addr = r.user_pubkey ?? r.pubkey ?? "";
            const avatar = r.user_profile_image ?? r.profile_image ?? "";
            const isAnon = !r.username && !r.user;
            return (
              <div key={r.id ?? i} className="flex gap-2.5 group animate-msg-enter">
                {/* Avatar */}
                {avatar ? (
                  <img src={avatar} alt={name}
                    className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 object-cover ring-1 ring-white/5" />
                ) : (
                  <div className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-bold"
                    style={{ background: "hsla(150,20%,13%,0.9)", border: "1px solid hsla(150,15%,20%,0.8)", color: "hsl(150,8%,55%)" }}>
                    {isAnon ? "?" : name[0]?.toUpperCase()}
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold" style={{ color: "hsl(45,65%,58%)" }}>
                      {name.length > 16 ? name.slice(0, 6) + "…" + name.slice(-4) : name}
                    </span>
                    {time && (
                      <span className="text-[9px] text-muted-foreground/35 font-mono">{time}</span>
                    )}
                    {hasKey && addr && (
                      <button
                        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        style={{ color: "hsl(0,60%,55%)" }}
                        onClick={() => void handleBan(addr, name)}
                        disabled={banning === addr}
                        title={`Ban ${name}`}>
                        {banning === addr
                          ? <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          : <Ban className="w-2.5 h-2.5" />}
                      </button>
                    )}
                  </div>
                  <p className="text-[12.5px] text-foreground/85 break-words leading-relaxed mt-0.5">
                    {text}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border/30 flex-shrink-0"
        style={{ background: "hsla(150,18%,6%,0.98)" }}>
        {!hasKey ? (
          <div className="flex items-center justify-between py-2 px-3 rounded-xl"
            style={{ background: "hsla(150,15%,10%,0.6)", border: "1px solid hsla(150,15%,17%,0.7)" }}>
            <span className="font-mono text-[11px] text-muted-foreground/55">
              Add private key in <span className="text-primary font-bold">Settings ⚙</span> to post
            </span>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              className="flex-1 rounded-xl px-3.5 py-2.5 text-foreground/90 placeholder-muted-foreground/30 focus:outline-none font-mono transition-all"
              style={{
                fontSize: "16px",
                background: "hsla(150,15%,11%,0.9)",
                border: `1px solid ${locked ? "hsla(0,70%,45%,0.2)" : "hsla(150,15%,19%,0.8)"}`,
              }}
              onFocus={(e) => { if (!locked) e.target.style.borderColor = "hsla(45,95%,55%,0.45)"; }}
              onBlur={(e) => { e.target.style.borderColor = locked ? "hsla(0,70%,45%,0.2)" : "hsla(150,15%,19%,0.8)"; }}
              placeholder={locked ? "🔒 Locked — you control this chat" : `Message $${symbol}…`}
              value={message}
              disabled={locked}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
              }}
            />
            <Button
              size="sm"
              className="h-10 w-10 p-0 rounded-xl flex-shrink-0 transition-opacity"
              style={{
                background: sending || locked || !message.trim()
                  ? "hsla(45,60%,40%,0.4)"
                  : "linear-gradient(135deg, hsl(45,95%,55%), hsl(36,78%,46%))",
                color: "hsl(150,18%,5%)",
              }}
              disabled={sending || locked || !message.trim()}
              onClick={() => void handleSend()}>
              {sending
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
