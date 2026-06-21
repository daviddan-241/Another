import React, { useState, useEffect, useCallback } from "react";
import { ExternalLink, RefreshCw, TrendingUp, Coins, Wallet, ShieldAlert } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import { getApiBase } from "@/lib/api";

interface CreatedCoin {
  mint: string;
  name: string;
  symbol: string;
  image: string;
  marketCap: number;
  createdAt: string;
  replyCount: number;
  isGated: boolean;
  pumpUrl: string;
}

interface Holding {
  mint: string;
  name: string;
  symbol: string;
  image: string;
  marketCap: number;
  balance: number;
  usdValue: number;
  pumpUrl: string;
}

interface SplToken {
  mint: string;
  name: string;
  symbol: string;
  amount: string;
  usdPrice: number | null;
  usdValue: number | null;
  logo: string | null;
}

interface Portfolio {
  wallet: string;
  solBalance: number;
  createdCoins: CreatedCoin[];
  holdings: Holding[];
}

interface SplPortfolio {
  success: boolean;
  wallet: string;
  solBalance: number;
  solUsdValue: number | null;
  tokens: SplToken[];
}

function fmt(v: number) {
  if (!v) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(6)}`;
}

function fmtTokenAmt(v: number | string) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function shortWallet(w: string) {
  if (!w || w.length < 12) return w;
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

type Tab = "created" | "holdings" | "spl";

export function PortfolioPanel() {
  const { myProfile } = useSettings();
  const publicKey = myProfile?.publicKey ?? "";
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [spl, setSpl] = useState<SplPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSpl, setLoadingSpl] = useState(false);
  const [tab, setTab] = useState<Tab>("created");

  const loadPortfolio = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/portfolio/${publicKey}`);
      const data = (await res.json()) as Portfolio;
      setPortfolio(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [publicKey]);

  const loadSpl = useCallback(async () => {
    if (!publicKey) return;
    setLoadingSpl(true);
    try {
      const res = await fetch(`${getApiBase()}/api/holdings/spl/${publicKey}`);
      const data = (await res.json()) as SplPortfolio;
      setSpl(data);
    } catch { /* ignore */ }
    finally { setLoadingSpl(false); }
  }, [publicKey]);

  useEffect(() => {
    if (publicKey) {
      loadPortfolio();
      loadSpl();
    }
  }, [publicKey, loadPortfolio, loadSpl]);

  if (!publicKey) return null;

  const isLoading = loading || loadingSpl;

  return (
    <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: "1px solid hsl(130 18% 13%)" }}>
      {/* Wallet bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: "hsl(130 22% 7%)", borderBottom: "1px solid hsl(130 18% 12%)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Wallet className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(43 96% 52%)" }} />
          <button
            className="font-mono text-xs truncate hover:text-primary transition-colors"
            style={{ color: "hsl(43 96% 52%)" }}
            onClick={() => window.open(`https://pump.fun/profile/${publicKey}`, "_blank")}
          >
            {shortWallet(publicKey)}
          </button>
          {portfolio && (
            <span className="font-mono text-xs text-muted-foreground/60 flex-shrink-0">
              {portfolio.solBalance.toFixed(3)} SOL
            </span>
          )}
          {spl?.solUsdValue != null && (
            <span className="font-mono text-[10px] text-muted-foreground/40 flex-shrink-0">
              ({fmt(spl.solUsdValue)})
            </span>
          )}
        </div>
        <button
          onClick={() => { loadPortfolio(); loadSpl(); }}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-shrink-0"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="flex"
        style={{ background: "hsl(130 22% 6%)", borderBottom: "1px solid hsl(130 18% 11%)" }}
      >
        {([
          { key: "created" as Tab, label: `Coins (${portfolio?.createdCoins.length ?? 0})`, icon: <Coins className="w-3 h-3" /> },
          { key: "holdings" as Tab, label: `Pump Holds (${portfolio?.holdings.length ?? 0})`, icon: <TrendingUp className="w-3 h-3" /> },
          { key: "spl" as Tab, label: `SPL (${spl?.tokens.length ?? 0})`, icon: <Wallet className="w-3 h-3" /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
          <button
            key={key}
            className="flex-1 flex items-center justify-center gap-1 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-all"
            style={{
              color: tab === key ? "hsl(43 96% 52%)" : "hsl(130 12% 40%)",
              borderBottom: tab === key ? "2px solid hsl(43 96% 52%)" : "2px solid transparent",
            }}
            onClick={() => setTab(key)}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-72 overflow-y-auto" style={{ background: "hsl(130 25% 5%)" }}>
        {loading && tab !== "spl" ? (
          <LoadingRows />
        ) : loadingSpl && tab === "spl" ? (
          <LoadingRows />
        ) : tab === "created" ? (
          <CreatedCoinsTab coins={portfolio?.createdCoins ?? []} />
        ) : tab === "holdings" ? (
          <HoldingsTab holdings={portfolio?.holdings ?? []} />
        ) : (
          <SplTab spl={spl} solBalance={portfolio?.solBalance ?? 0} />
        )}
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="p-4 space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: "hsl(130 18% 11%)" }} />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 rounded" style={{ background: "hsl(130 18% 11%)", width: "40%" }} />
            <div className="h-2.5 rounded" style={{ background: "hsl(130 18% 10%)", width: "25%" }} />
          </div>
          <div className="h-3 w-12 rounded" style={{ background: "hsl(130 18% 11%)" }} />
        </div>
      ))}
    </div>
  );
}

function CreatedCoinsTab({ coins }: { coins: CreatedCoin[] }) {
  if (coins.length === 0) {
    return (
      <div className="py-10 text-center">
        <Coins className="w-6 h-6 mx-auto mb-2 text-muted-foreground/20" />
        <p className="font-mono text-xs text-muted-foreground/40">No coins created yet</p>
      </div>
    );
  }
  return (
    <div className="divide-y" style={{ borderColor: "hsl(130 18% 10%)" }}>
      {coins.map((c) => (
        <div key={c.mint} className="flex items-center gap-3 px-4 py-3 group hover:bg-white/[0.02] transition-all">
          {c.image ? (
            <img src={c.image} alt={c.symbol} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" style={{ border: "1px solid hsl(43 96% 52% / 0.2)" }} />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "hsl(43 96% 52% / 0.1)", color: "hsl(43 96% 52%)" }}>
              {c.symbol[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs text-foreground truncate">{c.name}</span>
              {c.isGated && <ShieldAlert className="w-3 h-3 flex-shrink-0 text-orange-400" />}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground/50">${c.symbol} · {c.replyCount} replies</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-xs font-bold" style={{ color: "hsl(43 96% 52%)" }}>{fmt(c.marketCap)}</span>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-primary"
              onClick={() => window.open(c.pumpUrl, "_blank")}
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function HoldingsTab({ holdings }: { holdings: Holding[] }) {
  if (holdings.length === 0) {
    return (
      <div className="py-10 text-center">
        <TrendingUp className="w-6 h-6 mx-auto mb-2 text-muted-foreground/20" />
        <p className="font-mono text-xs text-muted-foreground/40">No pump.fun holdings</p>
      </div>
    );
  }
  return (
    <div className="divide-y" style={{ borderColor: "hsl(130 18% 10%)" }}>
      {holdings.map((h) => (
        <div key={h.mint} className="flex items-center gap-3 px-4 py-3 group hover:bg-white/[0.02] transition-all">
          {h.image ? (
            <img src={h.image} alt={h.symbol} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" style={{ border: "1px solid hsl(160 84% 39% / 0.2)" }} />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "hsl(160 84% 39% / 0.1)", color: "rgb(52,211,153)" }}>
              {h.symbol[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-xs text-foreground truncate">{h.name}</div>
            <div className="font-mono text-[10px] text-muted-foreground/50">${h.symbol} · {fmtTokenAmt(h.balance)} tokens</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <div className="font-mono text-xs font-bold" style={{ color: "rgb(52,211,153)" }}>{fmt(h.usdValue)}</div>
              <div className="font-mono text-[9px] text-muted-foreground/40">MC {fmt(h.marketCap)}</div>
            </div>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-primary"
              onClick={() => window.open(h.pumpUrl, "_blank")}
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SplTab({ spl, solBalance }: { spl: SplPortfolio | null; solBalance: number }) {
  const bal = spl?.solBalance ?? solBalance;
  const solUsd = spl?.solUsdValue;

  return (
    <div className="divide-y" style={{ borderColor: "hsl(130 18% 10%)" }}>
      {/* SOL row always first */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #9945ff, #14f195)", color: "#fff" }}
        >
          S
        </div>
        <div className="flex-1">
          <div className="font-bold text-xs text-foreground">SOL</div>
          <div className="font-mono text-[10px] text-muted-foreground/50">Solana Native</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xs font-bold text-foreground">{bal.toFixed(4)}</div>
          {solUsd != null && <div className="font-mono text-[10px]" style={{ color: "hsl(43 96% 52%)" }}>{fmt(solUsd)}</div>}
        </div>
      </div>

      {(spl?.tokens ?? []).length === 0 ? (
        <div className="py-8 text-center">
          <p className="font-mono text-xs text-muted-foreground/40">No SPL tokens found</p>
        </div>
      ) : (
        (spl?.tokens ?? []).map((t) => (
          <div key={t.mint} className="flex items-center gap-3 px-4 py-3 group hover:bg-white/[0.02] transition-all">
            {t.logo ? (
              <img src={t.logo} alt={t.symbol} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: "hsl(130 18% 12%)", color: "hsl(43 96% 52%)" }}>
                {t.symbol.slice(0, 2)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-xs text-foreground truncate">{t.symbol}</div>
              <div className="font-mono text-[10px] text-muted-foreground/50">{fmtTokenAmt(t.amount)} tokens</div>
            </div>
            <div className="text-right flex-shrink-0">
              {t.usdValue != null ? (
                <div className="font-mono text-xs font-bold" style={{ color: "hsl(43 96% 52%)" }}>{fmt(t.usdValue)}</div>
              ) : (
                <div className="font-mono text-[10px] text-muted-foreground/30">—</div>
              )}
              {t.usdPrice != null && (
                <div className="font-mono text-[9px] text-muted-foreground/40">{fmt(t.usdPrice)}/ea</div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
