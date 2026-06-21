import { Button, Input, useToasts } from '@geist-ui/core';
import { usePublicClient, useWalletClient } from 'wagmi';
import { isAddress } from 'essential-eth';
import { useAtom } from 'jotai';
import { normalize } from 'viem/ens';
import { erc20Abi } from 'viem';
import { checkedTokensAtom } from '../../src/atoms/checked-tokens-atom';
import { destinationAddressAtom } from '../../src/atoms/destination-address-atom';
import { globalTokensAtom } from '../../src/atoms/global-tokens-atom';

export const SendTokens = () => {
  const { setToast } = useToasts();
  const showToast = (message: string, type: 'success' | 'warning' | 'error') =>
    setToast({ text: message, type, delay: 4000 });

  const [tokens] = useAtom(globalTokensAtom);
  const [destinationAddress, setDestinationAddress] = useAtom(destinationAddressAtom);
  const [checkedRecords, setCheckedRecords] = useAtom(checkedTokensAtom);
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const sendAllCheckedTokens = async () => {
    const tokensToSend = Object.entries(checkedRecords)
      .filter(([, { isChecked }]) => isChecked)
      .map(([addr]) => addr as `0x${string}`);

    if (!walletClient || !publicClient || !destinationAddress) return;

    let resolvedDest = destinationAddress;
    if (destinationAddress.includes('.')) {
      const resolved = await publicClient.getEnsAddress({ name: normalize(destinationAddress) });
      if (!resolved) { showToast('Could not resolve ENS name', 'warning'); return; }
      resolvedDest = resolved;
      setDestinationAddress(resolved);
    }

    for (const tokenAddress of tokensToSend) {
      const token = tokens.find((t) => t.contract_address === tokenAddress);
      try {
        const { request } = await publicClient.simulateContract({
          account: walletClient.account,
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [resolvedDest as `0x${string}`, BigInt(token?.balance || '0')],
        });
        const txHash = await walletClient.writeContract(request);
        setCheckedRecords((old) => ({
          ...old,
          [tokenAddress]: { ...old[tokenAddress], pendingTxn: txHash },
        }));
        showToast(`${token?.contract_ticker_symbol} sent!`, 'success');
      } catch (err: any) {
        showToast(
          `Error with ${token?.contract_ticker_symbol}: ${err?.reason || err?.message || 'Unknown error'}`,
          'warning',
        );
      }
    }
  };

  const addressAppearsValid =
    typeof destinationAddress === 'string' &&
    (destinationAddress.includes('.') || isAddress(destinationAddress));
  const checkedCount = Object.values(checkedRecords).filter((r) => r.isChecked).length;

  return (
    <div style={{ marginTop: 24 }}>
      <form>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          Recipient Address
        </label>
        <Input
          required
          value={destinationAddress}
          placeholder="0x... or vitalik.eth"
          onChange={(e) => setDestinationAddress(e.target.value)}
          type={addressAppearsValid ? 'success' : destinationAddress.length > 0 ? 'warning' : 'default'}
          width="100%"
          crossOrigin={undefined}
          onPointerEnterCapture={undefined}
          onPointerLeaveCapture={undefined}
        />
        <Button
          type="secondary"
          onClick={sendAllCheckedTokens}
          disabled={!addressAppearsValid || checkedCount === 0}
          style={{
            marginTop: 20,
            width: '100%',
            background: addressAppearsValid && checkedCount > 0 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : undefined,
            color: addressAppearsValid && checkedCount > 0 ? '#fff' : undefined,
            border: 'none',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 16,
            height: 48,
          }}
          placeholder={undefined}
          onPointerEnterCapture={undefined}
          onPointerLeaveCapture={undefined}
        >
          {checkedCount === 0 ? 'Select tokens to pay' : `Pay with ${checkedCount} token${checkedCount > 1 ? 's' : ''}`}
        </Button>
      </form>
    </div>
  );
};
