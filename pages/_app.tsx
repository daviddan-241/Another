import type { AppProps } from 'next/app';
import NextHead from 'next/head';
import '../styles/globals.css';
import '../src/appkit-config';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiAdapter } from '../src/appkit-config';
import { useIsMounted } from '../hooks';

const queryClient = new QueryClient();

const App = ({ Component, pageProps }: AppProps) => {
  const isMounted = useIsMounted();
  if (!isMounted) return null;
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NextHead>
          <title>MintPay — Multi-Chain Token Payments</title>
          <meta name="description" content="Send EVM and Solana tokens in one click. Powered by Moralis + AppKit." />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </NextHead>
        <Component {...pageProps} />
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;
