import React, { useEffect, useState } from "react";
import { Zap, Activity, TrendingUp, TrendingDown } from "lucide-react";
import {
  useGetCoinStats,
  getGetCoinStatsQueryKey,
  useGetScannerStatus,
  getGetScannerStatusQueryKey,
} from "@workspace/api-client-react";

interface ScannerStatsBarProps {
  settingsSlot?: React.ReactNode;
  isConnected?: boolean;
}

function useSolPrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch24h() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true",
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return;
        const json = await res.json() as { solana?: { usd?: number; usd_24h_change?: number } };
        if (!cancelled && json.solana?.usd) {
          setPrice(json.solana.usd);
          setChange(json.solana.usd_24h_change ?? null);
        }
      } catch { /* ignore */ }
    }
    void fetch24h();
    const id = setInterval(() => void fetch24h(), 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { price, change };
}

export function ScannerStatsBar({ settingsSlot, isConnected }: ScannerStatsBarProps) {
  const { data: stats } = useGetCoinStats({
    query: { refetchInterval: 5000, queryKey: getGetCoinStatsQueryKey() },
  });
  const { data: status } = useGetScannerStatus({
    query: { refetchInterval: 5000, queryKey: getGetScannerStatusQueryKey() },
  });

  const { price: solPrice, change: solChange } = useSolPrice();
  const isRunning = status?.running;
  const up = (solChange ?? 0) >= 0;

  return (
    <header className="sticky top-0 z-20 shadow-sm" style={{ background: "#080c14", borderBottom: "1px solid #1a2840" }}>
      <div className="px-4 py-2.5 flex items-center justify-between gap-3">

        {/* Left: Logo + scanning + stats */}
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide flex-1 min-w-0">

          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#2563eb" }}>
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight hidden sm:block" style={{ color: "#f1f5f9" }}>
              PumpRadar
            </span>
          </div>

          <div className="w-px h-4 flex-shrink-0" style={{ background: "#1a2840" }} />

          {/* Scanning status */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isRunning ? "#3b82f6" : "#334155", boxShadow: isRunning ? "0 0 6px #3b82f6" : "none" }} />
            <span className="font-mono text-[10px] font-bold tracking-widest" style={{ color: isRunning ? "#60a5fa" : "#475569" }}>
              {isRunning ? "SCANNING" : "OFFLINE"}
            </span>
          </div>

          <div className="w-px h-4 flex-shrink-0" style={{ background: "#1a2840" }} />

          {/* Stats */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <Stat label="LIVE"    value={stats?.livestreamCoins ?? 0} blue />
            <Stat label="DISCORD" value={stats?.discordCoins    ?? 0} />
            <Stat label="&lt;$5K" value={stats?.under5kMc       ?? 0} blue />
            <Stat label="SCANNED" value={stats?.totalScanned    ?? 0} />
          </div>

          {/* WS indicator */}
          {isConnected !== undefined && (
            <>
              <div className="w-px h-4 flex-shrink-0" style={{ background: "#1a2840" }} />
              <div className="flex items-center gap-1 flex-shrink-0">
                <Activity className="w-3 h-3" style={{ color: isConnected ? "#3b82f6" : "#334155" }} />
                <span className="font-mono text-[10px] hidden sm:block" style={{ color: isConnected ? "#60a5fa" : "#475569" }}>
                  {isConnected ? "LIVE" : "POLL"}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Right: SOL price + settings */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {solPrice !== null && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #1a2840" }}>
              {up
                ? <TrendingUp className="w-3 h-3 flex-shrink-0" style={{ color: "#3b82f6" }} />
                : <TrendingDown className="w-3 h-3 flex-shrink-0" style={{ color: "#ef4444" }} />
              }
              <span className="font-mono text-[11px] font-bold" style={{ color: "#f1f5f9" }}>
                ${solPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
              {solChange !== null && (
                <span className="font-mono text-[9px] font-bold hidden sm:block" style={{ color: up ? "#60a5fa" : "#ef4444" }}>
                  {up ? "+" : ""}{solChange.toFixed(2)}%
                </span>
              )}
            </div>
          )}
          {settingsSlot}
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, blue }: { label: string; value: number; blue?: boolean }) {
  return (
    <div className="text-center flex-shrink-0">
      <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#475569" }}
        dangerouslySetInnerHTML={{ __html: label }} />
      <div className="font-mono text-sm font-bold leading-tight" style={{ color: blue ? "#60a5fa" : "#94a3b8" }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
