import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface PumpCoin {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image_uri?: string;
  created_timestamp: number;
  market_cap?: number;
  usd_market_cap?: number;
  reply_count?: number;
  is_currently_live?: boolean;
  creator?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
}

export interface PumpReply {
  id: number;
  mint: string;
  user: string;
  message: string;
  timestamp: number;
  profile_image?: string;
  username?: string;
  likes?: number;
}

const API = "/api/pumpfun";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

export function useLiveCoins() {
  return useQuery<PumpCoin[]>({
    queryKey: ["live"],
    queryFn: () => get("live"),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useDiscordCoins() {
  return useQuery<PumpCoin[]>({
    queryKey: ["discord"],
    queryFn: () => get("discord"),
    refetchInterval: 20_000,
    staleTime: 15_000,
  });
}

export function useTrendingCoins() {
  return useQuery<PumpCoin[]>({
    queryKey: ["trending"],
    queryFn: () => get("trending"),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

export function useCoinReplies(mint: string | null) {
  return useQuery<PumpReply[]>({
    queryKey: ["replies", mint],
    queryFn: () => get(`coin/${mint}/replies?limit=50`),
    enabled: !!mint,
    refetchInterval: 8_000,
    staleTime: 5_000,
  });
}

export function useTelegramTest() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/telegram-test`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}
