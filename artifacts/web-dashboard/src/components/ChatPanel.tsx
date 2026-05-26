import { useState, useEffect, useRef } from "react";
import { MessageCircle, RefreshCw, User, ExternalLink } from "lucide-react";
import { useCoinReplies } from "@/hooks/usePumpFun";
import type { PumpCoin } from "@/hooks/usePumpFun";

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

interface ChatPanelProps {
  coin: PumpCoin;
  onClose: () => void;
}

export function ChatPanel({ coin, onClose }: ChatPanelProps) {
  const { data: replies = [], isFetching, refetch } = useCoinReplies(coin.mint);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [prevLen, setPrevLen] = useState(0);

  useEffect(() => {
    if (replies.length > prevLen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setPrevLen(replies.length);
    }
  }, [replies.length, prevLen]);

  const pumpUrl = `https://pump.fun/${coin.mint}`;
  const mcap = coin.usd_market_cap ?? coin.market_cap;
  const mcapFmt = mcap
    ? mcap >= 1e6 ? `$${(mcap / 1e6).toFixed(2)}M` : mcap >= 1e3 ? `$${(mcap / 1e3).toFixed(1)}K` : `$${mcap.toFixed(0)}`
    : "—";

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-l border-[#1a1a1a]">
      {/* Panel header */}
      <div className="shrink-0 border-b border-[#1a1a1a] bg-[#0d0d0d] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {coin.image_uri ? (
              <img src={coin.image_uri} alt={coin.symbol} className="w-10 h-10 rounded-full object-cover shrink-0 border border-[#1a1a1a]" />
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
                <span className="text-[#FFD700] text-xs font-bold">{mcapFmt}</span>
                <span className="text-[#666] text-xs">{replies.length} comments</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded text-[#666] hover:text-[#00E676] transition-colors"
            >
              <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            </button>
            <a
              href={pumpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded text-[#666] hover:text-[#FFD700] transition-colors"
            >
              <ExternalLink size={13} />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded text-[#666] hover:text-white transition-colors text-lg leading-none ml-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* Live / Discord badges */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {coin.is_currently_live && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
              LIVE
            </span>
          )}
          {coin.discord && (
            <a href={coin.discord} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 hover:bg-indigo-500/25 transition-colors">
              <MessageCircle size={9} />
              DISCORD
            </a>
          )}
          {coin.twitter && (
            <a href={coin.twitter} target="_blank" rel="noopener noreferrer"
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors">
              TWITTER
            </a>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {replies.length === 0 && !isFetching && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageCircle size={32} className="text-[#222] mb-3" />
            <p className="text-[#444] text-sm font-medium">No comments yet</p>
            <p className="text-[#333] text-xs mt-1">Comments auto-refresh every 8s</p>
          </div>
        )}
        {isFetching && replies.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
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
        {replies.map((reply) => (
          <div key={reply.id} className="flex gap-2.5 group">
            <div className="w-7 h-7 rounded-full bg-[#111] border border-[#1a1a1a] flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
              {reply.profile_image ? (
                <img src={reply.profile_image} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={12} className="text-[#555]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[11px] font-bold text-[#00E676]">
                  {reply.username || shortAddr(reply.user)}
                </span>
                <span className="text-[#333] text-[10px]">{timeAgo(reply.timestamp)}</span>
              </div>
              <p className="text-[#ccc] text-xs leading-relaxed break-words">{reply.message}</p>
              {reply.likes != null && reply.likes > 0 && (
                <span className="text-[#444] text-[10px] mt-0.5 inline-block">❤ {reply.likes}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Footer note */}
      <div className="shrink-0 border-t border-[#1a1a1a] px-4 py-2.5">
        <p className="text-[#333] text-[11px] text-center">
          Live feed from pump.fun · Auto-refreshes every 8s ·{" "}
          <a href={pumpUrl} target="_blank" rel="noopener noreferrer" className="text-[#FFD700] hover:underline">
            Reply on pump.fun ↗
          </a>
        </p>
      </div>
    </div>
  );
}
