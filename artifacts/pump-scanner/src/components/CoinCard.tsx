import React, { useState, useEffect } from "react";
import { formatMarketCap, formatAge } from "@/lib/format";
import type { Coin } from "@workspace/api-client-react";
import {X as Twitter, 
  ExternalLink, MessageSquare, Disc,
  User, Coins, Wallet, Radio, TrendingUp, Clock, Copy, CheckCheck,
  Users, ChevronDown, ChevronUp, AlertTriangle, BadgeCheck,
} from "lucide-react";

interface RecentCoin {
  mint: string;
  name: string;
  symbol: string;
  marketCap: number;
  image?: string | null;
  createdAt?: string;
}

interface DevProfile {
  wallet?: string;
  username?: string | null;
  name?: string | null;
  avatar?: string | null;
  bio?: string | null;
  twitter?: string | null;
  followers?: number;
  coinsCreated: number;
  solBalance: number;
  recentCoins?: RecentCoin[];
}

interface CoinCardProps {
  coin: Coin;
  onOpenChat: (coin: Coin) => void;
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function PlatformBadge({ platform }: { platform?: string }) {
  if (!platform || platform === "pump.fun") return null;
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    "flap.sh":      { label: "FLAP",      color: "#34d399", bg: "rgba(52,211,153,0.12)" },
    "four.meme":    { label: "4MEME",     color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
    "raydium":      { label: "RAYDIUM",   color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
    "bonk.fun":     { label: "BONK",      color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
    "meteora":      { label: "METEORA",   color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
    "orca":         { label: "ORCA",      color: "#f472b6", bg: "rgba(244,114,182,0.12)" },
    "pancakeswap":  { label: "CAKE",      color: "#facc15", bg: "rgba(250,204,21,0.12)" },
    "uniswap":      { label: "UNI",       color: "#e879f9", bg: "rgba(232,121,249,0.12)" },
    "moonshot":     { label: "MOON",      color: "#67e8f9", bg: "rgba(103,232,249,0.12)" },
  };
  const label = platform.length > 9 ? platform.slice(0, 7).toUpperCase() + "…" : platform.toUpperCase();
  const style = cfg[platform.toLowerCase()] ?? { label, color: "#94a3b8", bg: "rgba(148,163,184,0.1)" };
  return (
    <span
      className="text-[9px] font-mono px-1 py-0.5 rounded font-bold flex-shrink-0"
      style={{ background: style.bg, color: style.color, border: `1px solid ${style.color}30` }}
    >
      {style.label}
    </span>
  );
}

function shortWallet(w: string) {
  if (!w || w.length < 10) return w || "?";
  return `${w.slice(0, 5)}…${w.slice(-4)}`;
}

function mcColor(mc: number) {
  if (mc < 1000) return "#60a5fa";
  if (mc < 3000) return "#3b82f6";
  return "#2563eb";
}

function fmtMc(mc: number): string {
  if (!mc || mc === 0) return "$0";
  if (mc >= 1000) return `$${(mc / 1000).toFixed(1)}K`;
  return `$${mc.toFixed(0)}`;
}

function fmtAge(iso?: string): string {
  if (!iso) return "";
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins < 60) return `${Math.round(mins)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function RiskBadge({ count }: { count: number }) {
  if (count <= 3) return <span style={{ background: "rgba(59,130,246,0.12)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)" }} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold">{count} coins</span>;
  if (count <= 10) return <span style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold">⚠ {count} coins</span>;
  return <span style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold">🚨 {count} coins</span>;
}

export function CoinCard({ coin, onOpenChat }: CoinCardProps) {
  const isLivestream = coin.type === "livestream";
  const streamEnded  = !!(coin as Coin & { streamEnded?: boolean }).streamEnded;
  const [devProfile, setDevProfile] = useState<DevProfile | null>(null);
  const [loadingDev, setLoadingDev]  = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [showDevDetail, setShowDevDetail] = useState(false);

  const creator    = (coin as Coin & { creator?: string }).creator ?? "";
  const replyCount = (coin as Coin & { replyCount?: number }).replyCount ?? 0;

  useEffect(() => {
    if (!creator || devProfile || loadingDev) return;
    setLoadingDev(true);
    fetch(`${BASE}/api/dev/${creator}`)
      .then((r) => r.json() as Promise<DevProfile>)
      .then((data) => setDevProfile(data))
      .catch(() => {})
      .finally(() => setLoadingDev(false));
  }, [creator]);

  const copyWallet = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!creator) return;
    void navigator.clipboard.writeText(creator);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
  };

  const createdTime = coin.createdAt
    ? new Date(coin.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const mc = coin.marketCap ?? 0;
  const accentColor = streamEnded ? "#6b7280" : isLivestream ? "#ef4444" : "#818cf8";
  const riskLevel   = devProfile
    ? devProfile.coinsCreated > 20 ? "high"
      : devProfile.coinsCreated > 5 ? "medium"
      : "low"
    : null;

  return (
    <div
      className="rounded-2xl overflow-hidden card-glow"
      style={{
        background: "#0f1520",
        border: `1px solid ${streamEnded ? "#334155" : "#1a2840"}`,
        opacity: streamEnded ? 0.75 : 1,
      }}
    >
      {/* Top accent line */}
      <div className="h-0.5" style={{ background: streamEnded ? "#374151" : accentColor }} />

      {/* Stream ended banner */}
      {streamEnded && (
        <div className="px-4 py-1.5 flex items-center gap-2" style={{ background: "rgba(107,114,128,0.1)", borderBottom: "1px solid #1a2840" }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#6b7280" }} />
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>
            Stream Ended — visible for 1h
          </span>
        </div>
      )}

      <div className="p-4">
        <div className="flex gap-3">
          {/* Image */}
          <div className="relative flex-shrink-0">
            <div className="w-[52px] h-[52px] rounded-xl overflow-hidden" style={{ border: "1px solid #1a2840" }}>
              {coin.image ? (
                <img src={coin.image} alt={coin.symbol} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl font-bold font-mono" style={{ background: "#1a2840", color: "#60a5fa" }}>
                  {coin.symbol?.[0] ?? "?"}
                </div>
              )}
            </div>
            {isLivestream && !streamEnded && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center animate-pulse" style={{ background: "#ef4444", border: "2px solid #0f1520" }}>
                <Radio className="w-2 h-2 text-white" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-bold text-[15px] leading-tight truncate max-w-[160px]" style={{ color: streamEnded ? "#6b7280" : "#f1f5f9" }}>
                    {coin.name}
                  </h3>
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold flex-shrink-0"
                    style={{ background: `${accentColor}15`, color: accentColor, border: `1px solid ${accentColor}30` }}
                  >
                    {streamEnded ? "○ ENDED" : isLivestream ? "● LIVE" : "◎ DISCORD"}
                  </span>
                  <PlatformBadge platform={(coin as Coin & { platform?: string }).platform} />
                </div>
                <div className="text-[11px] font-mono mt-0.5 font-semibold" style={{ color: "#60a5fa" }}>
                  ${coin.symbol}
                </div>
              </div>

              {/* Market cap */}
              <div className="text-right flex-shrink-0">
                <div className="font-mono text-base font-bold" style={{ color: mcColor(mc) }}>
                  {formatMarketCap(mc)}
                </div>
                <div className="text-[10px] font-mono mt-0.5 flex items-center gap-0.5 justify-end" style={{ color: "#475569" }}>
                  <Clock className="w-2 h-2" />
                  {formatAge(coin.ageMinutes)}
                </div>
              </div>
            </div>

            {/* Row 2: creator + time + replies */}
            <div className="flex items-center gap-2.5 mt-2 flex-wrap">
              {creator && (
                <div className="flex items-center gap-1">
                  <button
                    className="font-mono text-[10px] transition-colors flex items-center gap-0.5"
                    style={{ color: "#475569" }}
                    onClick={(e) => { e.stopPropagation(); window.open(`https://pump.fun/profile/${creator}`, "_blank"); }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#60a5fa"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#475569"; }}
                  >
                    <User className="w-2.5 h-2.5" />
                    {devProfile?.username ?? devProfile?.name ?? shortWallet(creator)}
                  </button>
                  <button
                    className="transition-colors"
                    style={{ color: "#334155" }}
                    onClick={copyWallet}
                    title="Copy wallet address"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#3b82f6"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#334155"; }}
                  >
                    {copiedWallet ? <CheckCheck className="w-2.5 h-2.5" style={{ color: "#3b82f6" }} /> : <Copy className="w-2.5 h-2.5" />}
                  </button>
                </div>
              )}
              {createdTime && (
                <span className="font-mono text-[10px]" style={{ color: "#475569" }}>{createdTime}</span>
              )}
              {replyCount > 0 && (
                <span className="font-mono text-[10px] flex items-center gap-0.5" style={{ color: "#475569" }}>
                  <MessageSquare className="w-2.5 h-2.5" />
                  {replyCount}
                </span>
              )}
            </div>

            {/* ── Dev profile summary ───────────────────────────────────── */}
            <div className="mt-2">
              {loadingDev ? (
                <div className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "#475569" }}>
                  <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: "#334155" }} />
                  loading dev…
                </div>
              ) : devProfile ? (
                <div>
                  {/* Quick stats row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Avatar + name */}
                    {devProfile.avatar && (
                      <img src={devProfile.avatar} alt="dev" className="w-5 h-5 rounded-full flex-shrink-0" style={{ border: "1px solid #1a2840" }} />
                    )}
                    <RiskBadge count={devProfile.coinsCreated} />
                    <span className="flex items-center gap-1 font-mono text-[10px]" style={{ color: "#64748b" }}>
                      <Wallet className="w-2.5 h-2.5" style={{ color: "#3b82f6" }} />
                      <span style={devProfile.solBalance < 0.1 ? { color: "#ef4444" } : {}}>
                        {devProfile.solBalance.toFixed(3)} SOL
                      </span>
                    </span>
                    {devProfile.twitter && (
                      <a
                        href={`https://twitter.com/${devProfile.twitter.replace("@", "")}`}
                        target="_blank" rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: "#60a5fa" }}
                        title={`Twitter: ${devProfile.twitter}`}
                      >
                        <X className="w-3 h-3" />
                      </a>
                    )}
                    {devProfile.followers != null && devProfile.followers > 0 && (
                      <span className="flex items-center gap-1 font-mono text-[10px]" style={{ color: "#64748b" }}>
                        <Users className="w-2.5 h-2.5" />
                        {devProfile.followers.toLocaleString()}
                      </span>
                    )}
                    {/* Risk indicator */}
                    {riskLevel === "high" && (
                      <span className="flex items-center gap-0.5 font-mono text-[9px] font-bold" style={{ color: "#ef4444" }}>
                        <AlertTriangle className="w-2.5 h-2.5" /> Serial launcher
                      </span>
                    )}
                    {/* Toggle detail */}
                    {devProfile.recentCoins && devProfile.recentCoins.length > 0 && (
                      <button
                        className="ml-auto font-mono text-[10px] flex items-center gap-0.5 transition-colors"
                        style={{ color: showDevDetail ? "#60a5fa" : "#475569" }}
                        onClick={(e) => { e.stopPropagation(); setShowDevDetail((v) => !v); }}
                      >
                        {showDevDetail ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {showDevDetail ? "Hide" : "Dev history"}
                      </button>
                    )}
                  </div>

                  {/* Bio */}
                  {showDevDetail && devProfile.bio && (
                    <p className="mt-1.5 font-mono text-[10px] leading-relaxed" style={{ color: "#64748b" }}>
                      {devProfile.bio.slice(0, 120)}
                    </p>
                  )}

                  {/* Full dev coin history */}
                  {showDevDetail && devProfile.recentCoins && devProfile.recentCoins.length > 0 && (
                    <div className="mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid #1a2840", background: "#080c14" }}>
                      <div className="px-3 py-1.5 flex items-center justify-between" style={{ borderBottom: "1px solid #1a2840" }}>
                        <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: "#475569" }}>
                          Dev's coins ({devProfile.coinsCreated} total)
                        </span>
                        <span className="font-mono text-[9px]" style={{ color: "#334155" }}>most recent first</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {devProfile.recentCoins.slice(0, 20).map((rc, i) => (
                          <a
                            key={rc.mint || i}
                            href={`https://pump.fun/coin/${rc.mint}`}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 px-3 py-2 transition-colors"
                            style={{ borderBottom: "1px solid #1a2840", color: "inherit", textDecoration: "none" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.03)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {rc.image ? (
                              <img src={rc.image} alt={rc.symbol} className="w-5 h-5 rounded flex-shrink-0 object-cover" />
                            ) : (
                              <div className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[9px] font-bold" style={{ background: "#1a2840", color: "#60a5fa" }}>
                                {rc.symbol?.[0] ?? "?"}
                              </div>
                            )}
                            <span className="font-mono text-[11px] truncate flex-1" style={{ color: "#94a3b8" }}>{rc.name}</span>
                            <span className="font-mono text-[10px] flex-shrink-0" style={{ color: "#60a5fa" }}>${rc.symbol}</span>
                            <span className="font-mono text-[10px] flex-shrink-0 ml-2" style={{ color: rc.marketCap > 0 ? "#94a3b8" : "#334155" }}>
                              {fmtMc(rc.marketCap)}
                            </span>
                            {rc.createdAt && (
                              <span className="font-mono text-[9px] flex-shrink-0 ml-1" style={{ color: "#334155" }}>
                                {fmtAge(rc.createdAt)}
                              </span>
                            )}
                          </a>
                        ))}
                        {devProfile.coinsCreated > 20 && (
                          <div className="px-3 py-2 text-center">
                            <span className="font-mono text-[9px]" style={{ color: "#334155" }}>
                              + {devProfile.coinsCreated - 20} more coins not shown
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3 items-center">
          <button
            className="text-[11px] h-7 px-3 rounded-lg font-mono flex items-center gap-1 transition-all"
            style={{ color: "#64748b", border: "1px solid #1a2840", background: "transparent" }}
            onMouseEnter={(e) => { Object.assign((e.currentTarget as HTMLButtonElement).style, { color: "#94a3b8", background: "rgba(255,255,255,0.04)" }); }}
            onMouseLeave={(e) => { Object.assign((e.currentTarget as HTMLButtonElement).style, { color: "#64748b", background: "transparent" }); }}
            onClick={(e) => { e.stopPropagation(); window.open(coin.pumpUrl, "_blank"); }}
          >
            <ExternalLink className="w-3 h-3" />
            {(coin as Coin & { platform?: string }).platform === "flap.sh"
              ? "Flap.sh"
              : (coin as Coin & { platform?: string }).platform === "four.meme"
                ? "Four.meme"
                : "Pump.fun"}
          </button>

          {coin.hasDiscord && coin.discordUrl && (
            <button
              className="text-[11px] h-7 px-3 rounded-lg font-mono flex items-center gap-1 transition-all"
              style={{ background: "rgba(129,140,248,0.1)", color: "#818cf8", border: "1px solid rgba(129,140,248,0.25)" }}
              onClick={(e) => { e.stopPropagation(); window.open(coin.discordUrl, "_blank"); }}
            >
              <Disc className="w-3 h-3" />
              Discord
            </button>
          )}

          <button
            className="ml-auto text-[11px] h-7 px-3 rounded-lg font-mono flex items-center gap-1 transition-all active:scale-95"
            style={{ background: "#2563eb", color: "#ffffff" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1d4ed8"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#2563eb"; }}
            onClick={(e) => { e.stopPropagation(); onOpenChat(coin); }}
          >
            <MessageSquare className="w-3 h-3" />
            Chat
            {replyCount > 0 && (
              <span className="px-1 rounded text-[9px]" style={{ background: "rgba(255,255,255,0.2)" }}>{replyCount}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
