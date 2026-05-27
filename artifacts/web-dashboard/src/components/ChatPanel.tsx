import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageCircle,
  RefreshCw,
  User,
  ExternalLink,
  Send,
  Wallet,
  LogOut,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useCoinReplies } from "@/hooks/usePumpFun";
import type { PumpCoin } from "@/hooks/usePumpFun";

// ── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - (ts > 1e12 ? ts : ts * 1000)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function mcapFmt(coin: PumpCoin): string {
  const v = coin.usd_market_cap ?? coin.market_cap;
  if (!v) return "—";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

// ── pump.fun auth via wallet ──────────────────────────────────────────────────
// The pump.fun auth flow: sign a message → exchange for a JWT via /api/pumpfun/auth
// Browser-safe base58 encode (no Node.js Buffer)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function toBase58(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += "1";
  for (let i = digits.length - 1; i >= 0; i--) result += BASE58_ALPHABET[digits[i]!];
  return result;
}

async function getPumpJwt(
  publicKey: { toBase58(): string },
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>
): Promise<string> {
  const timestamp = Date.now();
  const message = new TextEncoder().encode(JSON.stringify({ timestamp }));
  const signature = await signMessage(message);

  // Encode using browser-safe base58
  const encodedSignature = toBase58(signature);
  const encodedMessage = toBase58(message);

  // Proxy through our server to avoid CORS
  const resp = await fetch("/api/pumpfun/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: publicKey.toBase58(),
      encodedMessage,
      encodedSignature,
      timestamp,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Auth failed (${resp.status}): ${body.slice(0, 120)}`);
  }

  const data = await resp.json();
  if (!data?.token) throw new Error("No token in pump.fun auth response");
  return data.token as string;
}

// ── component ─────────────────────────────────────────────────────────────────
interface ChatPanelProps {
  coin: PumpCoin;
  onClose: () => void;
}

export function ChatPanel({ coin, onClose }: ChatPanelProps) {
  const { publicKey, signMessage, disconnect, connected } = useWallet();
  const { data: replies = [], isFetching, refetch } = useCoinReplies(coin.mint);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLenRef = useRef(0);

  const [jwt, setJwt] = useState<string | null>(() =>
    sessionStorage.getItem(`pf_jwt_${publicKey?.toBase58() ?? ""}`) ?? null
  );
  const [inputText, setInputText] = useState("");
  const [posting, setPosting] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auto-scroll on new replies
  useEffect(() => {
    if (replies.length > prevLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      prevLenRef.current = replies.length;
    }
  }, [replies.length]);

  // Clear JWT when wallet disconnects
  useEffect(() => {
    if (!connected) setJwt(null);
  }, [connected]);

  const handleSignIn = useCallback(async () => {
    if (!publicKey || !signMessage) return;
    setAuthLoading(true);
    setError(null);
    try {
      const token = await getPumpJwt(publicKey, signMessage);
      sessionStorage.setItem(`pf_jwt_${publicKey.toBase58()}`, token);
      setJwt(token);
    } catch (e: any) {
      setError(e?.message ?? "Sign-in failed");
    } finally {
      setAuthLoading(false);
    }
  }, [publicKey, signMessage]);

  const handlePost = useCallback(async () => {
    if (!inputText.trim() || !jwt) return;
    setPosting(true);
    setError(null);
    try {
      const resp = await fetch(`/api/pumpfun/coin/${coin.mint}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText.trim(), jwt }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        // If 401, JWT expired — clear it
        if (resp.status === 401) {
          setJwt(null);
          sessionStorage.removeItem(`pf_jwt_${publicKey?.toBase58() ?? ""}`);
          throw new Error("Session expired — please sign in again");
        }
        throw new Error(body?.error ?? `Post failed (${resp.status})`);
      }
      setInputText("");
      setSuccessMsg("Comment posted to pump.fun! ✓");
      setTimeout(() => setSuccessMsg(null), 4000);
      setTimeout(() => refetch(), 1500);
    } catch (e: any) {
      setError(e?.message ?? "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }, [inputText, jwt, coin.mint, publicKey, refetch]);

  const pumpUrl = `https://pump.fun/${coin.mint}`;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-l border-[#1a1a1a]">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-[#1a1a1a] bg-[#0d0d0d] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {coin.image_uri ? (
              <img
                src={coin.image_uri}
                alt={coin.symbol}
                className="w-10 h-10 rounded-full object-cover shrink-0 border border-[#1a1a1a]"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#111] border border-[#1a1a1a] flex items-center justify-center shrink-0">
                <span className="text-[#FFD700] font-black text-base">{(coin.symbol ?? "?")[0]}</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-black text-sm truncate">{coin.name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20">
                  ${coin.symbol}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[#FFD700] text-xs font-bold">{mcapFmt(coin)}</span>
                <span className="text-[#555] text-xs">{replies.length} comments</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {coin.is_currently_live && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                LIVE
              </span>
            )}
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded text-[#555] hover:text-[#00E676] transition-colors"
            >
              <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            </button>
            <a
              href={pumpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded text-[#555] hover:text-[#FFD700] transition-colors"
            >
              <ExternalLink size={12} />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-[#555] hover:text-white transition-colors text-base leading-none ml-0.5"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {isFetching && replies.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-2.5 animate-pulse">
                <div className="w-7 h-7 rounded-full bg-[#111] shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-[#111] rounded w-24" />
                  <div className="h-3 bg-[#111] rounded w-full" />
                  <div className="h-3 bg-[#111] rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}
        {!isFetching && replies.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MessageCircle size={28} className="text-[#1a1a1a] mb-3" />
            <p className="text-[#444] text-sm font-medium">No comments yet</p>
            <p className="text-[#333] text-xs mt-1">Be the first to comment!</p>
          </div>
        )}
        {replies.map((reply) => (
          <div key={reply.id} className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#111] border border-[#1a1a1a] flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
              {reply.profile_image ? (
                <img src={reply.profile_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={11} className="text-[#555]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-bold text-[#00E676]">
                  {reply.username || shortAddr(reply.user)}
                </span>
                <span className="text-[#2a2a2a] text-[10px]">{timeAgo(reply.timestamp)}</span>
              </div>
              <p className="text-[#ccc] text-xs leading-relaxed break-words">{reply.message}</p>
              {reply.likes != null && reply.likes > 0 && (
                <span className="text-[#333] text-[10px] mt-0.5 inline-block">❤ {reply.likes}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Comment input area ── */}
      <div className="shrink-0 border-t border-[#1a1a1a] bg-[#0d0d0d]">
        {/* Error / success feedback */}
        {error && (
          <div className="flex items-start gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20">
            <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-400 text-xs leading-relaxed">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400 text-xs">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="px-4 py-2 bg-[#00E676]/10 border-b border-[#00E676]/20 text-[#00E676] text-xs font-semibold">
            {successMsg}
          </div>
        )}

        {!connected ? (
          /* Not connected — show wallet connect */
          <div className="px-4 py-3 space-y-2">
            <p className="text-[#444] text-[11px] text-center">
              Connect your Phantom wallet to comment on pump.fun
            </p>
            <div className="flex justify-center [&_.wallet-adapter-button]:!bg-[#111] [&_.wallet-adapter-button]:!border [&_.wallet-adapter-button]:!border-[#1a1a1a] [&_.wallet-adapter-button]:!rounded-xl [&_.wallet-adapter-button]:!text-xs [&_.wallet-adapter-button]:!font-bold [&_.wallet-adapter-button]:!px-4 [&_.wallet-adapter-button]:!py-2 [&_.wallet-adapter-button:hover]:!bg-[#1a1a1a]">
              <WalletMultiButton />
            </div>
          </div>
        ) : !jwt ? (
          /* Connected but not signed in to pump.fun */
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[#555] text-[11px]">
                Connected: <span className="text-[#00E676] font-mono">{shortAddr(publicKey!.toBase58())}</span>
              </p>
              <button
                onClick={() => disconnect()}
                className="text-[#333] hover:text-[#666] text-[10px] flex items-center gap-1"
              >
                <LogOut size={10} />
                Disconnect
              </button>
            </div>
            <button
              onClick={handleSignIn}
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-2 bg-[#FFD700] text-[#050505] text-xs font-black px-4 py-2.5 rounded-xl hover:bg-[#FFE033] transition-colors disabled:opacity-60"
            >
              {authLoading ? (
                <><Loader2 size={12} className="animate-spin" /> Signing in…</>
              ) : (
                <><Wallet size={12} /> Sign in to pump.fun</>
              )}
            </button>
            <p className="text-[#2a2a2a] text-[10px] text-center">
              Signs a message with your wallet — no SOL spent
            </p>
          </div>
        ) : (
          /* Signed in — show comment input */
          <div className="px-3 py-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[#00E676] text-[10px] font-bold flex items-center gap-1">
                <Wallet size={9} />
                {shortAddr(publicKey!.toBase58())}
              </span>
              <button
                onClick={() => { setJwt(null); sessionStorage.removeItem(`pf_jwt_${publicKey?.toBase58()}`); }}
                className="text-[#333] hover:text-[#666] text-[10px]"
              >
                Sign out
              </button>
            </div>
            <div className="flex gap-2">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handlePost();
                  }
                }}
                placeholder="Write a comment… (Enter to post)"
                rows={2}
                maxLength={500}
                className="flex-1 bg-[#111] border border-[#1a1a1a] rounded-xl text-[16px] leading-snug text-white placeholder-[#333] px-3 py-2.5 resize-none focus:outline-none focus:border-[#00E676]/40 transition-colors"
              />
              <button
                onClick={handlePost}
                disabled={posting || !inputText.trim()}
                className="self-end p-2.5 rounded-xl bg-[#00E676] text-[#050505] hover:bg-[#00FF88] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
            <p className="text-[#222] text-[10px] text-center">
              Comments post directly to pump.fun ·{" "}
              <a href={pumpUrl} target="_blank" rel="noopener noreferrer" className="text-[#FFD700]/50 hover:text-[#FFD700]">
                View on pump.fun ↗
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
