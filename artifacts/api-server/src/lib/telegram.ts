import axios from "axios";
import { logger } from "./logger";
import type { ScannedCoin } from "./scanner";

const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

// Static chat ID from env var (always included if set)
const ENV_CHAT_ID = (process.env.TELEGRAM_CHAT_ID ?? "").trim();

// Dynamic chat IDs registered at runtime via /api/telegram/register
const registeredChatIds = new Set<string>();
if (ENV_CHAT_ID) registeredChatIds.add(ENV_CHAT_ID);

export function registerChatId(chatId: string): void {
  const id = chatId.trim();
  if (id) {
    registeredChatIds.add(id);
    logger.info({ chatId: id }, "Telegram chat ID registered for coin alerts");
  }
}

export function unregisterChatId(chatId: string): void {
  const id = chatId.trim();
  registeredChatIds.delete(id);
  logger.info({ chatId: id }, "Telegram chat ID unregistered");
}

export function getRegisteredChatIds(): string[] {
  return Array.from(registeredChatIds);
}

function formatMC(mc: number): string {
  if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}M`;
  if (mc >= 1_000)     return `$${(mc / 1_000).toFixed(1)}K`;
  return `$${mc.toFixed(0)}`;
}

function formatAge(minutes: number): string {
  if (minutes < 1)  return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

function buildMessage(coin: ScannedCoin): string {
  const isLive = coin.hasLivestream;
  const typeIcon = isLive ? "🔴" : "💬";
  const platformLabel =
    coin.platform === "flap.sh"   ? "FLAP.SH" :
    coin.platform === "four.meme" ? "FOUR.MEME" :
    coin.platform === "bonk.fun"  ? "BONK.FUN" :
    coin.platform === "moonshot"  ? "MOONSHOT" :
    "PUMP.FUN";
  const platformEmoji =
    coin.platform === "flap.sh"   ? "🟢" :
    coin.platform === "four.meme" ? "🟡" :
    coin.platform === "bonk.fun"  ? "🔵" :
    coin.platform === "moonshot"  ? "🌙" :
    "🚀";

  const discordLine = coin.hasDiscord && coin.discordUrl
    ? `\n💬 <a href="${coin.discordUrl}">Discord →</a>`
    : "";

  return (
    `${typeIcon} <b>${coin.name}</b> <code>$${coin.symbol}</code>\n` +
    `${isLive ? "LIVESTREAM" : "DISCORD"}  ·  MC: <b>${formatMC(coin.marketCap)}</b>  ·  Age: <b>${formatAge(coin.ageMinutes)}</b>\n` +
    `📡 ${platformLabel}${discordLine}\n\n` +
    `<a href="${coin.pumpUrl}">${platformEmoji} Open on ${platformLabel}</a>`
  );
}

async function sendToChat(chatId: string, text: string): Promise<void> {
  await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false },
    { timeout: 8000 },
  );
}

export async function sendCoinAlert(coin: ScannedCoin): Promise<void> {
  // Hard filter: Discord coins only. NEVER alert on livestream coins.
  if (coin.hasLivestream) {
    logger.debug({ mint: coin.mint }, "sendCoinAlert refused (livestream coin)");
    return;
  }
  if (!coin.hasDiscord || !coin.discordUrl) {
    logger.debug({ mint: coin.mint }, "sendCoinAlert refused (no Discord link)");
    return;
  }
  if (!BOT_TOKEN) {
    logger.warn("Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID");
    return;
  }
  if (registeredChatIds.size === 0) {
    logger.warn("Telegram bot token set but no chat IDs registered — set TELEGRAM_CHAT_ID or register via Settings");
    return;
  }

  const message = buildMessage(coin);

  for (const chatId of registeredChatIds) {
    try {
      await sendToChat(chatId, message);
      logger.info({ mint: coin.mint, symbol: coin.symbol, chatId }, "Telegram alert sent");
    } catch (err) {
      const axErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      logger.error(
        { mint: coin.mint, chatId, status: axErr.response?.status, detail: axErr.response?.data ?? axErr.message },
        "Telegram send failed",
      );
    }
  }
}
