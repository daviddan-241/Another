interface Window {
  phantom?: {
    solana?: {
      isPhantom?: boolean;
      isConnected?: boolean;
      publicKey?: import('@solana/web3.js').PublicKey;
      connect: () => Promise<{ publicKey: import('@solana/web3.js').PublicKey }>;
      disconnect: () => Promise<void>;
      signAndSendTransaction: (tx: import('@solana/web3.js').Transaction) => Promise<{ signature: string }>;
    };
  };
  solana?: {
    isPhantom?: boolean;
    isConnected?: boolean;
    publicKey?: import('@solana/web3.js').PublicKey;
    connect: () => Promise<{ publicKey: import('@solana/web3.js').PublicKey }>;
    disconnect: () => Promise<void>;
    signAndSendTransaction: (tx: import('@solana/web3.js').Transaction) => Promise<{ signature: string }>;
  };
}
