/**
 * ChatPage — full-screen mobile-first coin chat + live trades.
 * Route: /chat/:mint   (iOS-style push navigation, slideInFromRight)
 *
 * Features:
 *  - Real push notifications when dev (creator) replies — via Web Push
 *  - Scroll-to-latest floating button (appears when scrolled up)
 *  - Holder-only lock detection + bypass hint
 *  - App-level lock: only user + creator can post
 *  - Real pump.fun lock (disable_replies) for coin creators
 *  - iOS keyboard fix: height=vvHeight, no scroll-jump on keyboard open
 *  - input font-size: 16px — prevents iOS auto-zoom
 */
import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";

import {
  ArrowLeft, Send, RefreshCw,
  MessageSquare, ExternalLink,
  AlertTriangle, Zap, TrendingUp, TrendingDown,
  Wifi, WifiOff, Radio, Lock, Unlock, Bell, BellOff,
  ChevronDown,
} from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  isPushSupported, subscribeToPush, unsubscribeFromPush, getCurrentSubscription,
} from "@/lib/push";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface TradeEvent {
  id: string;
  txType: "buy" | "sell";
  traderPublicKey: string;
  tokenAmount: number;
  solAmount: number;
  marketCapSol?: number;
  timestamp: number;
  username?: string;
}

export interface NormMsg {
  id: string;
  pubkey: string;
  username: string;
  text: string;
  timestamp: number;
  avatar: string | null;
  live?: boolean;
  isCreator?: boolean;
}

interface PumpReply {
  id?: string | number;
  username?: string | null;
  user?: string;
  user_pubkey?: string;
  profile_image?: string | null;
  text?: string;
  message?: string;
  content?: string;
  timestamp?: number | string;
  created_at?: number | string;
}

export interface ChatPageProps {
  mint: string;
  symbol: string;
  name: string;
  creator: string;
  onClose: () => void;
}

type Tab = "chat" | "live";
type Source = "pump.fun" | "inapp" | "unknown";
type WsStatus = "connecting" | "connected" | "chat_live" | "disconnected";

/* ── Constants ──────────────────────────────────────────────────────────── */

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const FALLBACK_POLL_MS = 60_000;

/* ── Helpers ────────────────────────────────────────────────────────────── */

function buildWsUrl(): string {
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${loc.host}/ws`;
}

function formatTime(ts: number): string {
  try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function shortKey(k: string): string {
  return k.length > 12 ? k.slice(0, 4) + "…" + k.slice(-4) : k;
}

function formatSol(n: number): string {
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function getPubkeyFromKey(privateKey: string): string {
  try {
    const sk = bs58.decode(privateKey.trim());
    const kp = nacl.sign.keyPair.fromSecretKey(sk);
    return bs58.encode(kp.publicKey);
  } catch { return ""; }
}

function normalisePoll(r: PumpReply, idx: number, creatorPubkey: string): NormMsg {
  const pubkey = r.user_pubkey ?? r.user ?? "";
  const tsRaw  = r.timestamp ?? r.created_at ?? Date.now();
  let ts: number;
  if (typeof tsRaw === "number") ts = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
  else                           ts = Date.parse(String(tsRaw)) || Date.now();
  const text = (r.text ?? r.message ?? r.content ?? "").toString();
  const username = (r.username && r.username.trim()) || (pubkey ? shortKey(pubkey) : `Anon${idx}`);
  return {
    id: String(r.id ?? `poll-${ts}-${idx}`),
    pubkey, username, text, timestamp: ts, avatar: r.profile_image ?? null,
    isCreator: !!(creatorPubkey && pubkey === creatorPubkey),
  };
}

function normaliseWs(raw: Record<string, unknown>, creatorPubkey: string): NormMsg {
  const ts = typeof raw.timestamp === "number" ? raw.timestamp : Date.now();
  const pubkey = String(raw.user_pubkey ?? "");
  const username = String(raw.username ?? (pubkey ? shortKey(pubkey) : "Anon"));
  return {
    id: String(raw.id ?? `ws-${ts}-${Math.random().toString(36).slice(2, 6)}`),
    pubkey, username, text: String(raw.text ?? ""),
    timestamp: ts, avatar: (raw.profile_image as string | null) ?? null, live: true,
    isCreator: !!(creatorPubkey && pubkey === creatorPubkey),
  };
}

function mergeMessages(existing: NormMsg[], incoming: NormMsg[]): NormMsg[] {
  const seen = new Set(existing.map(m => m.id));
  const merged = [...existing];
  for (const m of incoming) {
    if (!seen.has(m.id) && m.text.trim()) { merged.push(m); seen.add(m.id); }
  }
  merged.sort((a, b) => a.timestamp - b.timestamp);
  return merged.slice(-300);
}

/* ── Live Trades panel ─────────────────────────────────────────────────── */
function LiveTradesPanel({ trades, wsStatus }: { trades: TradeEvent[]; wsStatus: WsStatus }) {
  if (wsStatus === "connecting" && trades.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
          <Zap style={{ width: 22, height: 22, color: "#60a5fa", animation: "pulse 2s ease-in-out infinite" }} />
        </div>
        <p style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b", textAlign: "center", margin: 0 }}>Connecting to live feed…</p>
      </div>
    );
  }
  if (trades.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <Zap style={{ width: 22, height: 22, color: "#22c55e" }} />
        </div>
        <p style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b", textAlign: "center", margin: 0 }}>
          Waiting for trades…<br /><span style={{ color: "#334155" }}>They appear as they happen</span>
        </p>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"], overscrollBehavior: "contain", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      {trades.map((t) => {
        const isBuy = t.txType === "buy";
        const col    = isBuy ? "#22c55e" : "#ef4444";
        const bg     = isBuy ? "rgba(34,197,94,0.07)"  : "rgba(239,68,68,0.07)";
        const border = isBuy ? "rgba(34,197,94,0.2)"   : "rgba(239,68,68,0.2)";
        const label  = t.username ?? shortKey(t.traderPublicKey);
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: bg, border: `1px solid ${border}` }}>
            <div style={{ width: 30, height: 30, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: isBuy ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)" }}>
              {isBuy ? <TrendingUp style={{ width: 15, height: 15, color: col }} /> : <TrendingDown style={{ width: 15, height: 15, color: col }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: col }}>{isBuy ? "BUY" : "SELL"}</span>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#475569", marginTop: 1 }}>
                {formatSol(t.solAmount)} SOL{t.tokenAmount > 0 && <> · {(t.tokenAmount / 1_000_000).toFixed(2)}M tokens</>}
              </div>
            </div>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#334155", flexShrink: 0 }}>
              {new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Message bubble ─────────────────────────────────────────────────────── */
function MessageBubble({ msg, isMe }: { msg: NormMsg; isMe: boolean }) {
  const isDev = msg.isCreator && !isMe;
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 14, animation: msg.live ? "fadeSlideIn 0.25s ease-out" : "none" }}>
      {msg.avatar ? (
        <img src={msg.avatar} alt={msg.username}
          style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0, marginTop: 1, border: `1.5px solid ${isDev ? "rgba(168,85,247,0.5)" : "rgba(255,255,255,0.08)"}` }} />
      ) : (
        <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: isMe ? "rgba(34,197,94,0.12)" : isDev ? "rgba(168,85,247,0.15)" : "rgba(59,130,246,0.12)", border: `1.5px solid ${isMe ? "rgba(34,197,94,0.25)" : isDev ? "rgba(168,85,247,0.4)" : "rgba(59,130,246,0.25)"}`, color: isMe ? "#22c55e" : isDev ? "#c084fc" : "#60a5fa" }}>
          {(msg.username[0] ?? "?").toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: isMe ? "#22c55e" : isDev ? "#c084fc" : "#fbbf24" }}>
            {msg.username.length > 16 ? msg.username.slice(0, 5) + "…" + msg.username.slice(-4) : msg.username}
          </span>
          {isDev && (
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#c084fc", fontWeight: 700, background: "rgba(168,85,247,0.12)", padding: "0 5px", borderRadius: 4, border: "1px solid rgba(168,85,247,0.3)" }}>👑 DEV</span>
          )}
          {isMe && (
            <span style={{ fontSize: 9, fontFamily: "monospace", color: "#22c55e", fontWeight: 700, background: "rgba(34,197,94,0.1)", padding: "0 4px", borderRadius: 4 }}>you</span>
          )}
          {msg.live && !isDev && (
            <span style={{ fontSize: 8, fontFamily: "monospace", color: "#60a5fa", background: "rgba(59,130,246,0.1)", padding: "0 4px", borderRadius: 4 }}>live</span>
          )}
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#334155" }}>{formatTime(msg.timestamp)}</span>
        </div>
        {/* Dev message gets a purple glow background */}
        <p style={{ fontSize: 15, color: isDev ? "rgba(232,200,255,0.95)" : "rgba(241,245,249,0.92)", lineHeight: 1.6, margin: "3px 0 0 0", wordBreak: "break-word", background: isDev ? "rgba(168,85,247,0.05)" : "transparent", borderRadius: isDev ? 10 : 0, padding: isDev ? "4px 8px" : 0 }}>
          {msg.text}
        </p>
      </div>
    </div>
  );
}

/* ── Main ChatPage ──────────────────────────────────────────────────────── */
export function ChatPage({ mint, symbol, name, creator, onClose }: ChatPageProps) {
  const { privateKey, privyToken } = useSettings();
  const hasKey = !!privateKey?.trim();

  const [tab, setTab]             = useState<Tab>("chat");
  const myPubkey = useMemo(() => hasKey ? getPubkeyFromKey(privateKey) : "", [privateKey, hasKey]);

  const [replies, setReplies]           = useState<NormMsg[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [source, setSource]             = useState<Source>("unknown");
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [chatLive, setChatLive]         = useState(false);

  // Lock states
  const [appLocked, setAppLocked]           = useState(false);
  const [allowedPubkeys, setAllowedPubkeys] = useState<string[]>([]);
  const [holderLocked, setHolderLocked]     = useState(false);  // pump.fun holder-only lock
  const [pumpLocked, setPumpLocked]         = useState(false);  // pump.fun disable_replies

  const [message, setMessage]     = useState("");
  const [sending, setSending]     = useState(false);
  const [toast, setToast]         = useState<{ type: "ok" | "err" | "warn"; text: string } | null>(null);

  const [trades, setTrades]       = useState<TradeEvent[]>([]);
  const [wsStatus, setWsStatus]   = useState<WsStatus>("connecting");

  const [chatLocked, setChatLocked] = useState(false);
  const [locking, setLocking]       = useState(false);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const pushSupported = isPushSupported();

  const scrollAreaRef  = useRef<HTMLDivElement>(null);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const chatLiveRef    = useRef(false);
  const prevRepliesLen = useRef(0);
  const userScrolledUp = useRef(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const pumpUrl     = `https://pump.fun/coin/${mint}`;
  const isCreator   = !!creator && !!myPubkey && creator === myPubkey;

  // Check existing push subscription on mount
  useEffect(() => {
    if (!pushSupported) return;
    void getCurrentSubscription().then(sub => setPushEnabled(!!sub));
  }, [pushSupported]);

  // ── iOS keyboard fix: visualViewport height
  const [vvHeight, setVvHeight] = useState<number>(
    () => window.visualViewport?.height ?? window.innerHeight
  );
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => setVvHeight(vv.height);
    sync();
    vv.addEventListener("resize", sync, { passive: true });
    return () => vv.removeEventListener("resize", sync);
  }, []);

  // Lock body scroll (prevents iOS bounce behind chat)
  useEffect(() => {
    const scrollY = window.scrollY;
    const prev = {
      ov: document.body.style.overflow,
      pos: document.body.style.position,
      top: document.body.style.top,
      w: document.body.style.width,
    };
    Object.assign(document.body.style, { overflow: "hidden", position: "fixed", top: `-${scrollY}px`, width: "100%" });
    return () => {
      Object.assign(document.body.style, { overflow: prev.ov, position: prev.pos, top: prev.top, width: prev.w });
      window.scrollTo(0, scrollY);
    };
  }, []);

  const flash = useCallback((type: "ok" | "err" | "warn", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 6000);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    userScrolledUp.current = false;
    setShowScrollBtn(false);
    setNewMsgCount(0);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior, block: "end" }), 50);
  }, []);

  // Only scroll to bottom when NEW messages arrive AND user hasn't scrolled up
  useEffect(() => {
    const current = replies.length;
    const prev    = prevRepliesLen.current;
    if (current > prev) {
      const added = current - prev;
      if (userScrolledUp.current) {
        // Don't jump — show "↓ N new" button instead
        setNewMsgCount(n => n + added);
        setShowScrollBtn(true);
      } else {
        scrollToBottom();
      }
    }
    prevRepliesLen.current = current;
  }, [replies.length, scrollToBottom]);

  // Detect user scroll
  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const scrolledUp = dist > 80;
    userScrolledUp.current = scrolledUp;
    if (!scrolledUp) {
      setShowScrollBtn(false);
      setNewMsgCount(0);
    }
  }, []);

  /* ── Initial HTTP fetch ─────────────────────────────────────────────── */
  const fetchReplies = useCallback(async (silent = false) => {
    if (!silent) setLoadError(null);
    try {
      const r = await fetch(`${BASE}/api/chat/replies/${mint}`, {
        headers: hasKey ? { "x-pump-key": privateKey.trim() } : {},
        signal: AbortSignal.timeout(14_000),
      });
      const j = await r.json() as {
        replies?: PumpReply[];
        source?: "pump.fun" | "inapp";
        requiresAuth?: boolean;
        isAppLocked?: boolean;
        allowedPubkeys?: string[];
      };
      const list = (j.replies ?? []).map((rep, idx) => normalisePoll(rep, idx, creator));
      setReplies(prev => mergeMessages(prev, list));
      setSource(j.source ?? "unknown");
      setRequiresAuth(!!j.requiresAuth);
      setAppLocked(!!j.isAppLocked);
      setAllowedPubkeys(j.allowedPubkeys ?? []);
    } catch (err) {
      if (!silent) {
        const msg = (err as Error).name === "TimeoutError" ? "Took too long — tap Retry." : "Couldn't load comments.";
        setLoadError(msg);
      }
    } finally {
      setLoadingReplies(false);
    }
  }, [mint, hasKey, privateKey, creator]);

  useEffect(() => {
    setLoadingReplies(true);
    void fetchReplies();
    const iv = setInterval(() => {
      if (!chatLiveRef.current) void fetchReplies(true);
    }, FALLBACK_POLL_MS);
    return () => clearInterval(iv);
  }, [fetchReplies]);

  /* ── Unified WebSocket ──────────────────────────────────────────────── */
  useEffect(() => {
    let closed = false;
    function connect() {
      if (closed) return;
      setWsStatus("connecting");
      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        setWsStatus("connected");
        ws.send(JSON.stringify({ type: "subscribe_coin", mint }));
        ws.send(JSON.stringify({
          type: "subscribe_chat", mint,
          coinName: name, coinSymbol: symbol,
          pubkey: myPubkey || undefined,
          creatorPubkey: creator || undefined,
          ...(hasKey ? { privateKey: privateKey.trim() } : {}),
        }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as {
            type?: string;
            data?: Record<string, unknown>;
            message?: Record<string, unknown>;
            mint?: string;
          };
          if (msg.type === "trade" && msg.data) {
            const d = msg.data;
            setTrades(prev => [{
              id: String(d.signature ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
              txType: (d.txType as "buy" | "sell") ?? "buy",
              traderPublicKey: String(d.traderPublicKey ?? ""),
              tokenAmount: Number(d.tokenAmount ?? 0),
              solAmount: Number(d.solAmount ?? 0),
              marketCapSol: d.marketCapSol != null ? Number(d.marketCapSol) : undefined,
              timestamp: Date.now(),
              username: d.username as string | undefined,
            }, ...prev].slice(0, 100));
          } else if (msg.type === "chat_message" && msg.message) {
            const norm = normaliseWs(msg.message, creator);
            if (norm.text.trim()) {
              setChatLive(true); chatLiveRef.current = true;
              setWsStatus("chat_live"); setSource("pump.fun");
              setReplies(prev => mergeMessages(prev, [norm]));
            }
          } else if (msg.type === "chat_error") {
            chatLiveRef.current = false;
          }
        } catch {}
      };
      ws.onclose = () => {
        wsRef.current = null; chatLiveRef.current = false;
        setChatLive(false); setWsStatus("disconnected");
        if (!closed) setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      closed = true;
      try {
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({ type: "unsubscribe_coin", mint }));
          wsRef.current.send(JSON.stringify({ type: "unsubscribe_chat", mint }));
          wsRef.current.close();
        }
      } catch {}
    };
  }, [mint, hasKey, privateKey, myPubkey, name, symbol, creator]);

  /* ── Send message ───────────────────────────────────────────────────── */
  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text) return;
    if (!hasKey) { flash("warn", "Add your private key in Settings first."); return; }

    setSending(true); setMessage("");
    userScrolledUp.current = false;

    const optimisticId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimistic: NormMsg = {
      id: optimisticId, pubkey: myPubkey,
      username: myPubkey ? shortKey(myPubkey) : "you",
      text, timestamp: Date.now(), avatar: null, live: false,
      isCreator: myPubkey === creator,
    };
    setReplies(prev => mergeMessages(prev, [optimistic]));

    try {
      const r = await fetch(`${BASE}/api/chat/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, message: text, privateKey: privateKey.trim(), privyToken: privyToken?.trim() || undefined }),
      });
      const j = await r.json() as {
        success?: boolean; error?: string;
        postedToPumpFun?: boolean;
        pumpFunError?: string; pumpFunErrorDetail?: string;
      };
      if (!j.success) {
        setReplies(prev => prev.filter(m => m.id !== optimisticId));
        setMessage(text);
        flash("err", j.error ?? "Failed to post");
      } else if (j.postedToPumpFun === false) {
        if (j.pumpFunError === "HOLDER") {
          setHolderLocked(true);
          setReplies(prev => prev.filter(m => m.id !== optimisticId));
          setMessage(text);
          flash("warn", "🔒 Holder-only chat — you need to hold some $" + symbol + " to post.");
        } else if (j.pumpFunError === "LOCKED") {
          setPumpLocked(true);
          flash("warn", "🔒 Creator disabled replies on pump.fun.");
        } else {
          const map: Record<string, string> = {
            FORBIDDEN: "⚠ pump.fun declined — comment saved locally.",
            UNAUTH:    "⚠ Wallet not linked. Open Settings → Auto-Link Wallet.",
            OTHER:     j.pumpFunErrorDetail || "⚠ pump.fun declined — comment saved locally.",
          };
          flash("warn", map[j.pumpFunError ?? "OTHER"]);
        }
      } else {
        flash("ok", "✓ Posted to pump.fun!");
        setHolderLocked(false);
        setTimeout(() => setReplies(prev => prev.filter(m => m.id !== optimisticId)), 5000);
      }
      if (!chatLiveRef.current) void fetchReplies(true);
    } catch {
      setReplies(prev => prev.filter(m => m.id !== optimisticId));
      setMessage(text);
      flash("err", "Network error — try again.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [message, hasKey, privateKey, mint, myPubkey, creator, symbol, flash, fetchReplies]);

  /* ── Push notification toggle ─────────────────────────────────────── */
  const handleTogglePush = useCallback(async () => {
    if (!pushSupported) { flash("warn", "Push notifications not supported in this browser."); return; }
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush(mint);
        setPushEnabled(false);
        flash("ok", "🔕 Notifications off for this coin.");
      } else {
        // Pass creator pubkey so backend can detect dev messages
        const result = await subscribeToPush(mint, myPubkey, creator);
        if (result.ok) {
          setPushEnabled(true);
          flash("ok", "🔔 You'll get notified when the dev or anyone posts here!");
        } else {
          flash("warn", result.error ?? "Could not enable push notifications.");
        }
      }
    } finally {
      setPushLoading(false);
    }
  }, [pushSupported, pushEnabled, mint, myPubkey, creator, flash]);

  /* ── Lock / Unlock chat (app-level + pump.fun) ───────────────────── */
  const handleLock = useCallback(async () => {
    if (!hasKey) { flash("warn", "Add your private key in Settings to lock chat."); return; }
    setLocking(true);
    try {
      const newLocked = !chatLocked;
      const r = await fetch(`${BASE}/api/chat/applock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, privateKey: privateKey.trim(), lock: newLocked, coinCreatorPubkey: creator }),
      });
      const j = await r.json() as { success?: boolean; locked?: boolean; allowedPubkeys?: string[]; error?: string };
      if (j.success) {
        setChatLocked(newLocked);
        setAppLocked(newLocked);
        setAllowedPubkeys(j.allowedPubkeys ?? []);
        if (newLocked) {
          flash("ok", isCreator
            ? "🔒 Chat locked on pump.fun + PumpRadar — only you can post now."
            : "🔒 Chat locked in PumpRadar — only you and the dev can post.");
        } else {
          flash("ok", "🔓 Chat unlocked — everyone can post again.");
        }
      } else {
        flash("err", j.error ?? "Lock failed");
      }
    } catch {
      flash("err", "Network error");
    } finally {
      setLocking(false);
    }
  }, [hasKey, chatLocked, mint, privateKey, creator, isCreator, flash]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
  };

  /* ── Status pill ────────────────────────────────────────────────────── */
  const statusPill = useMemo(() => {
    if (wsStatus === "chat_live" || chatLive)
      return { color: "#22c55e", label: "live", icon: <Radio style={{ width: 9, height: 9 }} /> };
    if (source === "pump.fun")
      return { color: "#60a5fa", label: "pump.fun", icon: <Wifi style={{ width: 9, height: 9 }} /> };
    if (source === "inapp")
      return { color: "#fbbf24", label: "local", icon: <Wifi style={{ width: 9, height: 9 }} /> };
    return { color: "#475569", label: "loading…", icon: <WifiOff style={{ width: 9, height: 9 }} /> };
  }, [wsStatus, chatLive, source]);

  const canPost = hasKey && (!appLocked || allowedPubkeys.includes(myPubkey)) && !pumpLocked && !holderLocked;

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div
      style={{
        position: "fixed", left: 0, right: 0, top: 0,
        height: `${vvHeight}px`,
        zIndex: 9999, background: "#080c14",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "slideInFromRight 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 12px", paddingTop: "max(12px, env(safe-area-inset-top, 12px))", background: "#080c14", borderBottom: "1px solid #1a2840", flexShrink: 0 }}>
        <button onClick={onClose} aria-label="Back"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 14, color: "#60a5fa", background: "rgba(59,130,246,0.1)", border: "none", cursor: "pointer", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
          <ArrowLeft style={{ width: 22, height: 22 }} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#60a5fa", flexShrink: 0, background: "rgba(59,130,246,0.1)", padding: "2px 7px", borderRadius: 6 }}>${symbol}</span>
            {isCreator && <span style={{ fontFamily: "monospace", fontSize: 9, color: "#c084fc", background: "rgba(168,85,247,0.12)", padding: "1px 5px", borderRadius: 4, border: "1px solid rgba(168,85,247,0.3)", flexShrink: 0 }}>👑 you're the dev</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3, color: statusPill.color }}>
              {statusPill.icon}
              <span style={{ fontFamily: "monospace", fontSize: 10 }}>{statusPill.label}</span>
            </span>
            {(chatLocked || appLocked) && <span style={{ fontFamily: "monospace", fontSize: 9, color: "#f87171", background: "rgba(239,68,68,0.1)", padding: "0 5px", borderRadius: 4 }}>🔒 locked</span>}
            {holderLocked && <span style={{ fontFamily: "monospace", fontSize: 9, color: "#fbbf24", background: "rgba(251,191,36,0.1)", padding: "0 5px", borderRadius: 4 }}>💎 holders only</span>}
          </div>
        </div>

        {/* Bell — push notifications */}
        {pushSupported && (
          <button onClick={() => void handleTogglePush()} disabled={pushLoading} aria-label={pushEnabled ? "Disable notifications" : "Enable notifications"}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 11, color: pushEnabled ? "#22c55e" : "#64748b", background: pushEnabled ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${pushEnabled ? "rgba(34,197,94,0.3)" : "#1a2840"}`, cursor: pushLoading ? "not-allowed" : "pointer", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
            {pushEnabled ? <Bell style={{ width: 15, height: 15 }} /> : <BellOff style={{ width: 15, height: 15 }} />}
          </button>
        )}

        {/* Lock button */}
        {hasKey && (
          <button onClick={() => void handleLock()} disabled={locking} aria-label={chatLocked ? "Unlock chat" : "Lock chat"}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 11, color: chatLocked ? "#f87171" : "#64748b", background: chatLocked ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${chatLocked ? "rgba(239,68,68,0.3)" : "#1a2840"}`, cursor: locking ? "not-allowed" : "pointer", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
            {chatLocked ? <Lock style={{ width: 15, height: 15 }} /> : <Unlock style={{ width: 15, height: 15 }} />}
          </button>
        )}

        <button onClick={() => void fetchReplies()} aria-label="Refresh"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 11, color: "#60a5fa", background: "rgba(59,130,246,0.06)", border: "none", cursor: "pointer", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
          <RefreshCw style={{ width: 15, height: 15, animation: loadingReplies ? "spin 1s linear infinite" : "none" }} />
        </button>

        <a href={pumpUrl} target="_blank" rel="noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "9px 10px", borderRadius: 11, fontFamily: "monospace", fontSize: 10, fontWeight: 700, background: "#1d4ed8", color: "#fff", textDecoration: "none", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
          <ExternalLink style={{ width: 11, height: 11 }} />
          pump.fun
        </a>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", background: "#080c14", borderBottom: "1px solid #1a2840", flexShrink: 0 }}>
        {([
          { id: "chat" as Tab, icon: <MessageSquare style={{ width: 14, height: 14 }} />, label: "Comments", badge: replies.length > 0 ? String(replies.length) : null, activeColor: "#60a5fa" },
          { id: "live" as Tab, icon: <Zap style={{ width: 14, height: 14 }} />, label: "Live Trades", badge: trades.length > 0 ? String(trades.length) : null, activeColor: "#22c55e" },
        ] as const).map(({ id, icon, label, badge, activeColor }) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "13px 20px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, background: "transparent", border: "none", cursor: "pointer", color: tab === id ? activeColor : "#475569", borderBottom: `2px solid ${tab === id ? activeColor : "transparent"}`, WebkitTapHighlightColor: "transparent" }}>
            {icon}{label}
            {badge && <span style={{ padding: "1px 6px", borderRadius: 5, fontSize: 10, background: tab === id ? `${activeColor}22` : "rgba(255,255,255,0.06)", color: tab === id ? activeColor : "#475569" }}>{badge}</span>}
            {id === "live" && wsStatus === "connected" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />}
          </button>
        ))}
      </div>

      {/* ── Notices ── */}

      {/* Pump.fun locked (disable_replies) */}
      {pumpLocked && tab === "chat" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderBottom: "1px solid rgba(239,68,68,0.2)", flexShrink: 0 }}>
          <Lock style={{ width: 13, height: 13, color: "#f87171", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#f87171", lineHeight: 1.5 }}>
            <strong>Creator disabled replies on pump.fun</strong> — nobody can post on pump.fun for this coin.
            {isCreator && <> <button onClick={() => void handleLock()} style={{ background: "none", border: "none", color: "#60a5fa", cursor: "pointer", fontFamily: "monospace", fontSize: 11, textDecoration: "underline" }}>Unlock it</button></>}
          </span>
        </div>
      )}

      {/* Holder-only lock */}
      {holderLocked && tab === "chat" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", background: "rgba(251,191,36,0.07)", borderBottom: "1px solid rgba(251,191,36,0.18)", flexShrink: 0 }}>
          <AlertTriangle style={{ width: 13, height: 13, color: "#fbbf24", flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#fbbf24", lineHeight: 1.5 }}>
              <strong>💎 Holders-only chat</strong> — you need to hold any amount of ${symbol} to post.<br />
              <span style={{ color: "rgba(251,191,36,0.7)" }}>Buy even a tiny amount on pump.fun to unlock posting.</span>
            </span>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <a href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, fontFamily: "monospace", fontSize: 11, fontWeight: 700, background: "#d97706", color: "#fff", textDecoration: "none", WebkitTapHighlightColor: "transparent" }}>
                Buy ${symbol} on pump.fun →
              </a>
              <button onClick={() => { setHolderLocked(false); void fetchReplies(true); }}
                style={{ padding: "6px 10px", borderRadius: 8, fontFamily: "monospace", fontSize: 11, background: "transparent", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24", cursor: "pointer" }}>
                I bought some — retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* App-level lock info */}
      {appLocked && tab === "chat" && !holderLocked && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 14px", background: "rgba(239,68,68,0.06)", borderBottom: "1px solid rgba(239,68,68,0.15)", flexShrink: 0 }}>
          <Lock style={{ width: 12, height: 12, color: "#f87171", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#f87171", lineHeight: 1.5 }}>
            {allowedPubkeys.includes(myPubkey)
              ? "🔒 Chat locked — only you and the dev can post."
              : "🔒 Chat locked by owner — only selected wallets can post."}
          </span>
        </div>
      )}

      {requiresAuth && !holderLocked && !appLocked && tab === "chat" && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 14px", background: "rgba(251,191,36,0.07)", borderBottom: "1px solid rgba(251,191,36,0.15)", flexShrink: 0 }}>
          <AlertTriangle style={{ width: 13, height: 13, color: "#fbbf24", flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#fbbf24", lineHeight: 1.5 }}>
            Add your private key in <strong>Settings ⚙</strong> to load real pump.fun comments.
          </span>
        </div>
      )}
      {loadError && tab === "chat" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "rgba(239,68,68,0.06)", borderBottom: "1px solid rgba(239,68,68,0.15)", flexShrink: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#f87171", flex: 1 }}>{loadError}</span>
          <button onClick={() => void fetchReplies()} style={{ fontFamily: "monospace", fontSize: 11, color: "#60a5fa", background: "rgba(59,130,246,0.1)", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 8 }}>Retry</button>
        </div>
      )}
      {toast && (
        <div style={{ padding: "9px 14px", flexShrink: 0, fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, color: toast.type === "ok" ? "#4ade80" : toast.type === "warn" ? "#fbbf24" : "#f87171", background: toast.type === "ok" ? "rgba(34,197,94,0.08)" : toast.type === "warn" ? "rgba(251,191,36,0.08)" : "rgba(239,68,68,0.08)", borderBottom: "1px solid", borderBottomColor: toast.type === "ok" ? "rgba(34,197,94,0.2)" : toast.type === "warn" ? "rgba(251,191,36,0.2)" : "rgba(239,68,68,0.2)" }}>
          {toast.text}
        </div>
      )}

      {/* ── Live tab ── */}
      {tab === "live" && (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <LiveTradesPanel trades={trades} wsStatus={wsStatus} />
        </div>
      )}

      {/* ── Chat tab ── */}
      {tab === "chat" && (
        <>
          {/* Messages — scroll area */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <div
              ref={scrollAreaRef}
              onScroll={handleScroll}
              style={{ height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"], overscrollBehavior: "contain", padding: "14px 14px 6px" }}
            >
              {loadingReplies ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, gap: 8, color: "#475569" }}>
                  <RefreshCw style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>Loading comments…</span>
                </div>
              ) : replies.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.03)", border: "1px solid #1a2840" }}>
                    <MessageSquare style={{ width: 24, height: 24, color: "#1e293b" }} />
                  </div>
                  <p style={{ fontFamily: "monospace", fontSize: 13, color: "#334155", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                    No comments yet.<br />Be the first to post!
                  </p>
                </div>
              ) : (
                <>
                  {replies.map((r) => (
                    <MessageBubble key={r.id} msg={r} isMe={!!myPubkey && r.pubkey === myPubkey} />
                  ))}
                  <div ref={bottomRef} style={{ height: 10 }} />
                </>
              )}
            </div>

            {/* ── Scroll-to-latest floating button ── */}
            {showScrollBtn && (
              <button
                onClick={() => scrollToBottom("smooth")}
                style={{
                  position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", borderRadius: 20,
                  background: "linear-gradient(135deg, #1d4ed8, #1e40af)",
                  color: "#fff", border: "none", cursor: "pointer",
                  fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                  boxShadow: "0 4px 20px rgba(29,78,216,0.5)",
                  animation: "fadeSlideIn 0.2s ease-out",
                  WebkitTapHighlightColor: "transparent",
                  zIndex: 10,
                }}
              >
                <ChevronDown style={{ width: 14, height: 14 }} />
                {newMsgCount > 0 ? `${newMsgCount} new message${newMsgCount !== 1 ? "s" : ""}` : "Scroll to latest"}
              </button>
            )}
          </div>

          {/* ── Composer ── */}
          <div style={{ flexShrink: 0, padding: "10px 12px", paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))", background: "#0a0f1a", borderTop: "1px solid #1a2840" }}>
            {!hasKey ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 16px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid #1a2840" }}>
                <span style={{ fontFamily: "monospace", fontSize: 13, color: "#475569", textAlign: "center" }}>
                  Add private key in <strong style={{ color: "#fbbf24" }}>Settings ⚙</strong> to post
                </span>
              </div>
            ) : holderLocked ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 16px", borderRadius: 16, background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.2)" }}>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#fbbf24", textAlign: "center" }}>
                  💎 Buy ${symbol} to unlock posting
                </span>
              </div>
            ) : appLocked && !allowedPubkeys.includes(myPubkey) ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 16px", borderRadius: 16, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#f87171", textAlign: "center" }}>
                  🔒 Chat locked — you can't post here
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message $${symbol}…`}
                  style={{ flex: 1, padding: "13px 16px", borderRadius: 16, border: "1.5px solid #1e3a5a", background: "rgba(255,255,255,0.06)", color: "#f1f5f9", fontFamily: "monospace", fontSize: 16, outline: "none", WebkitAppearance: "none", minHeight: 48 } as React.CSSProperties}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(251,191,36,0.5)"; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "#1e3a5a"; }}
                  autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false} enterKeyHint="send"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={sending || !message.trim()}
                  aria-label="Send message"
                  style={{ width: 48, height: 48, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: sending || !message.trim() ? "not-allowed" : "pointer", background: sending || !message.trim() ? "rgba(251,191,36,0.15)" : "linear-gradient(135deg,#f59e0b,#d97706)", color: sending || !message.trim() ? "rgba(251,191,36,0.4)" : "#080c14", WebkitTapHighlightColor: "transparent" }}>
                  {sending ? <RefreshCw style={{ width: 17, height: 17, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 17, height: 17 }} />}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0.8; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
