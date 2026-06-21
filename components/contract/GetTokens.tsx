import { useCallback, useEffect, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { Loading, Toggle } from '@geist-ui/core';
import { tinyBig } from 'essential-eth';
import { useAtom } from 'jotai';
import { checkedTokensAtom } from '../../src/atoms/checked-tokens-atom';
import { globalTokensAtom } from '../../src/atoms/global-tokens-atom';
import { httpFetchTokens, Tokens } from '../../src/fetch-tokens';

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const TokenRow: React.FunctionComponent<{ token: Tokens[number] }> = ({ token }) => {
  const [checkedRecords, setCheckedRecords] = useAtom(checkedTokensAtom);
  const { address, chain } = useAccount();
  const pendingTxn = checkedRecords[token.contract_address]?.pendingTxn;
  const { isLoading } = useWaitForTransactionReceipt({ hash: pendingTxn });

  const unroundedBalance = tinyBig(token.quote).div(token.quote_rate);
  const roundedBalance = unroundedBalance.lt(0.001)
    ? unroundedBalance.round(10)
    : unroundedBalance.gt(1000)
    ? unroundedBalance.round(2)
    : unroundedBalance.round(5);

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
      {isLoading && <Loading />}
      <Toggle
        checked={checkedRecords[token.contract_address]?.isChecked ?? true}
        onChange={(e) => setCheckedRecords((old) => ({ ...old, [token.contract_address]: { ...old[token.contract_address], isChecked: e.target.checked } }))}
        style={{ marginRight: '14px' }}
        disabled={Boolean(pendingTxn)}
        crossOrigin={undefined}
        onPointerEnterCapture={undefined}
        onPointerLeaveCapture={undefined}
      />
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 600, color: '#1e293b' }}>{token.contract_ticker_symbol}</span>
        <span style={{ color: '#64748b', fontSize: 13, marginLeft: 8 }}>{roundedBalance.toString()}</span>
      </div>
      <a
        href={`${chain?.blockExplorers?.default.url}/token/${token.contract_address}?a=${address}`}
        target="_blank"
        rel="noreferrer"
        style={{ color: '#6366f1', fontSize: 13, textDecoration: 'none' }}
      >
        {usdFormatter.format(token.quote)}
      </a>
    </div>
  );
};

export const GetTokens = () => {
  const [tokens, setTokens] = useAtom(globalTokensAtom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [, setCheckedRecords] = useAtom(checkedTokensAtom);
  const { address, isConnected, chain } = useAccount();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const newTokens = await httpFetchTokens(chain?.id as number, address as string);
      const tokenList = (newTokens as any).data.erc20s as Tokens;
      setTokens(tokenList);
      const allSelected: Record<string, { isChecked: boolean }> = {};
      for (const token of tokenList) {
        allSelected[token.contract_address] = { isChecked: true };
      }
      setCheckedRecords(allSelected);
    } catch {
      setError(`Chain ${chain?.id} not supported or Moralis key missing.`);
    }
    setLoading(false);
  }, [address, chain, setTokens, setCheckedRecords]);

  useEffect(() => {
    if (address) fetchData();
  }, [address, chain, fetchData]);

  useEffect(() => {
    if (!isConnected) { setTokens([]); setCheckedRecords({}); }
  }, [isConnected, setTokens, setCheckedRecords]);

  if (loading) {
    return <div style={{ padding: '20px 0', color: '#64748b', fontSize: 14 }}><Loading>Loading your tokens...</Loading></div>;
  }
  if (error) {
    return <div style={{ color: '#ef4444', fontSize: 14, padding: '8px 0' }}>{error}</div>;
  }

  return (
    <div>
      {isConnected && tokens?.length === 0 && (
        <div style={{ color: '#64748b', fontSize: 14, padding: '12px 0' }}>
          No ERC-20 tokens found on {chain?.name}. Make sure MORALIS_API_KEY is set.
        </div>
      )}
      {tokens.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Your Tokens</span>
          <span style={{ fontSize: 12, color: '#6366f1', marginLeft: 8, background: '#eef2ff', borderRadius: 6, padding: '2px 8px' }}>All selected</span>
        </div>
      )}
      {tokens.map((token) => <TokenRow token={token} key={token.contract_address} />)}
    </div>
  );
};
