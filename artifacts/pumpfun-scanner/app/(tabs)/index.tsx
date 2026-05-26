import React, { useState, useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useLiveCoins, useDiscordCoins, sendTelegramTest, type PumpCoin } from "@/hooks/usePumpFun";
import CoinCard from "@/components/CoinCard";
import ScannerHeader from "@/components/ScannerHeader";
import EmptyState from "@/components/EmptyState";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

type Tab = "live" | "discord";

export default function ScannerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("live");
  const [testSent, setTestSent] = useState(false);

  const liveQuery = useLiveCoins();
  const discordQuery = useDiscordCoins();

  const liveCoins: PumpCoin[] = liveQuery.data ?? [];
  const discordCoins: PumpCoin[] = discordQuery.data ?? [];

  const activeQuery = activeTab === "live" ? liveQuery : discordQuery;
  const activeCoins = activeTab === "live" ? liveCoins : discordCoins;

  const onRefresh = useCallback(() => {
    liveQuery.refetch();
    discordQuery.refetch();
  }, [liveQuery, discordQuery]);

  async function handleTabPress(tab: Tab) {
    if (Platform.OS !== "web") {
      await Haptics.selectionAsync();
    }
    setActiveTab(tab);
  }

  async function handleTelegramTest() {
    if (Platform.OS !== "web") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await sendTelegramTest();
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  }

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScannerHeader liveCount={liveCoins.length} discordCount={discordCoins.length} />

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "live" && { borderBottomColor: colors.live, borderBottomWidth: 2 },
          ]}
          onPress={() => handleTabPress("live")}
          activeOpacity={0.7}
        >
          <View style={styles.tabInner}>
            <View style={[styles.liveDot, { backgroundColor: colors.live }]} />
            <Text style={[styles.tabText, { color: activeTab === "live" ? colors.live : colors.mutedForeground }]}>
              Live Coins
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "discord" && { borderBottomColor: colors.discord, borderBottomWidth: 2 },
          ]}
          onPress={() => handleTabPress("discord")}
          activeOpacity={0.7}
        >
          <View style={styles.tabInner}>
            <Feather name="message-circle" size={13} color={activeTab === "discord" ? colors.discord : colors.mutedForeground} />
            <Text style={[styles.tabText, { color: activeTab === "discord" ? colors.discord : colors.mutedForeground }]}>
              Has Discord
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.testBtn}
          onPress={handleTelegramTest}
          activeOpacity={0.7}
        >
          <Feather name="send" size={14} color={testSent ? colors.primary : colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Scanning pump.fun...</Text>
        </View>
      ) : activeQuery.isError ? (
        <EmptyState
          icon="wifi-off"
          title="Scan Failed"
          subtitle="Could not reach pump.fun. Check your connection and try again."
        />
      ) : (
        <FlatList
          data={activeCoins}
          keyExtractor={(item) => item.mint}
          renderItem={({ item }) => (
            <CoinCard coin={item} mode={activeTab} />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: bottomPad + 16 },
            activeCoins.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={activeQuery.isFetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={activeTab === "live" ? "video-off" : "message-circle"}
              title={activeTab === "live" ? "No Live Coins" : "No Discord Coins"}
              subtitle={
                activeTab === "live"
                  ? "No coins are currently live-streaming with a creation time under 1 hour."
                  : "No recently launched coins have a Discord server linked yet."
              }
            />
          }
          showsVerticalScrollIndicator={false}
          scrollEnabled={activeCoins.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  testBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "500",
  },
  list: {
    padding: 14,
  },
  listEmpty: {
    flex: 1,
  },
});
