import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Image,
  Platform,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import type { PumpCoin } from "@/hooks/usePumpFun";

interface CoinCardProps {
  coin: PumpCoin;
  mode: "live" | "discord";
}

function formatMarketCap(val?: number): string {
  if (!val) return "—";
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function CoinCard({ coin, mode }: CoinCardProps) {
  const colors = useColors();

  const pumpLink = `https://pump.fun/${coin.mint}`;
  const liveLink = coin.creator
    ? `https://pump.fun/profile/${coin.creator}`
    : pumpLink;

  async function openLink(url: string) {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Linking.openURL(url);
  }

  const badgeColor = mode === "live" ? colors.live : colors.discord;
  const badgeLabel = mode === "live" ? "LIVE" : "DISCORD";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.coinInfo}>
          {coin.image_uri ? (
            <Image
              source={{ uri: coin.image_uri }}
              style={styles.avatar}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.avatarLetter, { color: colors.primary }]}>
                {(coin.symbol ?? "?")[0]}
              </Text>
            </View>
          )}
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                {coin.name ?? "Unknown"}
              </Text>
              <View style={[styles.badge, { backgroundColor: badgeColor + "22", borderColor: badgeColor }]}>
                <View style={[styles.dot, { backgroundColor: badgeColor }]} />
                <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
              </View>
            </View>
            <Text style={[styles.symbol, { color: colors.mutedForeground }]}>
              ${coin.symbol}
            </Text>
          </View>
        </View>
        <View style={styles.mcap}>
          <Text style={[styles.mcapValue, { color: colors.gold }]}>
            {formatMarketCap(coin.usd_market_cap ?? coin.market_cap)}
          </Text>
          <Text style={[styles.mcapLabel, { color: colors.mutedForeground }]}>mkt cap</Text>
        </View>
      </View>

      {coin.description ? (
        <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
          {coin.description}
        </Text>
      ) : null}

      <View style={styles.meta}>
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
          <Feather name="clock" size={11} color={colors.mutedForeground} /> {timeAgo(coin.created_timestamp)}
        </Text>
        {coin.reply_count != null && (
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            <Feather name="message-circle" size={11} color={colors.mutedForeground} /> {coin.reply_count}
          </Text>
        )}
      </View>

      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => openLink(pumpLink)}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons name="pump" size={14} color={colors.primaryForeground} />
          <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Pump.fun</Text>
        </TouchableOpacity>

        {mode === "live" && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.live + "22", borderColor: colors.live, borderWidth: 1 }]}
            onPress={() => openLink(liveLink)}
            activeOpacity={0.75}
          >
            <Feather name="video" size={14} color={colors.live} />
            <Text style={[styles.actionText, { color: colors.live }]}>Livestream</Text>
          </TouchableOpacity>
        )}

        {mode === "discord" && coin.discord && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.discord + "22", borderColor: colors.discord, borderWidth: 1 }]}
            onPress={() => openLink(coin.discord!)}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons name="discord" size={14} color={colors.discord} />
            <Text style={[styles.actionText, { color: colors.discord }]}>Discord</Text>
          </TouchableOpacity>
        )}

        {coin.twitter && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
            onPress={() => openLink(coin.twitter!)}
            activeOpacity={0.75}
          >
            <Feather name="twitter" size={14} color={colors.foreground} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    paddingBottom: 8,
  },
  coinInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700",
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "nowrap",
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  symbol: {
    fontSize: 12,
    fontWeight: "500",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  mcap: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  mcapValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  mcapLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  metaText: {
    fontSize: 11,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
