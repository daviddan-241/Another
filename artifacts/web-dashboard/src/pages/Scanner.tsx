import { useState } from "react";
import { RefreshCw, Send, CheckCircle, Video, MessageCircle, TrendingUp, Zap } from "lucide-react";
import { CoinCard } from "@/components/CoinCard";
import { useLiveCoins, useDiscordCoins, useTrendingCoins, useTelegramTest } from "@/hooks/usePumpFun";
import type { PumpCoin } from "@/hooks/usePumpFun";

type Tab = "live" | "discord" | "trending";

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xl font-black ${color}`}>{value}</span>
      <span className="text-[#6a9f6a] text-xs font-semibold uppercase tracking-wider">{label}</span>
    </div>
  );
}

function TabBtn({
  id, active, icon, label, count, color,
  onClick,
}: {
  id: Tab; active: boolean; icon: React.ReactNode; label: string; count?: number;
  color: string; onClick: () => void;
}) {
  const borderColor = active
    ? id === "live" ? "border-red-500" : id === "discord" ? "border-indigo-500" : "border-yellow-500"
    : "border-transparent";
  const textColor = active
    ? id === "live" ? "text-red-400" : id === "discord" ? "text-indigo-400" : "text-yellow-400"
    : "text-[#6a9f6a] hover:text-[#e8f5e9]";

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${borderColor} ${textColor}`}
    >
      {icon}
      {label}
      {count != null && (
        <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${active ? `${color} text-[#0a0f0a]` : "bg-[#1a2a1a] text-[#6a9f6a]"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function CoinGrid({ coins, mode, isLoading, isError }: { coins: PumpCoin[]; mode: Tab; isLoading: boolean; isError: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#1e2e1e] bg-[#111811] p-4 animate-pulse h-36" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Zap size={36} className="text-[#2a4a2a] mb-3" />
        <p className="text-[#e8f5e9] font-bold">Could not reach pump.fun</p>
        <p className="text-[#6a9f6a] text-sm mt-1">Check your connection and try again</p>
      </div>
    );
  }
  if (coins.length === 0) {
    const msgs: Record<Tab, { title: string; sub: string }> = {
      live: { title: "No Live Coins", sub: "No coins are currently livestreaming AND under 1 hour old. Scanning every 15s." },
      discord: { title: "No Discord Coins", sub: "No coins launched in the last 6 hours have a Discord linked. Scanning every 20s." },
      trending: { title: "No Trending Coins", sub: "Couldn't load trending data. Will retry shortly." },
    };
    const m = msgs[mode];
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-[#1a2a1a] flex items-center justify-center mb-4">
          {mode === "live" ? <Video size={28} className="text-[#2a4a2a]" /> :
           mode === "discord" ? <MessageCircle size={28} className="text-[#2a4a2a]" /> :
           <TrendingUp size={28} className="text-[#2a4a2a]" />}
        </div>
        <p className="text-[#e8f5e9] font-bold text-lg">{m.title}</p>
        <p className="text-[#6a9f6a] text-sm mt-2 max-w-xs">{m.sub}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {coins.map((coin) => (
        <CoinCard key={coin.mint} coin={coin} mode={mode} />
      ))}
    </div>
  );
}

export default function Scanner() {
  const [tab, setTab] = useState<Tab>("live");
  const [sent, setSent] = useState(false);

  const liveQuery = useLiveCoins();
  const discordQuery = useDiscordCoins();
  const trendingQuery = useTrendingCoins();
  const telegramTest = useTelegramTest();

  const liveCoins = liveQuery.data ?? [];
  const discordCoins = discordQuery.data ?? [];
  const trendingCoins = trendingQuery.data ?? [];

  const isRefreshing =
    (tab === "live" && liveQuery.isFetching) ||
    (tab === "discord" && discordQuery.isFetching) ||
    (tab === "trending" && trendingQuery.isFetching);

  function handleRefresh() {
    liveQuery.refetch();
    discordQuery.refetch();
    trendingQuery.refetch();
  }

  async function handleTelegramTest() {
    await telegramTest.mutateAsync(undefined);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  }

  const activeQuery = tab === "live" ? liveQuery : tab === "discord" ? discordQuery : trendingQuery;
  const activeCoins = tab === "live" ? liveCoins : tab === "discord" ? discordCoins : trendingCoins;

  return (
    <div className="min-h-screen bg-[#0a0f0a]">
      {/* Header */}
      <div className="border-b border-[#1e2e1e] bg-[#0a0f0a] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[#00e676] animate-pulse" />
              <h1 className="text-[#00e676] font-black text-xl tracking-wider uppercase">
                Pump Scanner
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-5">
                <StatBadge label="Live" value={liveCoins.length} color="text-red-400" />
                <StatBadge label="Discord" value={discordCoins.length} color="text-indigo-400" />
                <StatBadge label="Trending" value={trendingCoins.length} color="text-yellow-400" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  className="p-2 rounded-lg border border-[#1e2e1e] text-[#6a9f6a] hover:text-[#00e676] hover:border-[#2a4a2a] transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={handleTelegramTest}
                  disabled={telegramTest.isPending}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                    sent
                      ? "border-[#00e676]/40 bg-[#00e676]/10 text-[#00e676]"
                      : "border-[#1e2e1e] text-[#6a9f6a] hover:border-[#2a4a2a] hover:text-[#e8f5e9]"
                  }`}
                  title="Test Telegram"
                >
                  {sent ? <CheckCircle size={13} /> : <Send size={13} />}
                  <span className="hidden sm:inline">{sent ? "Sent!" : "Test TG"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Mobile stats */}
          <div className="flex items-center gap-4 mt-3 sm:hidden">
            <StatBadge label="Live" value={liveCoins.length} color="text-red-400" />
            <StatBadge label="Discord" value={discordCoins.length} color="text-indigo-400" />
            <StatBadge label="Trending" value={trendingCoins.length} color="text-yellow-400" />
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-1">
          <TabBtn id="live" active={tab === "live"} color="bg-red-400"
            icon={<Video size={14} />} label="Live Coins" count={liveCoins.length}
            onClick={() => setTab("live")} />
          <TabBtn id="discord" active={tab === "discord"} color="bg-indigo-400"
            icon={<MessageCircle size={14} />} label="Has Discord" count={discordCoins.length}
            onClick={() => setTab("discord")} />
          <TabBtn id="trending" active={tab === "trending"} color="bg-yellow-400"
            icon={<TrendingUp size={14} />} label="Trending" count={trendingCoins.length}
            onClick={() => setTab("trending")} />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-5">
        <CoinGrid
          coins={activeCoins}
          mode={tab}
          isLoading={activeQuery.isLoading}
          isError={activeQuery.isError}
        />
      </div>
    </div>
  );
}
