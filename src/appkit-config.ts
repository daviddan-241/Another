import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import {
  mainnet,
  polygon,
  optimism,
  arbitrum,
  bsc,
  gnosis,
  solana,
} from '@reown/appkit/networks';

const projectId =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ||
  '0eb56d36858aa49715ce9a72d2d46d39';

export const networks = [
  mainnet,
  polygon,
  optimism,
  arbitrum,
  bsc,
  gnosis,
  solana,
] as const;

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
});

const solanaAdapter = new SolanaAdapter({ wallets: [] });

createAppKit({
  adapters: [wagmiAdapter, solanaAdapter],
  networks,
  projectId,
  metadata: {
    name: 'MintPay',
    description: 'Multi-chain token payments — EVM + Solana',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://mintpay.app',
    icons: ['/favicon.ico'],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
  themeMode: 'light',
  themeVariables: {
    '--w3m-accent': '#6366f1',
    '--w3m-border-radius-master': '12px',
  },
});
