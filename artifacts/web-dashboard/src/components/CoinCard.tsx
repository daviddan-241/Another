import { ExternalLink, Video, MessageCircle, Twitter, Clock, TrendingUp, Globe, Send, WifiOff } from "lucide-react";
import type { PumpCoin } from "@/hooks/usePumpFun";

interface CoinCardProps {
  coin: PumpCoin;
  mode: "live" | "discord" | "trending" | "micro";
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
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDateTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${day} · ${h}:${m}`;
}

const MODE_STYLES = {
  live: {
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    label: "● LIVE",
    glow: "hover:border-red-500/30",
    actionBtn: "border-red-500/30 text-red-400 bg-red-500/10 active:bg-red-500/30",
    actionIcon: <Video size={13} />,
    actionLabel: "Livestream",
    stripe: "from-red-500/0 via-red-500 to-red-500/0",
  },
  discord: {
    badge: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    label: "DISCORD",
    glow: "hover:border-indigo-500/30",
    actionBtn: "border-indigo-500/30 text-indigo-400 bg-indigo-500/10 active:bg-indigo-500/30",
    actionIcon: <MessageCircle size={13} />,
    actionLabel: "Discord",
    stripe: "from-indigo-500/0 via-indigo-500 to-indigo-500/0",
  },
  trending: {
    badge: "bg-[#FFD700]/15 text-[#FFD700] border-[#FFD700]/30",
    label: "🔥 HOT",
    glow: "hover:border-[#FFD700]/30",
    actionBtn: "border-[#FFD700]/30 text-[#FFD700] bg-[#FFD700]/10 active:bg-[#FFD700]/30",
    actionIcon: <TrendingUp size={13} />,
    actionLabel: "Trending",
    stripe: "from-[#FFD700]/0 via-[#FFD700] to-[#FFD700]/0",
  },
  micro: {
    badge: "bg-amber-400/15 text-amber-400 border-amber-400/30",
    label: "🔬 <$5K",
    glow: "hover:border-amber-400/30",
    actionBtn: "border-amber-400/30 text-amber-400 bg-amber-400/10 active:bg-amber-400/30",
    actionIcon: <ExternalLink size={13} />,
    actionLabel: "Pump.fun",
    stripe: "from-amber-400/0 via-amber-400 to-amber-400/0",
  },
} as const;

export function CoinCard({ coin, mode, onOpenChat, chatOpen }: CoinCardProps) {
  const s = MODE_STYLES[mode];
  const pumpUrl = `https://pump.fun/${coin.mint}`;
  const liveUrl = coin.creator ? `https://pump.fun/profile/${coin.creator}` : pumpUrl;
  const mcap = coin.usd_market_cap ?? coin.market_cap;
  const secondaryUrl = mode === "live" ? liveUrl : mode === "discord" ? coin.discord : undefined;
  const isEnded = coin.streamEnded === true;

  return (
    <div
      className={`relative rounded-2xl border overflow-hidden transition-all duration-200 ${
        isEnded
          ? "border-[#1a1a1a] bg-[#080808] opacity-75"
          : `border-[#1a1a1a] bg-[#0d0d0d] ${s.glow} hover:shadow-lg hover:shadow-black/40`
      }`}
    >
      {/* Top stripe accent */}
      <div
        className={`h-0.5 w-full bg-gradient-to-r ${
          isEnded ? "from-[#1a1a1a]/0 via-[#2a2a2a] to-[#1a1a1a]/0" : s.stripe
        }`}
      />

      {/* STREAM ENDED overlay badge */}
      {isEnded && (
        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 bg-[#111] border border-[#2a2a2a] text-[#555] text-[9px] font-black px-2 py-0.5 rounded-full">
          <WifiOff size={8} />
          ENDED
        </div>
      )}

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <div className="relative shrink-0">
            {coin.image_uri ? (
              <img
                src={coin.image_uri}
                alt={coin.symbol}
                className={`w-12 h-12 rounded-full object-cover border border-[#1a1a1a] ${isEnded ? "grayscale opacity-60" : ""}`}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className={`w-12 h-12 rounded-full border border-[#1a1a1a] flex items-center justify-center ${isEnded ? "bg-[#0d0d0d]" : "bg-[#111]"}`}>
                <span className={`font-black text-xl ${isEnded ? "text-[#333]" : "text-[#FFD700]"}`}>
                  {(coin.symbol ?? "?")[0]}
                </span>
              </div>
            )}
            {coin.is_currently_live && !isEnded && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-[#0d0d0d] animate-pulse" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className={`font-black text-base leading-tight truncate ${isEnded ? "text-[#666]" : "text-white"}`}>
                {coin.name ?? "Unknown"}
              </span>
              {!isEnded && (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${s.badge} shrink-0`}>
                  {s.label}
                </span>
              )}
            </div>
            <span className="text-[#555] text-xs font-semibold">${coin.symbol}</span>
          </div>

          {/* Market cap */}
          <div className="text-right shrink-0">
            <div className={`font-black text-lg leading-none ${isEnded ? "text-[#444]" : "text-[#FFD700]"}`}>
              {fmt(mcap)}
            </div>
            <div className="text-[#333] text-[10px] mt-0.5 uppercase tracking-wide">mkt cap</div>
          </div>
        </div>

        {/* Description */}
        {coin.description && (
          <p className="text-[#555] text-xs leading-relaxed mb-3 line-clamp-2 border-l-2 border-[#1a1a1a] pl-2">
            {coin.description}
          </p>
        )}

        {/* Meta row — created time + relative ago */}
        <div className="flex items-center gap-3 mb-3 text-[11px] text-[#444]">
          {coin.created_timestamp ? (
            <>
              <span className="flex items-center gap-1">
                <Clock size={10} className="text-[#333]" />
                {ago(coin.created_timestamp)}
              </span>
              <span className="text-[#2a2a2a]">·</span>
              <span className="text-[#333] font-mono text-[10px]">
                {fmtDateTime(coin.created_timestamp)}
              </span>
            </>
          ) : null}
          {coin.reply_count != null && coin.reply_count > 0 && (
            <span className="flex items-center gap-1 ml-auto">
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
            className="flex items-center gap-1.5 bg-[#00E676] text-[#050505] text-xs font-black px-4 py-2.5 rounded-xl active:bg-[#00FF88] transition-colors min-h-[40px]"
          >
            <TrendingUp size={12} />
            Pump.fun
          </a>

          {/* Secondary: live/discord/trending — hidden if stream ended */}
          {secondaryUrl && !isEnded && (
            <a
              href={secondaryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 border text-xs font-bold px-4 py-2.5 rounded-xl transition-colors min-h-[40px] ${s.actionBtn}`}
            >
              {s.actionIcon}
              {s.actionLabel}
            </a>
          )}

          {/* Chat button */}
          <button
            onClick={() => onOpenChat?.(coin)}
            className={`flex items-center gap-1.5 border text-xs font-bold px-4 py-2.5 rounded-xl transition-colors min-h-[40px] ${
              chatOpen
                ? "border-[#00E676]/40 bg-[#00E676]/10 text-[#00E676]"
                : "border-[#1a1a1a] text-[#555] active:border-[#333] active:text-white"
            }`}
          >
            <MessageCircle size={12} />
            Chat
          </button>

          {/* Social links */}
          <div className="flex items-center gap-1 ml-auto">
            {coin.twitter && (
              <a href={coin.twitter} target="_blank" rel="noopener noreferrer"
                className="p-2 rounded-lg border border-[#1a1a1a] text-[#444] active:text-sky-400 active:border-sky-400/20 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
                <Twitter size={11} />
              </a>
            )}
            {coin.telegram && (
              <a href={coin.telegram} target="_blank" rel="noopener noreferrer"
                className="p-2 rounded-lg border border-[#1a1a1a] text-[#444] active:text-sky-400 active:border-sky-400/20 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
                <Send size={11} />
              </a>
            )}
            {coin.website && (
              <a href={coin.website} target="_blank" rel="noopener noreferrer"
                className="p-2 rounded-lg border border-[#1a1a1a] text-[#444] active:text-[#FFD700] active:border-[#FFD700]/20 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
                <Globe size={11} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
