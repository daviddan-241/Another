import { useState, useCallback } from "react";
import { RefreshCw, Bell, CheckCircle, Video, MessageCircle, TrendingUp, Zap, Microscope } from "lucide-react";
import { CoinCard } from "@/components/CoinCard";
import { ChatPanel } from "@/components/ChatPanel";
import {
  useLiveCoins,
  useDiscordCoins,
  useTrendingCoins,
  useMicroCoins,
  useTelegramTest,
} from "@/hooks/usePumpFun";
import type { PumpCoin } from "@/hooks/usePumpFun";

type Tab = "live" | "discord" | "micro" | "trending";

const TABS: {
  id: Tab;
  icon: React.ReactNode;
  label: string;
  accentClass: string;
  dotColor: string;
}[] = [
  {
    id: "live",
    icon: <Video size={13} />,
    label: "Live",
    accentClass: "border-red-500 text-red-400",
    dotColor: "bg-red-500",
  },
  {
    id: "discord",
    icon: <MessageCircle size={13} />,
    label: "Discord",
    accentClass: "border-indigo-500 text-indigo-400",
    dotColor: "bg-indigo-500",
  },
  {
    id: "micro",
    icon: <Microscope size={13} />,
    label: "Micro <$5K",
    accentClass: "border-amber-400 text-amber-400",
    dotColor: "bg-amber-400",
  },
  {
    id: "trending",
    icon: <TrendingUp size={13} />,
    label: "Trending",
    accentClass: "border-[#FFD700] text-[#FFD700]",
    dotColor: "bg-[#FFD700]",
  },
];

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[#1a1a1a] bg-[#0d0d0d] p-4 animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-[#111]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[#111] rounded w-32" />
          <div className="h-3 bg-[#111] rounded w-20" />
        </div>
        <div className="space-y-1">
          <div className="h-5 bg-[#111] rounded w-16" />
          <div className="h-3 bg-[#111] rounded w-12" />
        </div>
      </div>
      <div className="h-3 bg-[#111] rounded w-full mb-1.5" />
      <div className="h-3 bg-[#111] rounded w-3/4 mb-3" />
      <div className="flex gap-2">
        <div className="h-8 bg-[#111] rounded-xl w-24" />
        <div className="h-8 bg-[#111] rounded-xl w-24" />
      </div>
    </div>
  );
}

function EmptyState({ mode }: { mode: Tab }) {
  const info: Record<Tab, { icon: React.ReactNode; title: string; sub: string }> = {
    live: {
      icon: <Video size={30} className="text-[#1a1a1a]" />,
      title: "No Live Coins Right Now",
      sub: "No coins currently livestreaming AND under 1 hour old. Auto-scanning every 15s.",
    },
    discord: {
      icon: <MessageCircle size={30} className="text-[#1a1a1a]" />,
      title: "No Discord Coins",
      sub: "No coins launched in the last 6 hours with a Discord server linked.",
    },
    micro: {
      icon: <Microscope size={30} className="text-[#1a1a1a]" />,
      title: "No Sub-$5K Coins",
      sub: "Scanning pump.fun for fresh launches under $5,000 market cap. Auto-refreshes every 12s.",
    },
    trending: {
      icon: <TrendingUp size={30} className="text-[#1a1a1a]" />,
      title: "Loading Trending",
      sub: "Fetching top coins by market cap from pump.fun…",
    },
  };
  const { icon, title, sub } = info[mode];
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#0d0d0d] border border-[#1a1a1a] flex items-center justify-center mb-4">
        {icon}
      </div>
      <p className="text-white font-bold text-lg mb-2">{title}</p>
      <p className="text-[#555] text-sm max-w-xs leading-relaxed">{sub}</p>
    </div>
  );
}

export default function Scanner() {
  const [tab, setTab] = useState<Tab>("micro");
  const [openChat, setOpenChat] = useState<PumpCoin | null>(null);
  const [sent, setSent] = useState(false);

  const liveQ     = useLiveCoins();
  const discordQ  = useDiscordCoins();
  const microQ    = useMicroCoins();
  const trendingQ = useTrendingCoins();
  const telegramTest = useTelegramTest();

  const dataMap: Record<Tab, PumpCoin[]> = {
    live:     liveQ.data     ?? [],
    discord:  discordQ.data  ?? [],
    micro:    microQ.data    ?? [],
    trending: trendingQ.data ?? [],
  };

  const queryMap = { live: liveQ, discord: discordQ, micro: microQ, trending: trendingQ };
  const activeQ     = queryMap[tab];
  const activeCoins = dataMap[tab];

  const handleRefresh = useCallback(() => {
    liveQ.refetch(); discordQ.refetch(); microQ.refetch(); trendingQ.refetch();
  }, [liveQ, discordQ, microQ, trendingQ]);

  async function handleTelegramTest() {
    await telegramTest.mutateAsync(undefined);
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  }

  function handleOpenChat(coin: PumpCoin) {
    setOpenChat((prev) => (prev?.mint === coin.mint ? null : coin));
  }

  const tabObj = TABS.find((t) => t.id === tab)!;

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      {/* ── Top bar ── */}
      <header className="shrink-0 border-b border-[#111] bg-[#050505]/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse shadow-[0_0_8px_#00E676]" />
            <span className="text-white font-black text-lg tracking-tight">
              PUMP<span className="text-[#00E676]">SCAN</span>
            </span>
            <span className="hidden sm:inline text-[#333] text-[11px] font-mono bg-[#0d0d0d] border border-[#1a1a1a] px-2 py-0.5 rounded-lg">
              LIVE
            </span>
          </div>

          {/* Stat pills */}
          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/15">
              {dataMap.live.length} LIVE
            </span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">
              {dataMap.discord.length} DISCORD
            </span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-400/10 text-amber-400 border border-amber-400/15">
              {dataMap.micro.length} MICRO
            </span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/15">
              {dataMap.trending.length} TRENDING
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] text-[#555] hover:text-white hover:border-[#333] transition-colors text-xs font-semibold"
            >
              <RefreshCw size={12} className={activeQ.isFetching ? "animate-spin text-[#00E676]" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleTelegramTest}
              disabled={telegramTest.isPending}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-bold transition-all ${
                sent
                  ? "border-[#00E676]/30 bg-[#00E676]/10 text-[#00E676]"
                  : "border-[#1a1a1a] bg-[#0d0d0d] text-[#555] hover:border-[#FFD700]/30 hover:text-[#FFD700]"
              }`}
            >
              {sent ? <CheckCircle size={12} /> : <Bell size={12} />}
              <span className="hidden sm:inline">{sent ? "Sent!" : "Test Alert"}</span>
            </button>
          </div>
        </div>

        {/* Tab bar — scrollable on mobile */}
        <div className="max-w-screen-2xl mx-auto px-2 sm:px-6 flex border-t border-[#0d0d0d] overflow-x-auto scrollbar-none">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 sm:px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap shrink-0 min-h-[44px] ${
                  active ? `${t.accentClass} bg-white/[0.02]` : "border-transparent text-[#444]"
                }`}
              >
                {t.icon}
                {t.label}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                    active ? "bg-white/10" : "bg-[#0d0d0d] text-[#333]"
                  }`}
                >
                  {dataMap[t.id].length}
                </span>
                {(t.id === "live" || t.id === "micro") && queryMap[t.id].isFetching && (
                  <span className={`w-1.5 h-1.5 rounded-full ${t.dotColor} animate-pulse`} />
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Micro cap banner ── */}
      {tab === "micro" && (
        <div className="border-b border-amber-400/10 bg-amber-400/5 px-4 sm:px-6 py-2.5">
          <div className="max-w-screen-2xl mx-auto flex items-center gap-3">
            <Microscope size={14} className="text-amber-400 shrink-0" />
            <p className="text-amber-300/80 text-xs">
              <span className="font-bold text-amber-400">Micro cap scanner</span> — showing fresh pump.fun launches
              under <span className="font-bold text-amber-400">$5,000 market cap</span>. These are the earliest possible
              entry points. High risk — DYOR. All saved to your database.
            </p>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 flex min-h-0">
        {/* Coin grid */}
        <div className={`flex-1 overflow-y-auto ${openChat ? "hidden lg:block" : ""}`}>
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5">
            {activeQ.isError ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Zap size={36} className="text-[#1a1a1a] mb-3" />
                <p className="text-white font-bold">Could not reach pump.fun</p>
                <p className="text-[#555] text-sm mt-1">Check your connection · Auto-retries</p>
                <button
                  onClick={handleRefresh}
                  className="mt-4 px-4 py-2 rounded-xl bg-[#0d0d0d] border border-[#1a1a1a] text-[#555] hover:text-white text-sm font-semibold transition-colors"
                >
                  Retry now
                </button>
              </div>
            ) : activeQ.isLoading ? (
              <div
                className={`grid gap-3 ${
                  openChat
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                }`}
              >
                {Array.from({ length: 9 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : activeCoins.length === 0 ? (
              <EmptyState mode={tab} />
            ) : (
              <>
                {/* Coin count bar */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${tabObj.dotColor} ${tab === "live" || tab === "micro" ? "animate-pulse" : ""}`} />
                    <span className="text-[#555] text-xs">
                      <span className="text-white font-bold">{activeCoins.length}</span>{" "}
                      {tab === "live" && "coins livestreaming now"}
                      {tab === "discord" && "coins with Discord servers"}
                      {tab === "micro" && "micro cap launches under $5K"}
                      {tab === "trending" && "trending by market cap"}
                    </span>
                  </div>
                  {activeQ.isFetching && (
                    <span className="text-[#333] text-[10px] flex items-center gap-1">
                      <RefreshCw size={9} className="animate-spin" /> updating…
                    </span>
                  )}
                </div>
                <div
                  className={`grid gap-3 ${
                    openChat
                      ? "grid-cols-1 sm:grid-cols-2"
                      : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                  }`}
                >
                  {activeCoins.map((coin) => (
                    <CoinCard
                      key={coin.mint}
                      coin={coin}
                      mode={tab === "micro" ? "micro" : tab}
                      onOpenChat={handleOpenChat}
                      chatOpen={openChat?.mint === coin.mint}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chat panel */}
        {openChat && (
          <div className="w-full lg:w-[360px] xl:w-[400px] shrink-0 flex flex-col border-l border-[#111] bg-[#0a0a0a] overflow-hidden">
            <ChatPanel coin={openChat} onClose={() => setOpenChat(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
