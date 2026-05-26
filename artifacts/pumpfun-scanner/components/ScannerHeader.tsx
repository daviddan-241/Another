import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface ScannerHeaderProps {
  liveCount: number;
  discordCount: number;
}

export default function ScannerHeader({ liveCount, discordCount }: ScannerHeaderProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
      <View style={styles.titleRow}>
        <Animated.View style={[styles.radarDot, { backgroundColor: colors.primary, opacity: pulse }]} />
        <Text style={[styles.title, { color: colors.foreground }]}>PUMP SCANNER</Text>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: colors.live }]}>{liveCount}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>LIVE</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: colors.discord }]}>{discordCount}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>DISCORD</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  radarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 2,
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  stat: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  statNum: {
    fontSize: 20,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  divider: {
    width: 1,
    height: 18,
  },
});
