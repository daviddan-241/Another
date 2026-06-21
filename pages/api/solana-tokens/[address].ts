import type { NextApiRequest, NextApiResponse } from 'next';

const MORALIS_SOLANA_URL = 'https://solana-gateway.moralis.io/account/mainnet';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const MORALIS_API_KEY_FALLBACK =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImZmZGYwZWJkLWZlNGYtNGUyMi04MDgwLWVjNzAxZWNmOWJmYyIsIm9yZ0lkIjoiNTA4OTEzIiwidXNlcklkIjoiNTIzNjIyIiwidHlwZUlkIjoiODk0NGNiNzgtZjg3YS00NDZiLTlkYzctMmE4ZjE4ZDk3MzI1IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzU2ODQ0MjUsImV4cCI6NDkzMTQ0NDQyNX0.dgzOA_cu3qjJtRjjwe25O8-MJAkI00uptxklb27wwfI';

type SolanaToken = {
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

type SolanaTokensResponse = {
  success: boolean;
  address: string;
  solBalance: number;
  solUsdValue: number | null;
  tokens: SolanaToken[];
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SolanaTokensResponse>,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, address: '', solBalance: 0, solUsdValue: null, tokens: [], error: 'Method not allowed' });
  }

  const { address } = req.query;
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ success: false, address: '', solBalance: 0, solUsdValue: null, tokens: [], error: 'Invalid address' });
  }

  const apiKey = process.env.MORALIS_API_KEY || MORALIS_API_KEY_FALLBACK;

  try {
    // Fetch SOL balance via RPC
    const balanceRes = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
    });
    const balanceData = await balanceRes.json();
    const lamports = balanceData?.result?.value || 0;
    const solBalance = lamports / 1_000_000_000;

    // Fetch SPL token portfolio from Moralis Solana API
    const portfolioRes = await fetch(`${MORALIS_SOLANA_URL}/${address}/portfolio`, {
      headers: { Accept: 'application/json', 'X-API-Key': apiKey },
    });

    if (!portfolioRes.ok) {
      return res.status(200).json({ success: true, address, solBalance, solUsdValue: null, tokens: [] });
    }

    const portfolio = await portfolioRes.json();
    const nativeBalance = portfolio?.nativeBalance;
    const solUsdValue = nativeBalance?.solana ? parseFloat(nativeBalance.solana) : null;

    const rawTokens: any[] = portfolio?.tokens || [];
    const tokens: SolanaToken[] = rawTokens
      .filter((t: any) => t.amount && parseFloat(t.amount) > 0)
      .map((t: any) => ({
        mint: t.mint || t.associatedTokenAddress || '',
        name: t.name || 'Unknown',
        symbol: t.symbol || '???',
        decimals: t.decimals || 0,
        amount: t.amount || '0',
        amountRaw: t.amountRaw || '0',
        usdPrice: t.usdPrice ? parseFloat(t.usdPrice) : null,
        usdValue: t.usdValue ? parseFloat(t.usdValue) : null,
        logo: t.logo || null,
      }))
      .filter((t) => t.usdValue === null || t.usdValue > 0.01);

    return res.status(200).json({ success: true, address, solBalance, solUsdValue, tokens });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Solana tokens';
    return res.status(500).json({ success: false, address: String(address), solBalance: 0, solUsdValue: null, tokens: [], error: message });
  }
}
