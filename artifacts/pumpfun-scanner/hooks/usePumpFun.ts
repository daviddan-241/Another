import { useQuery } from "@tanstack/react-query";

const BASE_URL = `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`;

export interface PumpCoin {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image_uri?: string;
  metadata_uri?: string;
  created_timestamp: number;
  market_cap?: number;
  usd_market_cap?: number;
  reply_count?: number;
  currently_live?: boolean;
  creator?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
  virtual_sol_reserves?: number;
  virtual_token_reserves?: number;
  total_supply?: number;
}

async function fetchCoins(endpoint: string): Promise<PumpCoin[]> {
  const res = await fetch(`${BASE_URL}/api/pumpfun/${endpoint}`);
  if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`);
  return res.json();
}

export function useLiveCoins() {
  return useQuery<PumpCoin[], Error>({
    queryKey: ["pumpfun", "live"],
    queryFn: () => fetchCoins("live"),
    refetchInterval: 15000,
    staleTime: 10000,
  });
}

export function useDiscordCoins() {
  return useQuery<PumpCoin[], Error>({
    queryKey: ["pumpfun", "discord"],
    queryFn: () => fetchCoins("discord"),
    refetchInterval: 20000,
    staleTime: 15000,
  });
}

export async function sendTelegramTest(): Promise<void> {
  await fetch(`${BASE_URL}/api/pumpfun/telegram-test`, { method: "POST" });
}
