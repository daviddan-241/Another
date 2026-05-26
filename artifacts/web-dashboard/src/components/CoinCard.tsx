import { ExternalLink, Video, MessageCircle, Twitter, Clock, TrendingUp } from "lucide-react";
import type { PumpCoin } from "@/hooks/usePumpFun";

interface CoinCardProps {
  coin: PumpCoin;
  mode: "live" | "discord" | "trending";
}

function fmt(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function ago(ts: number): string {
  const s = Math.floor(Date.now() / 1000 - ts / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function CoinCard({ coin, mode }: CoinCardProps) {
  const pumpUrl = `https://pump.fun/${coin.mint}`;
  const liveUrl = coin.creator ? `https://pump.fun/profile/${coin.creator}` : pumpUrl;
  const mcap = coin.usd_market_cap ?? coin.market_cap;

  const badgeColors: Record<typeof mode, string> = {
    live: "bg-red-500/15 text-red-400 border-red-500/30",
    discord: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    trending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  };
  const badgeLabels: Record<typeof mode, string> = {
    live: "● LIVE",
    discord: "DISCORD",
    trending: "🔥 TRENDING",
  };

  return (
    <div className="rounded-xl border border-[#1e2e1e] bg-[#111811] overflow-hidden hover:border-[#2a4a2a] transition-colors">
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          {coin.image_uri ? (
            <img
              src={coin.image_uri}
              alt={coin.symbol}
              className="w-11 h-11 rounded-full object-cover shrink-0 bg-[#1a2a1a]"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[#1a2a1a] flex items-center justify-center shrink-0">
              <span className="text-[#00e676] font-bold text-lg">{(coin.symbol ?? "?")[0]}</span>
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[#e8f5e9] font-bold text-sm truncate">{coin.name ?? "Unknown"}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeColors[mode]}`}>
                {badgeLabels[mode]}
              </span>
            </div>
            <span className="text-[#6a9f6a] text-xs">${coin.symbol}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[#ffd700] font-bold text-sm">{fmt(mcap)}</div>
          <div className="text-[#6a9f6a] text-[10px]">mkt cap</div>
        </div>
      </div>

      {coin.description && (
        <p className="text-[#6a9f6a] text-xs px-4 pb-2 line-clamp-2">{coin.description}</p>
      )}

      <div className="flex items-center gap-3 px-4 pb-3 text-[11px] text-[#6a9f6a]">
        <span className="flex items-center gap-1">
          <Clock size={10} />
          {ago(coin.created_timestamp)}
        </span>
        {coin.reply_count != null && (
          <span className="flex items-center gap-1">
            <MessageCircle size={10} />
            {coin.reply_count}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 pb-3 border-t border-[#1e2e1e] pt-2.5 flex-wrap">
        <a
          href={pumpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 bg-[#00e676] text-[#0a0f0a] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#00ff88] transition-colors"
        >
          <TrendingUp size={12} />
          Pump.fun
        </a>

        {mode === "live" && (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border border-red-500/40 text-red-400 bg-red-500/10 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <Video size={12} />
            Livestream
          </a>
        )}

        {mode === "discord" && coin.discord && (
          <a
            href={coin.discord}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border border-indigo-500/40 text-indigo-400 bg-indigo-500/10 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-500/20 transition-colors"
          >
            <MessageCircle size={12} />
            Discord
          </a>
        )}

        {coin.twitter && (
          <a
            href={coin.twitter}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border border-[#2a3a2a] text-[#6a9f6a] text-xs px-2 py-1.5 rounded-lg hover:border-[#3a5a3a] hover:text-[#e8f5e9] transition-colors"
          >
            <Twitter size={12} />
          </a>
        )}

        {coin.website && (
          <a
            href={coin.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border border-[#2a3a2a] text-[#6a9f6a] text-xs px-2 py-1.5 rounded-lg hover:border-[#3a5a3a] hover:text-[#e8f5e9] transition-colors"
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
