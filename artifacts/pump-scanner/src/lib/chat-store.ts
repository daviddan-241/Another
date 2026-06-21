const store = new Map<string, { symbol: string; name: string; creator: string }>();

export function setChatData(mint: string, data: { symbol: string; name: string; creator: string }) {
  store.set(mint, data);
}

export function getChatData(mint: string) {
  return store.get(mint);
}
