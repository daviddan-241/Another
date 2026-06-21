import { useEffect, useState } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { Loading } from '@geist-ui/core';
import { atom, useAtom } from 'jotai';

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export type SolanaToken = {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  amount: string;
  amountRaw: string;
  usdPrice: number | null;
  usdValue: number | null;
  logo: string | null;
};

export type SolanaPortfolio = {
  solBalance: number;
  solUsdValue: number | null;
  tokens: SolanaToken[];
};

export const solanaPortfolioAtom = atom<SolanaPortfolio | null>(null);
export const solanaSelectedTokensAtom = atom<Record<string, boolean>>({});

export const SolanaGetTokens = () => {
  const { caipAddress, isConnected } = useAppKitAccount();
  const [portfolio, setPortfolio] = useAtom(solanaPortfolioAtom);
  const [selected, setSelected] = useAtom(solanaSelectedTokensAtom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const solanaAddress = caipAddress?.startsWith('solana:')
    ? caipAddress.split(':')[2]
    : null;

  useEffect(() => {
    if (!solanaAddress) {
      setPortfolio(null);
      setSelected({});
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/solana-tokens/${solanaAddress}`);
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed');
        if (active) {
          setPortfolio(data);
          const sel: Record<string, boolean> = { __SOL__: true };
          for (const t of data.tokens) sel[t.mint] = true;
          setSelected(sel);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [solanaAddress, setPortfolio, setSelected]);

  if (!isConnected || !solanaAddress) {
    return (
      <div style={{ color: '#94a3b8', fontSize: 14, padding: '12px 0' }}>
        Connect a Solana wallet to view your tokens.
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: '20px 0' }}><Loading>Loading Solana tokens...</Loading></div>;
  }

  if (error) {
    return <div style={{ color: '#ef4444', fontSize: 14, padding: '8px 0' }}>{error}</div>;
  }

  if (!portfolio) return null;

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
        Solana Tokens
        <span style={{ fontSize: 12, color: '#6366f1', marginLeft: 8, background: '#eef2ff', borderRadius: 6, padding: '2px 8px' }}>
          {Object.values(selected).filter(Boolean).length} selected
        </span>
      </div>

      {/* SOL native */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
        <input type="checkbox" checked={selected.__SOL__ ?? true} onChange={() => setSelected((s) => ({ ...s, __SOL__: !s.__SOL__ }))}
          style={{ width: 18, height: 18, accentColor: '#6366f1', cursor: 'pointer' }} />
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #9945ff, #14f195)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>S</div>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600, color: '#1e293b' }}>SOL</span>
          <span style={{ color: '#64748b', fontSize: 13, marginLeft: 8 }}>{portfolio.solBalance.toFixed(4)}</span>
        </div>
        <span style={{ color: '#6366f1', fontSize: 13 }}>
          {portfolio.solUsdValue != null ? usdFormatter.format(portfolio.solUsdValue) : 'Native'}
        </span>
      </div>

      {portfolio.tokens.length === 0 && (
        <div style={{ color: '#64748b', fontSize: 14, padding: '12px 0' }}>No SPL tokens with value found.</div>
      )}

      {portfolio.tokens.map((token) => (
        <div key={token.mint} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
          <input type="checkbox" checked={selected[token.mint] ?? true} onChange={() => setSelected((s) => ({ ...s, [token.mint]: !s[token.mint] }))}
            style={{ width: 18, height: 18, accentColor: '#6366f1', cursor: 'pointer' }} />
          {token.logo ? (
            <img src={token.logo} alt={token.symbol} style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {token.symbol.slice(0, 2)}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600, color: '#1e293b' }}>{token.symbol}</span>
            <span style={{ color: '#64748b', fontSize: 13, marginLeft: 8 }}>{parseFloat(token.amount).toLocaleString()}</span>
          </div>
          <span style={{ color: '#6366f1', fontSize: 13 }}>
            {token.usdValue != null ? usdFormatter.format(token.usdValue) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
};
