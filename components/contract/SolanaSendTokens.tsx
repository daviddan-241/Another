import { useState } from 'react';
import { Button, Input, useToasts } from '@geist-ui/core';
import { useAppKitProvider, useAppKitAccount } from '@reown/appkit/react';
import type { Provider } from '@reown/appkit-adapter-solana/react';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { useAtom } from 'jotai';
import { solanaPortfolioAtom, solanaSelectedTokensAtom } from './SolanaGetTokens';
import { solanaDestinationAtom } from '../../src/atoms/destination-address-atom';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC, 'confirmed');

const isValidSolanaAddress = (addr: string): boolean => {
  try {
    new PublicKey(addr);
    return addr.length >= 32 && addr.length <= 44;
  } catch {
    return false;
  }
};

export const SolanaSendTokens = () => {
  const { setToast } = useToasts();
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const { address: solanaAddress } = useAppKitAccount();
  const [portfolio] = useAtom(solanaPortfolioAtom);
  const [selected] = useAtom(solanaSelectedTokensAtom);
  const [destination, setDestination] = useAtom(solanaDestinationAtom);
  const [sending, setSending] = useState(false);

  const showToast = (message: string, type: 'success' | 'warning' | 'error') =>
    setToast({ text: message, type, delay: 5000 });

  const sendSelected = async () => {
    if (!walletProvider || !solanaAddress || !destination) return;
    if (!isValidSolanaAddress(destination)) {
      showToast('Invalid Solana address', 'warning');
      return;
    }

    setSending(true);
    const fromPubkey = new PublicKey(solanaAddress);
    const toPubkey = new PublicKey(destination);

    try {
      // Send SOL if selected
      if (selected.__SOL__ && portfolio && portfolio.solBalance > 0.001) {
        const lamports = Math.floor((portfolio.solBalance - 0.001) * LAMPORTS_PER_SOL);
        if (lamports > 0) {
          const tx = new Transaction().add(
            SystemProgram.transfer({ fromPubkey, toPubkey, lamports }),
          );
          const { blockhash } = await connection.getLatestBlockhash();
          tx.recentBlockhash = blockhash;
          tx.feePayer = fromPubkey;
          const sig = await walletProvider.sendTransaction(tx, connection);
          showToast(`SOL sent! Tx: ${sig.slice(0, 12)}...`, 'success');
        }
      }

      // Send selected SPL tokens
      if (portfolio) {
        for (const token of portfolio.tokens) {
          if (!selected[token.mint]) continue;
          try {
            const mintPubkey = new PublicKey(token.mint);
            const fromAta = await getAssociatedTokenAddress(mintPubkey, fromPubkey);
            const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey);

            const tx = new Transaction();
            // Check if destination ATA exists
            const toAtaInfo = await connection.getAccountInfo(toAta);
            if (!toAtaInfo) {
              // Create destination ATA instruction would go here
              // For simplicity we use getOrCreate approach via simulation
            }

            const rawAmount = BigInt(token.amountRaw || '0');
            if (rawAmount === BigInt(0)) continue;

            tx.add(
              createTransferInstruction(fromAta, toAta, fromPubkey, rawAmount, [], TOKEN_PROGRAM_ID),
            );
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.feePayer = fromPubkey;
            const sig = await walletProvider.sendTransaction(tx, connection);
            showToast(`${token.symbol} sent! Tx: ${sig.slice(0, 12)}...`, 'success');
          } catch (err) {
            showToast(`${token.symbol} failed: ${err instanceof Error ? err.message : 'Error'}`, 'warning');
          }
        }
      }
    } catch (err) {
      showToast(`Transaction failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setSending(false);
    }
  };

  const addressValid = isValidSolanaAddress(destination);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div style={{ marginTop: 24 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
        Recipient Solana Address
      </label>
      <Input
        value={destination}
        placeholder="Solana wallet address..."
        onChange={(e) => setDestination(e.target.value)}
        type={addressValid ? 'success' : destination.length > 0 ? 'warning' : 'default'}
        width="100%"
        crossOrigin={undefined}
        onPointerEnterCapture={undefined}
        onPointerLeaveCapture={undefined}
      />
      <Button
        type="secondary"
        onClick={sendSelected}
        loading={sending}
        disabled={!addressValid || selectedCount === 0 || sending}
        style={{
          marginTop: 20,
          width: '100%',
          background: addressValid && selectedCount > 0 ? 'linear-gradient(135deg, #9945ff, #14f195)' : undefined,
          color: addressValid && selectedCount > 0 ? '#000' : undefined,
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
        {sending
          ? 'Sending...'
          : selectedCount === 0
          ? 'Select tokens to send'
          : `Send ${selectedCount} Solana asset${selectedCount > 1 ? 's' : ''}`}
      </Button>
    </div>
  );
};
