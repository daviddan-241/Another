import type { NextApiRequest, NextApiResponse } from 'next';

const WOULD_TOKEN_ADDRESS = 'J1Wpmugrooj1yMyQKrdZ2vwRXG5rhfx3vTnYE39gpump';
const DEXSCREENER_URL = `https://api.dexscreener.com/latest/dex/tokens/${WOULD_TOKEN_ADDRESS}`;

type TokenResponse = {
  success: boolean;
  token: {
    address: string;
    name: string;
    symbol: string;
    chainId: string;
    dexId: string;
    pairAddress: string;
    url: string;
    priceUsd: number;
    priceNative: string;
    liquidityUsd: number;
    volume24h: number;
    volume6h: number;
    priceChange24h: number;
    fdv: number;
    marketCap: number;
    imageUrl: string | null;
    updatedAt: string;
  } | null;
  error?: string;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TokenResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, token: null, error: 'Method not allowed' });
  }

  try {
    const response = await fetch(DEXSCREENER_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 } as never,
    });

    if (!response.ok) {
      throw new Error(`DEX data request failed with status ${response.status}`);
    }

    const data = await response.json();
    const pairs = Array.isArray(data.pairs) ? data.pairs : [];
    const pair = pairs
      .filter((item: any) => item?.chainId === 'solana')
      .sort((a: any, b: any) => toNumber(b?.liquidity?.usd) - toNumber(a?.liquidity?.usd))[0];

    if (!pair) {
      return res.status(404).json({ success: false, token: null, error: 'WOULD token pair was not found' });
    }

    return res.status(200).json({
      success: true,
      token: {
        address: pair.baseToken?.address || WOULD_TOKEN_ADDRESS,
        name: pair.baseToken?.name || 'would',
        symbol: pair.baseToken?.symbol || 'WOULD',
        chainId: pair.chainId || 'solana',
        dexId: pair.dexId || 'unknown',
        pairAddress: pair.pairAddress || '',
        url: pair.url || `https://dexscreener.com/solana/${WOULD_TOKEN_ADDRESS}`,
        priceUsd: toNumber(pair.priceUsd),
        priceNative: String(pair.priceNative || ''),
        liquidityUsd: toNumber(pair.liquidity?.usd),
        volume24h: toNumber(pair.volume?.h24),
        volume6h: toNumber(pair.volume?.h6),
        priceChange24h: toNumber(pair.priceChange?.h24),
        fdv: toNumber(pair.fdv),
        marketCap: toNumber(pair.marketCap),
        imageUrl: pair.info?.imageUrl || null,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to fetch WOULD token data';
    return res.status(500).json({ success: false, token: null, error: message });
  }
}
