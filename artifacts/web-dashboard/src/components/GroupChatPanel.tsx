import { useEffect, useRef, useState } from "react";
import { MessageCircle, RefreshCw, Users, ExternalLink, Send, X } from "lucide-react";
import { useCoinReplies } from "@/hooks/usePumpFun";
import type { PumpCoin } from "@/hooks/usePumpFun";

interface GroupChatPanelProps {
  coin: PumpCoin;
  onClose: () => void;
}

interface GroupChatInfo {
  hasGroupChat: boolean;
  channelId: string | null;
  inviteUrl: string | null;
  memberCount?: number | null;
}

function timeStr(ts: number): string {
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function GroupChatPanel({ coin, onClose }: GroupChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [chatInfo, setChatInfo] = useState<GroupChatInfo | null>(null);
  const [chatLoading, setChatLoading] = useState(true);
  const pumpUrl = `https://pump.fun/${coin.mint}`;

  const repliesQ = useCoinReplies(coin.mint);
  const replies = repliesQ.data ?? [];

  // Fetch group chat invite info once
  useEffect(() => {
    setChatLoading(true);
    fetch(`/api/pumpfun/coin/${coin.mint}/groupchat`)
      .then((r) => r.json())
      .then((d) => setChatInfo(d))
      .catch(() => setChatInfo({ hasGroupChat: false, channelId: null, inviteUrl: null }))
      .finally(() => setChatLoading(false));
  }, [coin.mint]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  const fmt = (n?: number) => {
    if (!n) return "—";
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#080808]">
      {/* Header */}
      <div className="shrink-0 px-3 py-2.5 border-b border-[#111] flex items-center gap-2.5">
        {coin.image_uri ? (
          <img src={coin.image_uri} alt={coin.symbol} className="w-8 h-8 rounded-full border border-[#1a1a1a] object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[#111] border border-[#1a1a1a] flex items-center justify-center">
            <span className="text-[#FFD700] font-black text-sm">{(coin.symbol ?? "?")[0]}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold text-sm truncate">{coin.name}</div>
          <div className="text-[#444] text-[10px] font-mono">${coin.symbol}  ·  {fmt(coin.usd_market_cap ?? coin.market_cap)}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {repliesQ.isFetching && <RefreshCw size={10} className="text-[#333] animate-spin" />}
          <span className="text-[#333] text-[10px]">{replies.length} msgs</span>
          <button onClick={onClose} className="p-1 text-[#333] active:text-white">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Group chat invite banner */}
      {!chatLoading && chatInfo?.hasGroupChat && (
        <div className="shrink-0 px-3 py-2 bg-[#0d0d0d] border-b border-[#111] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-[#00E676]">
            <Users size={11} />
            <span>Group chat available</span>
            {chatInfo.memberCount ? <span className="text-[#444]">· {chatInfo.memberCount} members</span> : null}
          </div>
          <a
            href={chatInfo.inviteUrl ?? pumpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-bold text-[#00E676] border border-[#00E676]/20 bg-[#00E676]/5 px-2 py-1 rounded-lg"
          >
            <ExternalLink size={9} />
            Join
          </a>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {repliesQ.isLoading ? (
          <div className="flex items-center justify-center py-8 text-[#333] text-xs">
            <RefreshCw size={12} className="animate-spin mr-2" /> Loading chat…
          </div>
        ) : replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageCircle size={24} className="text-[#1a1a1a] mb-2" />
            <p className="text-[#444] text-xs">No messages yet</p>
            <a href={pumpUrl} target="_blank" rel="noopener noreferrer"
              className="mt-2 text-[#FFD700]/60 text-[10px] hover:text-[#FFD700] flex items-center gap-1">
              <ExternalLink size={9} /> Be first on pump.fun
            </a>
          </div>
        ) : (
          replies.map((msg) => (
            <div key={msg.id} className="flex gap-2 items-start">
              {msg.profile_image ? (
                <img src={msg.profile_image} alt="" className="w-6 h-6 rounded-full border border-[#111] shrink-0 object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#111] border border-[#111] shrink-0 flex items-center justify-center">
                  <span className="text-[#333] text-[9px] font-black">
                    {(msg.username ?? msg.user ?? "?")[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 mb-0.5">
                  <span className="text-[#00E676] text-[10px] font-bold truncate max-w-[80px]">
                    {msg.username ? `@${msg.username}` : shortAddr(msg.user ?? "")}
                  </span>
                  <span className="text-[#2a2a2a] text-[9px] shrink-0">
                    {timeStr(msg.timestamp)}
                  </span>
                </div>
                <p className="text-[#aaa] text-xs leading-relaxed break-words">{msg.message}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer — link to pump.fun to reply */}
      <div className="shrink-0 px-3 py-2.5 border-t border-[#111] flex items-center justify-between gap-2">
        <span className="text-[#2a2a2a] text-[10px]">Read-only · reply on pump.fun</span>
        <a
          href={pumpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] font-bold text-[#050505] bg-[#00E676] px-3 py-1.5 rounded-xl active:bg-[#00FF88] min-h-[36px]"
        >
          <Send size={11} />
          Reply
        </a>
      </div>
    </div>
  );
}
