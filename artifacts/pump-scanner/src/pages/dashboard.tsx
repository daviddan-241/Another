import React, { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { ScannerStatsBar } from "@/components/ScannerStats";
import { CoinCard } from "@/components/CoinCard";
import { EmptyState, LoadingSkeleton } from "@/components/EmptyState";
import { useGetCoins, getGetCoinsQueryKey } from "@workspace/api-client-react";
import { useWebSocket, onStreamEnded } from "@/hooks/use-websocket";
import { useReplyWatcher } from "@/hooks/use-reply-watcher";
import { useSettings } from "@/contexts/settings-context";
import { Radio, Disc, Bell, Signal, RotateCw } from "lucide-react";
import { SettingsButton } from "@/components/SettingsDrawer";
import { setChatData } from "@/lib/chat-store";
import type { Coin } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const BUILD_TAG = "build 2026-06-09-k";

export default function Dashboard() {
  const [, nav] = useLocation();
  const { isConnected } = useWebSocket();
  const { myProfile, maxDevCoins, notificationsEnabled, telegramChatId } = useSettings();

  const [activeTab, setActiveTab]       = useState<"livestream" | "discord">("discord");
  const [notifCount, setNotifCount]     = useState(0);
  const [endedStreams, setEndedStreams]  = useState<{ mint: string; name: string; symbol: string }[]>([]);
  const [restarting, setRestarting]     = useState(false);
  const [restartMsg, setRestartMsg]     = useState<string | null>(null);

  const handleRestart = useCallback(async () => {
    setRestarting(true); setRestartMsg(null);
    try {
      const r = await fetch(`${BASE}/api/scanner/restart`, { method: "POST" });
      const j = await r.json() as { running?: boolean; message?: string };
      setRestartMsg(j.running ? "✓ Scanner restarted" : (j.message ?? "Restarted"));
    } catch {
      setRestartMsg("Network error");
    } finally {
      setTimeout(() => { setRestartMsg(null); setRestarting(false); }, 2500);
    }
  }, []);

  useEffect(() => {
    return onStreamEnded((evt) => {
      setEndedStreams((prev) => {
        if (prev.some((e) => e.mint === evt.mint)) return prev;
        return [evt, ...prev].slice(0, 10);
      });
      setNotifCount((n) => n + 1);
    });
  }, []);

  const { data: livestreamData, isLoading: loadingLivestream } = useGetCoins(
    { type: "livestream" },
    { query: { refetchInterval: 8000, queryKey: getGetCoinsQueryKey({ type: "livestream" }) } }
  );
  const { data: discordData, isLoading: loadingDiscord } = useGetCoins(
    { type: "discord" },
    { query: { refetchInterval: 8000, queryKey: getGetCoinsQueryKey({ type: "discord" }) } }
  );

  const allCoins = [
    ...(livestreamData?.coins ?? []),
    ...(discordData?.coins ?? []),
  ] as (Coin & { creator?: string; coinsCreated?: number })[];

  const activeMints = allCoins.map((c) => c.mint);

  const handleNewReply = useCallback(() => { setNotifCount((n) => n + 1); }, []);

  useReplyWatcher({
    publicKey: myProfile?.publicKey ?? "",
    activeMints,
    enabled: (notificationsEnabled || !!telegramChatId) && !!myProfile?.publicKey,
    telegramChatId: telegramChatId || undefined,
    onNewReply: handleNewReply,
  });

  function filterCoin(coin: Coin & { coinsCreated?: number }): boolean {
    if (maxDevCoins >= 100) return true;
    const cc = coin.coinsCreated;
    if (cc === undefined) return true;
    return cc <= maxDevCoins;
  }

  const livestreamCoins = (livestreamData?.coins ?? []) as (Coin & { creator?: string; coinsCreated?: number })[];
  const discordCoins    = (discordData?.coins ?? [])    as (Coin & { creator?: string; coinsCreated?: number })[];

  const filteredLive    = livestreamCoins.filter(filterCoin);
  const filteredDiscord = discordCoins.filter(filterCoin);
  const hiddenCount = livestreamCoins.length + discordCoins.length - (filteredLive.length + filteredDiscord.length);

  const handleOpenChat = useCallback((coin: Coin) => {
    const creator = (coin as Coin & { creator?: string }).creator ?? "";
    setChatData(coin.mint, { symbol: coin.symbol, name: coin.name, creator });
    nav(`/chat/${coin.mint}`);
  }, [nav]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080c14" }}>
      <ScannerStatsBar settingsSlot={<SettingsButton />} isConnected={isConnected} />

      <main className="flex-1 max-w-2xl w-full mx-auto px-3 py-5 md:px-5 md:py-7">

        {/* Title row */}
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight flex items-center gap-2" style={{ color: "#f1f5f9" }}>
              PumpRadar
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#3b82f6" }} />
            </h1>
            <p className="text-[10px] font-mono mt-0.5 tracking-widest uppercase" style={{ color: "#475569" }}>
              Pump.fun · Four.meme · Raydium · Birdeye · +chains · &lt;$5K MC
            </p>
            <p className="text-[9px] font-mono mt-0.5" style={{ color: "#1e293b" }}>{BUILD_TAG}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleRestart()}
              disabled={restarting}
              title="Restart scanner — wipes cached coins and rescans"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold disabled:opacity-50"
              style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}
            >
              <RotateCw className={`w-3 h-3 ${restarting ? "animate-spin" : ""}`} />
              {restartMsg ? restartMsg : restarting ? "Restarting…" : "Restart"}
            </button>
            {notifCount > 0 && (
              <button
                onClick={() => setNotifCount(0)}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono font-bold animate-pulse"
                style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}
              >
                <Bell className="w-3 h-3" />
                {notifCount}
              </button>
            )}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold"
              style={isConnected
                ? { background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa" }
                : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#475569" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: isConnected ? "#3b82f6" : "#334155" }} />
              {isConnected ? "LIVE" : "POLLING"}
            </div>
          </div>
        </div>

        {/* Stream ended alerts */}
        {endedStreams.length > 0 && (
          <div className="mb-3 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(107,114,128,0.3)", background: "rgba(107,114,128,0.06)" }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(107,114,128,0.2)" }}>
              <div className="flex items-center gap-2">
                <Signal className="w-3 h-3" style={{ color: "#6b7280" }} />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>
                  Streams ended ({endedStreams.length})
                </span>
              </div>
              <button
                onClick={() => setEndedStreams([])}
                className="font-mono text-[9px]"
                style={{ color: "#475569" }}
              >
                clear
              </button>
            </div>
            <div className="px-3 py-2 flex flex-wrap gap-2">
              {endedStreams.map((s) => (
                <a
                  key={s.mint}
                  href={`https://pump.fun/coin/${s.mint}`}
                  target="_blank" rel="noreferrer"
                  className="font-mono text-[10px] px-2 py-1 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1a2840", color: "#6b7280", textDecoration: "none" }}
                >
                  📴 ${s.symbol}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Filter notice */}
        {hiddenCount > 0 && (
          <div className="mb-3 px-3 py-2 rounded-xl font-mono text-[10px] flex items-center gap-2" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#fbbf24" }} />
            {hiddenCount} coin{hiddenCount !== 1 ? "s" : ""} hidden — dev launched {maxDevCoins}+ tokens
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 mb-5 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <TabButton
            active={activeTab === "livestream"}
            onClick={() => setActiveTab("livestream")}
            icon={<Radio className="w-3.5 h-3.5" />}
            label="Livestreams"
            count={filteredLive.length}
            color="red"
          />
          <TabButton
            active={activeTab === "discord"}
            onClick={() => setActiveTab("discord")}
            icon={<Disc className="w-3.5 h-3.5" />}
            label="Discord Coins"
            count={filteredDiscord.length}
            color="indigo"
          />
        </div>

        {/* Coin list */}
        {activeTab === "livestream" ? (
          <div className="space-y-3">
            {loadingLivestream ? (
              <LoadingSkeleton />
            ) : filteredLive.length === 0 ? (
              <EmptyState
                title={livestreamCoins.length > 0 ? "All filtered by dev filter" : "No active livestreams yet"}
                description={
                  livestreamCoins.length > 0
                    ? `${hiddenCount} coin${hiddenCount !== 1 ? "s" : ""} hidden — raise the filter in Settings.`
                    : "Scanner is watching for new coins with active livestreams. Check back soon."
                }
                icon="radio"
              />
            ) : (
              filteredLive.map((coin) => (
                <CoinCard key={coin.mint} coin={coin} onOpenChat={handleOpenChat} />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {loadingDiscord ? (
              <LoadingSkeleton />
            ) : filteredDiscord.length === 0 ? (
              <EmptyState
                title={discordCoins.length > 0 ? "All filtered by dev filter" : "No Discord coins yet"}
                description={
                  discordCoins.length > 0
                    ? "All coins hidden by your dev filter. Raise the limit in Settings."
                    : "Scanning pump.fun, flap.sh, four.meme & more for coins under $5K MC with a real Discord link."
                }
                icon="disc"
              />
            ) : (
              filteredDiscord.map((coin) => (
                <CoinCard key={coin.mint} coin={coin} onOpenChat={handleOpenChat} />
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function TabButton({
  active, onClick, icon, label, count, color,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  color: "red" | "indigo";
}) {
  const activeColor = color === "red" ? "#ef4444" : "#818cf8";

  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-mono text-[11px] font-bold transition-all duration-200"
      style={active
        ? { background: "rgba(255,255,255,0.07)", color: activeColor, border: `1px solid ${activeColor}30` }
        : { color: "#475569" }}
    >
      {icon}
      {label.toUpperCase()}
      <span
        className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
        style={active
          ? { background: `${activeColor}20`, color: activeColor }
          : { background: "rgba(255,255,255,0.05)", color: "#475569" }}
      >
        {count}
      </span>
    </button>
  );
}
