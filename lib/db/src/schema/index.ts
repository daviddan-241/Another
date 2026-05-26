import { pgTable, text, numeric, bigint, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Every unique coin discovered by the scanner
export const scannedCoins = pgTable(
  "scanned_coins",
  {
    mint:             text("mint").primaryKey(),
    name:             text("name").notNull(),
    symbol:           text("symbol").notNull(),
    description:      text("description"),
    imageUri:         text("image_uri"),
    marketCap:        numeric("market_cap", { precision: 20, scale: 4 }),
    usdMarketCap:     numeric("usd_market_cap", { precision: 20, scale: 4 }),
    createdTimestamp: bigint("created_timestamp", { mode: "number" }),
    category:         text("category").notNull(), // 'live' | 'discord' | 'micro' | 'trending'
    isCurrentlyLive:  boolean("is_currently_live").default(false),
    discord:          text("discord"),
    twitter:          text("twitter"),
    telegram:         text("telegram"),
    website:          text("website"),
    replyCount:       integer("reply_count").default(0),
    creator:          text("creator"),
    firstSeenAt:      timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt:       timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_scanned_coins_category").on(t.category),
    index("idx_scanned_coins_first_seen").on(t.firstSeenAt),
    index("idx_scanned_coins_usd_mcap").on(t.usdMarketCap),
  ]
);

// Persistent Telegram alert dedup — survives server restarts
export const alertsSent = pgTable(
  "alerts_sent",
  {
    id:        text("id").primaryKey(), // e.g. "live:MINT"
    mint:      text("mint").notNull(),
    alertType: text("alert_type").notNull(), // 'live' | 'discord' | 'micro'
    sentAt:    timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_alerts_mint").on(t.mint),
    index("idx_alerts_type").on(t.alertType),
  ]
);

export const insertScannedCoinSchema = createInsertSchema(scannedCoins).omit({
  firstSeenAt: true,
  lastSeenAt: true,
});
export type InsertScannedCoin = z.infer<typeof insertScannedCoinSchema>;
export type ScannedCoin = typeof scannedCoins.$inferSelect;
