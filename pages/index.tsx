import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { useAppKitAccount } from '@reown/appkit/react';
import { GeistProvider, CssBaseline } from '@geist-ui/core';
import { GetTokens } from '../components/contract/GetTokens';
import { SendTokens } from '../components/contract/SendTokens';
import { SolanaGetTokens } from '../components/contract/SolanaGetTokens';
import { SolanaSendTokens } from '../components/contract/SolanaSendTokens';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'appkit-button': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { label?: string; balance?: 'show' | 'hide'; size?: string };
    }
  }
}

type TokenData = {
  address: string;
  name: string;
  symbol: string;
  chainId: string;
  priceUsd: number;
  priceChange24h: number;
  liquidityUsd: number;
  volume24h: number;
  fdv: number;
  marketCap: number;
  imageUrl: string | null;
  url: string;
  updatedAt: string;
};

const WOULD_TOKEN_ADDRESS = 'J1Wpmugrooj1yMyQKrdZ2vwRXG5rhfx3vTnYE39gpump';

const fmt = (v: number) => {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const fmtPrice = (v: number) => {
  if (!v) return 'Loading';
  return v < 0.01 ? `$${v.toFixed(6)}` : `$${v.toFixed(4)}`;
};

type Tab = 'evm' | 'solana';

export default function Home() {
  const { address, isConnected: ethConnected } = useAccount();
  const { caipAddress } = useAppKitAccount();
  const [token, setToken] = useState<TokenData | null>(null);
  const [loadingToken, setLoadingToken] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('evm');

  const connectedAddress = useMemo(() => {
    if (address) return address;
    if (caipAddress) return caipAddress.split(':').pop() || '';
    return '';
  }, [address, caipAddress]);

  const isConnected = ethConnected || Boolean(caipAddress);
  const isSolana = caipAddress?.startsWith('solana:');

  // Auto-switch tab based on connected wallet chain
  useEffect(() => {
    if (isSolana) setActiveTab('solana');
    else if (ethConnected) setActiveTab('evm');
  }, [isSolana, ethConnected]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoadingToken(true);
        const res = await fetch('/api/would-token');
        const data = await res.json();
        if (active && data.success && data.token) setToken(data.token);
      } catch {
        // silently fail — market card shows placeholder
      } finally {
        if (active) setLoadingToken(false);
      }
    };
    load();
    const iv = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(iv); };
  }, []);

  return (
    <GeistProvider>
      <CssBaseline />
      <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, -apple-system, sans-serif' }}>
        {/* Header */}
        <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>
              M
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#1e293b' }}>MintPay</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>EVM + Solana</div>
            </div>
          </div>
          <appkit-button label="Connect Wallet" balance="hide" size="sm" />
        </header>

        <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1rem' }}>
          {/* WOULD Token Market Widget */}
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.07)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {token?.imageUrl ? (
                <img src={token.imageUrl} alt="WOULD" style={{ width: 40, height: 40, borderRadius: '50%' }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #14b8a6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>W</div>
              )}
              <div>
                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>WOULD / Solana</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{WOULD_TOKEN_ADDRESS.slice(0, 8)}...{WOULD_TOKEN_ADDRESS.slice(-6)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Price</div>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>{loadingToken ? '...' : fmtPrice(token?.priceUsd || 0)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Mkt Cap</div>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>{loadingToken ? '...' : fmt(token?.marketCap || 0)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>24h Vol</div>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>{loadingToken ? '...' : fmt(token?.volume24h || 0)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Liquidity</div>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>{loadingToken ? '...' : fmt(token?.liquidityUsd || 0)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <span style={{
                background: (token?.priceChange24h || 0) >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(248,113,113,0.12)',
                color: (token?.priceChange24h || 0) >= 0 ? '#16a34a' : '#dc2626',
                borderRadius: 999,
                padding: '2px 10px',
                fontSize: 13,
                fontWeight: 700,
              }}>
                {(token?.priceChange24h || 0) >= 0 ? '+' : ''}{(token?.priceChange24h || 0).toFixed(2)}%
              </span>
              <a href={token?.url || `https://dexscreener.com/solana/${WOULD_TOKEN_ADDRESS}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>
                View on DEX →
              </a>
            </div>
          </div>

          {/* Payment Panel */}
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 16px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            {/* Tab Bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              {(['evm', 'solana'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    padding: '0.85rem',
                    border: 'none',
                    background: activeTab === tab ? '#fff' : '#f8fafc',
                    borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                    color: activeTab === tab ? '#6366f1' : '#64748b',
                    fontWeight: activeTab === tab ? 700 : 500,
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab === 'evm' ? '⬡ EVM Tokens' : '◎ Solana Tokens'}
                </button>
              ))}
            </div>

            <div style={{ padding: '1.5rem' }}>
              {!isConnected ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>{activeTab === 'solana' ? '◎' : '⬡'}</div>
                  <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Connect your wallet</div>
                  <div style={{ fontSize: 14 }}>
                    {activeTab === 'solana'
                      ? 'Connect a Solana wallet (Phantom, Solflare, etc.) to view and send SPL tokens.'
                      : 'Connect an EVM wallet (MetaMask, etc.) to view and send ERC-20 tokens.'}
                  </div>
                </div>
              ) : (
                <>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                    {activeTab === 'evm' ? 'EVM Token Payment' : 'Solana Token Payment'}
                  </h2>
                  <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
                    {activeTab === 'evm'
                      ? 'Select ERC-20 tokens from your wallet and send them in one transaction.'
                      : 'Select SOL or SPL tokens from your Solana wallet and send them.'}
                  </p>
                  {activeTab === 'evm' ? (
                    <>
                      <GetTokens />
                      <SendTokens />
                    </>
                  ) : (
                    <>
                      <SolanaGetTokens />
                      <SolanaSendTokens />
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Wallet status bar */}
          {isConnected && connectedAddress && (
            <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
              Connected: {connectedAddress.slice(0, 8)}...{connectedAddress.slice(-6)}
              {isSolana ? ' (Solana)' : ' (EVM)'}
            </div>
          )}
        </main>
      </div>
    </GeistProvider>
  );
}
