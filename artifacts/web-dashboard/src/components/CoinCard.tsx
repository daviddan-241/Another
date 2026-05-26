import { ExternalLink, Video, MessageCircle, Twitter, Clock, TrendingUp, Globe, Send } from "lucide-react";
import type { PumpCoin } from "@/hooks/usePumpFun";

interface CoinCardProps {
  coin: PumpCoin;
  mode: "live" | "discord" | "trending";
  onOpenChat?: (coin: PumpCoin) => void;
  chatOpen?: boolean;
}

function fmt(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const MODE_STYLES = {
  live: {
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    label: "● LIVE",
    glow: "hover:border-red-500/30",
    actionBtn: "border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20",
    actionIcon: <Video size={13} />,
    actionLabel: "Livestream",
  },
  discord: {
    badge: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    label: "DISCORD",
    glow: "hover:border-indigo-500/30",
    actionBtn: "border-indigo-500/30 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20",
    actionIcon: <MessageCircle size={13} />,
    actionLabel: "Discord",
  },
  trending: {
    badge: "bg-[#FFD700]/15 text-[#FFD700] border-[#FFD700]/30",
    label: "🔥 HOT",
    glow: "hover:border-[#FFD700]/30",
    actionBtn: "border-[#FFD700]/30 text-[#FFD700] bg-[#FFD700]/10 hover:bg-[#FFD700]/20",
    actionIcon: <TrendingUp size={13} />,
    actionLabel: "Trending",
  },
} as const;

export function CoinCard({ coin, mode, onOpenChat, chatOpen }: CoinCardProps) {
  const s = MODE_STYLES[mode];
  const pumpUrl = `https://pump.fun/${coin.mint}`;
  const liveUrl = coin.creator ? `https://pump.fun/profile/${coin.creator}` : pumpUrl;
  const mcap = coin.usd_market_cap ?? coin.market_cap;
  const secondaryUrl = mode === "live" ? liveUrl : mode === "discord" ? coin.discord : undefined;

  return (
    <div
      className={`relative rounded-2xl border border-[#1a1a1a] bg-[#0d0d0d] overflow-hidden transition-all duration-200 ${s.glow} hover:shadow-lg hover:shadow-black/40 hover:-translate-y-0.5`}
    >
      {/* Top stripe accent */}
      <div className={`h-0.5 w-full ${mode === "live" ? "bg-gradient-to-r from-red-500/0 via-red-500 to-red-500/0" : mode === "discord" ? "bg-gradient-to-r from-indigo-500/0 via-indigo-500 to-indigo-500/0" : "bg-gradient-to-r from-[#FFD700]/0 via-[#FFD700] to-[#FFD700]/0"}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <div className="relative shrink-0">
            {coin.image_uri ? (
              <img
                src={coin.image_uri}
                alt={coin.symbol}
                className="w-12 h-12 rounded-full object-cover border border-[#1a1a1a]"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#111] border border-[#1a1a1a] flex items-center justify-center">
                <span className="text-[#FFD700] font-black text-xl">{(coin.symbol ?? "?")[0]}</span>
              </div>
            )}
            {coin.is_currently_live && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-[#0d0d0d] animate-pulse" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-white font-black text-base leading-tight truncate">{coin.name ?? "Unknown"}</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${s.badge} shrink-0`}>{s.label}</span>
            </div>
            <span className="text-[#555] text-xs font-semibold">${coin.symbol}</span>
          </div>

          {/* Market cap */}
          <div className="text-right shrink-0">
            <div className="text-[#FFD700] font-black text-lg leading-none">{fmt(mcap)}</div>
            <div className="text-[#444] text-[10px] mt-0.5 uppercase tracking-wide">mkt cap</div>
          </div>
        </div>

        {/* Description */}
        {coin.description && (
          <p className="text-[#666] text-xs leading-relaxed mb-3 line-clamp-2 border-l-2 border-[#1a1a1a] pl-2">
            {coin.description}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 mb-3 text-[11px] text-[#444]">
          <span className="flex items-center gap-1">
            <Clock size={10} className="text-[#333]" />
            {ago(coin.created_timestamp)}
          </span>
          {coin.reply_count != null && coin.reply_count > 0 && (
            <span className="flex items-center gap-1">
              <MessageCircle size={10} className="text-[#333]" />
              {coin.reply_count.toLocaleString()}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Primary: pump.fun */}
          <a
            href={pumpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-[#00E676] text-[#050505] text-xs font-black px-3.5 py-2 rounded-xl hover:bg-[#00FF88] transition-colors"
          >
            <TrendingUp size={12} />
            Pump.fun
          </a>

          {/* Secondary: live/discord/trending */}
          {secondaryUrl && (
            <a
              href={secondaryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 border text-xs font-bold px-3.5 py-2 rounded-xl transition-colors ${s.actionBtn}`}
            >
              {s.actionIcon}
              {s.actionLabel}
            </a>
          )}

          {/* Chat button */}
          <button
            onClick={() => onOpenChat?.(coin)}
            className={`flex items-center gap-1.5 border text-xs font-bold px-3.5 py-2 rounded-xl transition-colors ${
              chatOpen
                ? "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]"
                : "border-[#1a1a1a] text-[#555] hover:border-[#333] hover:text-white"
            }`}
          >
            <MessageCircle size={12} />
            Chat
          </button>

          {/* Social links */}
          <div className="flex items-center gap-1 ml-auto">
            {coin.twitter && (
              <a href={coin.twitter} target="_blank" rel="noopener noreferrer"
                className="p-1.5 rounded-lg border border-[#1a1a1a] text-[#444] hover:text-sky-400 hover:border-sky-400/20 transition-colors">
                <Twitter size={11} />
              </a>
            )}
            {coin.telegram && (
              <a href={coin.telegram} target="_blank" rel="noopener noreferrer"
                className="p-1.5 rounded-lg border border-[#1a1a1a] text-[#444] hover:text-sky-400 hover:border-sky-400/20 transition-colors">
                <Send size={11} />
              </a>
            )}
            {coin.website && (
              <a href={coin.website} target="_blank" rel="noopener noreferrer"
                className="p-1.5 rounded-lg border border-[#1a1a1a] text-[#444] hover:text-[#FFD700] hover:border-[#FFD700]/20 transition-colors">
                <Globe size={11} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
