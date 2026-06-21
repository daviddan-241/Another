import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getGetCoinsQueryKey } from "@workspace/api-client-react";

export interface StreamEndedEvent {
  mint: string;
  name: string;
  symbol: string;
}

type StreamEndedListener = (event: StreamEndedEvent) => void;

// Global listeners for stream_ended so other components can subscribe
const streamEndedListeners = new Set<StreamEndedListener>();

export function onStreamEnded(cb: StreamEndedListener): () => void {
  streamEndedListeners.add(cb);
  return () => { streamEndedListeners.delete(cb); };
}

export function useWebSocket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  // Track which mints we've seen as live so we can detect transitions
  const knownLive = useRef(new Set<string>());

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: number;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type: string;
            coin?: {
              mint?: string;
              name?: string;
              symbol?: string;
              marketCap?: number;
              type?: string;
              hasLivestream?: boolean;
              streamEnded?: boolean;
            };
          };

          if (data.type === "new_coin" && data.coin) {
            const newCoin = data.coin;

            // Track as a known-live coin if it has a livestream
            if (newCoin.hasLivestream && newCoin.mint) {
              knownLive.current.add(newCoin.mint);
            }

            // Update React Query caches
            const updateCache = (type: string) => {
              queryClient.setQueryData(
                getGetCoinsQueryKey({ type: type as "livestream" | "discord" | "all" }),
                (oldData: unknown) => {
                  const old = oldData as { coins?: unknown[]; total?: number } | undefined;
                  if (!old) return old;
                  return {
                    ...old,
                    coins: [newCoin, ...(old.coins ?? [])],
                    total: (old.total ?? 0) + 1,
                  };
                },
              );
            };

            updateCache("all");
            if (newCoin.type) updateCache(newCoin.type);

            // New coin toast
            const isLive = newCoin.hasLivestream;
            toast({
              title: isLive ? "🔴 New Livestream!" : "💬 New Discord Coin!",
              description: `$${newCoin.symbol ?? "???"} — MC $${((newCoin.marketCap ?? 0)).toFixed(0)}`,
            });
          }

          if (data.type === "stream_ended" && data.coin) {
            const coin = data.coin;
            const mint = coin.mint ?? "";

            // Update the coin in cache to reflect ended state
            const markEnded = (type: string) => {
              queryClient.setQueryData(
                getGetCoinsQueryKey({ type: type as "livestream" | "discord" | "all" }),
                (oldData: unknown) => {
                  const old = oldData as { coins?: Record<string, unknown>[]; total?: number } | undefined;
                  if (!old?.coins) return old;
                  return {
                    ...old,
                    coins: old.coins.map((c) =>
                      c["mint"] === mint
                        ? { ...c, streamEnded: true, streamEndedAt: new Date().toISOString() }
                        : c,
                    ),
                  };
                },
              );
            };

            markEnded("all");
            markEnded("livestream");

            // Toast notification
            toast({
              title: "📴 Stream Ended",
              description: `$${coin.symbol ?? "???"} (${coin.name ?? ""}) livestream has ended`,
            });

            // Browser notification
            if (
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              try {
                new Notification(`📴 Stream Ended — $${coin.symbol}`, {
                  body: `${coin.name} livestream has ended`,
                  icon: "/favicon.ico",
                });
              } catch {}
            }

            // Notify any subscribed components
            const evt: StreamEndedEvent = {
              mint,
              name: coin.name ?? "",
              symbol: coin.symbol ?? "",
            };
            streamEndedListeners.forEach((cb) => cb(evt));

            knownLive.current.delete(mint);
          }
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimeout = window.setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [queryClient, toast]);

  return { isConnected };
}
