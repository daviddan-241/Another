/**
 * AutoChat — Full Texas Trader Conversation System.
 *
 * REAL FLOW:
 *  1. Scanner detects new coin with livestream
 *  2. Open pump.fun livestream WS
 *  3. CONVERSATION FLOW:
 *     Phase 1 (Opening)    → "hey devs I've been watching this coin lookin fast"
 *     Phase 2 (Question)   → Ask about the project, goals, roadmap
 *     Phase 3 (Rapport)    → Build trust, relate, show understanding
 *     Phase 4 (Contact Ask)→ "do you have TG or X? if not Discord works too"
 *     Phase 5 (Confirm)    → "have you messaged me on TG?"
 *     Phase 6 (Done)       → Watch, acknowledge, done
 *  4. Each phase: think → typing delay → send short message
 *  5. When dev replies → analyze message, advance phase, generate response
 *  6. When dev confirms they messaged OR mentions contact:
 *     → DM YOU on Telegram with:
 *        • coin name, symbol, MC, creator wallet age
 *        • FULL conversation history
 *        • Dev's contact info if found
 *        • "They're interested — go close the deal!"
 *  7. Works across MANY concurrent livestreams
 *  8. Uses Ollama AI for smart responses (or templates if offline)
 *
 * PUMP.FUN SAFE: no @ symbols, max 4-8 words per send
 * WORKS OFFLINE: template fallback if no Ollama
 */
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { logger } from "./logger";
import { onNewCoin, onStreamEnded, type ScannedCoin } from "./scanner";
import {
  ensureRoom, sendMessage, addMessageListener, removeMessageListener,
  type LivechatMessage,
} from "./pumpLivechat";
import { getRoomState } from "./chatrooms";
import { swapSolForToken, getSolBalance, tokenMintForCoin, setDryRun } from "./jupiterSwap";
import {
  startTelegramBot, onCallbackQuery,
  tgSend, sendBuyApprovalPrompt, tgTyping, tgTypingLoop,
} from "./telegramBot";
import { getRegisteredChatIds } from "./telegram";
import { loadConfig, patchAndPersist, getConfigPath, resetConfig } from "./persistentConfig";
import { PERSONAS } from "./personas";
import { humanDelay, humanTypingMs, interMessageGap, thinkPause } from "./humanize";
import {
  configureOllama,
  generateConversationResponse,
  newConversationState,
  type ConversationPhase,
  type CoinContext,
  type GenerateResult,
} from "./ollama";

/* ── Config ──────────────────────────────────────────────────────────────── */

export interface AutoChatConfig {
  enabled: boolean;
  dryRun: boolean;
  humanize: boolean;
  maxConcurrentChats: number;
  persona: "texas" | "pro" | "genz" | "custom";
  lockOnNew: boolean;
  devMode: boolean;
  telegramOnDev: boolean;
  telegramOnTGDev: boolean;
  buyAmountSol: number;
  buyRequireApproval: boolean;
  watchAfterStreamEnd: boolean;
  minMc: number;
  maxPerCoin: number;
  // Contact info — what YOU want devs to reach you at
  tgUsername: string;   // your Telegram username (no @)
  xUsername: string;    // your X username (no @)
  discordUsername: string; // your Discord username
  // Ollama
  ollamaEnabled: boolean;
  ollamaUrl: string;
  ollamaModel: string;
}

const DEFAULTS: AutoChatConfig = {
  enabled: false,
  dryRun: false,
  humanize: true,
  maxConcurrentChats: 5,
  persona: "texas",
  lockOnNew: false,
  devMode: true,
  telegramOnDev: true,
  telegramOnTGDev: true,
  buyAmountSol: 0.02,
  buyRequireApproval: true,
  watchAfterStreamEnd: true,
  minMc: 0,
  maxPerCoin: 5,
  tgUsername: "TradeSignals",
  xUsername: "TradeSignalsX",
  discordUsername: "TradeSignals#1234",
  ollamaEnabled: false,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.2:3b",
};

let currentConfig: AutoChatConfig = loadConfig<AutoChatConfig>(DEFAULTS);
setDryRun(currentConfig.dryRun);

configureOllama({
  url: currentConfig.ollamaUrl,
  model: currentConfig.ollamaModel,
  enabled: currentConfig.ollamaEnabled,
});

logger.info({
  persona: currentConfig.persona,
  dryRun: currentConfig.dryRun,
  contacts: {
    tg: currentConfig.tgUsername,
    x: currentConfig.xUsername,
    discord: currentConfig.discordUsername,
  },
}, "AutoChat loaded");

export function getAutoChatConfig(): AutoChatConfig { return { ...currentConfig }; }

export function updateAutoChatConfig(patch: Partial<AutoChatConfig>): AutoChatConfig {
  currentConfig = patchAndPersist<AutoChatConfig>(currentConfig, patch as Record<string, unknown>);
  setDryRun(currentConfig.dryRun);
  if ("ollamaEnabled" in patch || "ollamaUrl" in patch || "ollamaModel" in patch) {
    configureOllama({ enabled: currentConfig.ollamaEnabled, url: currentConfig.ollamaUrl, model: currentConfig.ollamaModel });
  }
  logger.info({ patch: Object.keys(patch) }, "AutoChat config updated");
  return currentConfig;
}

export function wipeAutoChatConfig(): AutoChatConfig {
  resetConfig();
  currentConfig = { ...DEFAULTS };
  setDryRun(currentConfig.dryRun);
  return currentConfig;
}

/* ── Operator keypair ────────────────────────────────────────────────────── */

let operatorKeypair: Keypair | null = null;
let operatorPubkey = "";

export function setOperatorPrivateKey(b58: string): string | null {
  try {
    const kp = Keypair.fromSecretKey(bs58.decode(b58.trim()));
    operatorKeypair = kp;
    operatorPubkey = kp.publicKey.toBase58();
    logger.info({ pubkey: operatorPubkey.slice(0, 8) }, "AutoChat operator key set");
    return operatorPubkey;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Invalid operator private key");
    return null;
  }
}
export function getOperatorPubkey(): string { return operatorPubkey; }
export function getOperatorPrivateKeyB58(): string | null {
  return operatorKeypair ? bs58.encode(operatorKeypair.secretKey) : null;
}

/* ── Per-coin conversation tracking ─────────────────────────────────────── */

interface ConversationEntry {
  coin: ScannedCoin;
  ctx: CoinContext;
  state: ReturnType<typeof newConversationState>;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  detectedAt: number;
  streamEndedAt?: number;
  messagesSent: number;
  phaseChangedAt: number;
  listenerId: string | null;
  awaitingApproval?: { chatId: string; messageId: number };
}

const active = new Map<string, ConversationEntry>();

function alreadyHandled(mint: string): boolean {
  const e = active.get(mint);
  if (!e) return false;
  if (Date.now() - e.detectedAt > 8 * 60 * 60 * 1000) { active.delete(mint); return false; }
  return true;
}

/** Format market cap for display */
function formatMC(mc: number): string {
  if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}M`;
  if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}K`;
  return `$${mc.toFixed(0)}`;
}

/** Build coin context from scanned coin */
function buildCoinContext(coin: ScannedCoin): CoinContext {
  return {
    coinName: coin.name,
    coinSymbol: coin.symbol,
    coinMint: coin.mint,
    marketCap: coin.marketCap,
    mcFormatted: formatMC(coin.marketCap),
    creatorAddress: coin.creator ?? "",
    creatorWalletAge: null, // Would need on-chain lookup
    creatorVolume: null,
    platform: coin.platform ?? "pump.fun",
    pumpUrl: coin.pumpUrl,
    hasDiscord: !!coin.hasDiscord,
    discordUrl: coin.discordUrl ?? null,
  };
}

/* ── Split long messages into short chunks (pump.fun safe) ─────────────── */

function splitIntoChunks(text: string, maxWords = 5): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return [text.trim()];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}

/* ── Send one message to pump.fun livestream ─────────────────────────────── */

async function sendPumpMessage(coin: ScannedCoin, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!operatorKeypair) return { ok: false, error: "no operator key" };
  const pk = bs58.encode(operatorKeypair.secretKey);

  const chunks = splitIntoChunks(text, 5);
  for (const chunk of chunks) {
    try {
      await ensureRoom(pk, coin.mint);
      const ack = await sendMessage(pk, coin.mint, chunk);
      if (!ack.ok) return { ok: false, error: ack.error };
      logger.info({ mint: coin.mint, chunk: chunk.slice(0, 40), dryRun: currentConfig.dryRun }, "AutoChat: sent to pump.fun");
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
  return { ok: true };
}

/* ── Telegram approval ───────────────────────────────────────────────────── */

onCallbackQuery("approve:buy:", async (chatId, data) => {
  const mint = data.slice("approve:buy:".length);
  const entry = active.get(mint);
  if (!entry) { await tgSend(chatId, "⚠️ Coin expired."); return; }
  if (!operatorKeypair) { await tgSend(chatId, "⚠️ No wallet key in Settings → Wallet"); return; }
  const pk = bs58.encode(operatorKeypair.secretKey);
  const swapRes = await swapSolForToken({ privateKey: pk, tokenMint: tokenMintForCoin(mint), amountSol: currentConfig.buyAmountSol });
  if (!swapRes.ok) { await tgSend(chatId, `❌ Swap failed: ${swapRes.error}`); return; }
  await tgSend(chatId, `✅ ${currentConfig.dryRun ? "[DRY RUN] " : ""}Bought ~${currentConfig.buyAmountSol} SOL. Retrying chat…`);
  await runConversation(entry, { afterBuy: true });
});

onCallbackQuery("skip:buy:", async (chatId, data) => {
  const mint = data.slice("skip:buy:".length);
  const name = active.get(mint)?.ctx.coinName ?? mint.slice(0, 8);
  await tgSend(chatId, `⏭ Skipped — watching ${name}.`);
});

/* ── Run one phase of the conversation ───────────────────────────────────── */

async function runPhase(entry: ConversationEntry, phase: ConversationPhase): Promise<void> {
  const cfg = currentConfig;
  const chatIds = getRegisteredChatIds();

  // Generate response using Ollama or template
  const res: GenerateResult = await generateConversationResponse(
    cfg.tgUsername,
    cfg.xUsername,
    cfg.discordUsername,
    entry.ctx,
    entry.state,
    entry.history,
  );

  // If no message to send (done phase), just return
  if (!res.text.trim()) {
    entry.state.phase = res.advanceTo;
    entry.phaseChangedAt = Date.now();
    return;
  }

  // Save to history
  entry.history.push({ role: "assistant", content: res.text });
  entry.state.lastOurMessage = res.text;
  entry.state.phase = res.advanceTo;
  entry.phaseChangedAt = Date.now();
  entry.messagesSent++;

  // THINK PAUSE — real humans think before typing
  const thinkMs = currentConfig.humanize ? thinkPause() : 3000;

  // Show typing while thinking
  for (const cid of chatIds) void tgTyping(cid);
  await new Promise(r => setTimeout(r, thinkMs));

  // Show typing while composing
  for (const cid of chatIds) void tgTyping(cid);
  const typingMs = currentConfig.humanize ? humanTypingMs(res.text) : 800;
  await new Promise(r => setTimeout(r, typingMs));

  // Send to pump.fun
  const sendRes = await sendPumpMessage(entry.coin, res.text);

  if (!sendRes.ok && currentConfig.buyAmountSol > 0 && /holder|holding|balance/i.test(sendRes.error ?? "")) {
    if (chatIds.length === 0) return;
    const balance = await getSolBalance(bs58.encode(operatorKeypair!.secretKey));
    if (balance < currentConfig.buyAmountSol + 0.012) {
      for (const cid of chatIds) await tgSend(cid, `⚠️ ${entry.ctx.coinName} is holder-locked. Wallet only has ${balance.toFixed(3)} SOL.`);
      return;
    }
    for (const cid of chatIds) {
      const send = await sendBuyApprovalPrompt({
        chatId: cid, coin: entry.coin, amountSol: currentConfig.buyAmountSol, walletBalance: balance,
      });
      if (send.ok && send.messageId) entry.awaitingApproval = { chatId: cid, messageId: send.messageId };
    }
    return;
  }

  logger.info({
    coin: entry.ctx.coinName,
    phase,
    sent: res.text.slice(0, 50),
    ai: res.usedAI,
    advanceTo: res.advanceTo,
  }, "AutoChat: phase message sent");

  // Small gap before next phase message
  if (currentConfig.humanize) {
    await new Promise(r => setTimeout(r, interMessageGap()));
  }

  // If phase advanced to contact_ask, add urgency
  if (res.advanceTo === "contact_ask") {
    // Give dev time to see the message before next phase
    await new Promise(r => setTimeout(r, 20000));
  }
}

/* ── Run full conversation for one coin ──────────────────────────────────── */

async function runConversation(entry: ConversationEntry, opts: { afterBuy?: boolean } = {}): Promise<void> {
  const cfg = currentConfig;
  const chatIds = getRegisteredChatIds();

  // Run through phases until we hit "done" or need a dev reply
  while (entry.state.phase !== "done" && entry.state.phase !== "confirming") {
    await runPhase(entry, entry.state.phase);

    // If we're past opening and question, pause for potential reply
    if (entry.state.phase !== "opening" && entry.state.messageCount > 2) {
      const pause = 15_000 + Math.floor(Math.random() * 30_000);
      logger.info({ coin: entry.ctx.coinName, phase: entry.state.phase, pauseMs: pause }, "AutoChat: pausing for potential dev reply");
      await new Promise(r => setTimeout(r, pause));
    }

    // Check if dev replied while we were paused
    if (entry.state.devReplied && entry.state.lastDevMessage) {
      break;
    }
  }

  // Alert user of conversation started
  if (chatIds.length > 0 && entry.messagesSent > 0) {
    const dryTag = cfg.dryRun ? "[DRY RUN] " : "";
    const phaseLabel = entry.state.phase === "done" ? "conversation done" : `engaging dev — phase: ${entry.state.phase}`;
    await tgSend(chatIds[0],
      `${dryTag}🤖 Started conversation in <b>${entry.ctx.coinName}</b> ($${entry.ctx.coinSymbol})\n` +
      `MC: ${entry.ctx.mcFormatted} · ${phaseLabel}\n` +
      `Messages sent: ${entry.messagesSent}\n` +
      `<a href="${entry.ctx.pumpUrl}">Open coin →</a>`,
    );
  }
}

/* ── Dev reply handler ──────────────────────────────────────────────────── */

function setupDevWatcher(entry: ConversationEntry): void {
  if (!entry.coin.creator) return;

  const id = addMessageListener(entry.coin.mint, async (mint, msg: LivechatMessage) => {
    const e = active.get(mint);
    if (!e) return;
    if (e.streamEndedAt && !currentConfig.watchAfterStreamEnd) return;

    const author = (msg.address ?? msg.user_address ?? "").trim();
    if (!author || author !== e.coin.creator) return;

    const text = (msg.message ?? "").trim();
    if (!text) return;

    logger.info({ mint, dev: author.slice(0, 8), text: text.slice(0, 80) }, "AutoChat: DEV REPLIED");

    e.state.devReplied = true;
    e.state.lastDevMessage = text;
    e.history.push({ role: "user", content: text });

    const chatIds = getRegisteredChatIds();

    // Generate AI response
    const res = await generateConversationResponse(
      currentConfig.tgUsername,
      currentConfig.xUsername,
      currentConfig.discordUsername,
      e.ctx,
      e.state,
      e.history,
      text,
    );

    // ── ALERT: Dev confirmed they messaged or gave contact info ──
    if (res.isAlertTrigger) {
      const conversationSummary = e.history
        .map(m => `${m.role === "assistant" ? "🤖 BOT" : "👤 DEV"}: ${m.content}`)
        .join("\n");

      for (const cid of chatIds) {
        const contactLine = [
          res.contactInfo.tg ? `📱 Telegram: @${res.contactInfo.tg}` : "",
          res.contactInfo.x ? `✖️ X: @${res.contactInfo.x}` : "",
          res.contactInfo.discord ? `💬 Discord: ${res.contactInfo.discord}` : "",
        ].filter(Boolean).join("\n");

        await tgSend(cid,
          `🎯 <b>DEV INTERESTED — ACTION NEEDED!</b>\n\n` +
          `Coin: <b>${e.ctx.coinName}</b> ($${e.ctx.coinSymbol})\n` +
          `MC: ${e.ctx.mcFormatted}\n` +
          `Creator: <code>${e.ctx.creatorAddress.slice(0, 8)}…${e.ctx.creatorAddress.slice(-4)}</code>\n\n` +
          `${contactLine}\n\n` +
          `📋 <b>CONVERSATION:</b>\n${conversationSummary}\n\n` +
          `🤖 They ${res.isConfirmation ? "said they already messaged you on TG!" : "gave contact info"}\n\n` +
          `<a href="${e.ctx.pumpUrl}">Open coin →</a>`,
        );
      }
    }

    // ── GENERAL DEV REPLY: DM you with what they said ──
    if (currentConfig.telegramOnDev && !res.isAlertTrigger) {
      for (const cid of chatIds) {
        await tgSend(cid,
          `💬 <b>${e.ctx.coinName}</b> dev replied:\n\n"${text.slice(0, 300)}"\n\n` +
          `Phase: ${e.state.phase} · Conv msgs: ${e.history.length}\n` +
          `<a href="${e.ctx.pumpUrl}">Reply on pump.fun →</a>`,
        );
      }
    }

    // ── Send response to dev on pump.fun ──
    if (currentConfig.devMode && res.text.trim() && !res.isAlertTrigger && operatorKeypair) {
      void (async () => {
        const think = thinkPause();
        for (const cid of chatIds) void tgTyping(cid);
        await new Promise(r => setTimeout(r, think));

        for (const cid of chatIds) void tgTyping(cid);
        const typingMs = humanTypingMs(res.text);
        await new Promise(r => setTimeout(r, typingMs));

        const sendRes = await sendPumpMessage(e.coin, res.text);
        if (sendRes.ok) {
          e.history.push({ role: "assistant", content: res.text });
          e.state.lastOurMessage = res.text;
          e.state.phase = res.advanceTo;
          e.messagesSent++;

          for (const cid of chatIds) {
            const aiTag = res.usedAI ? " [🤖 Ollama]" : "";
            await tgSend(cid, `↩️ Auto-replied${aiTag}: "${res.text.slice(0, 200)}"`);
          }
        }
      })();
    }
  });

  entry.listenerId = id;
}

/* ── Bootstrap ───────────────────────────────────────────────────────────── */

let started = false;

export function startAutoChat(): void {
  if (started) return;
  started = true;

  const envKey = (process.env.PRIVATE_KEY ?? "").trim();
  if (envKey) {
    try { operatorKeypair = Keypair.fromSecretKey(bs58.decode(envKey)); operatorPubkey = operatorKeypair.publicKey.toBase58(); }
    catch { operatorKeypair = null; }
  }

  startTelegramBot();

  if (!operatorKeypair) {
    logger.warn("AutoChat: no operator key — set PRIVATE_KEY env or Settings → Wallet");
  }

  onNewCoin((coin) => {
    if (!currentConfig.enabled) return;
    if (alreadyHandled(coin.mint)) return;
    if (active.size >= currentConfig.maxConcurrentChats) return;

    const ctx = buildCoinContext(coin);
    const entry: ConversationEntry = {
      coin,
      ctx,
      state: newConversationState(),
      history: [],
      detectedAt: Date.now(),
      messagesSent: 0,
      phaseChangedAt: Date.now(),
      listenerId: null,
    };
    active.set(coin.mint, entry);

    logger.info({
      mint: coin.mint,
      name: coin.name,
      mc: ctx.mcFormatted,
      tg: currentConfig.tgUsername,
      x: currentConfig.xUsername,
      discord: currentConfig.discordUsername,
    }, "AutoChat: new coin — starting conversation");

    void (async () => {
      try {
        await runConversation(entry);
        setupDevWatcher(entry);
      } catch (err) {
        logger.error({ mint: coin.mint, err: (err as Error).message }, "AutoChat: crashed");
      }
    })();
  });

  onStreamEnded((coin) => {
    const entry = active.get(coin.mint);
    if (!entry) return;
    entry.streamEndedAt = Date.now();
    if (!currentConfig.watchAfterStreamEnd) {
      if (entry.listenerId) { removeMessageListener(coin.mint, entry.listenerId); entry.listenerId = null; }
      logger.info({ mint: coin.mint }, "AutoChat: stream ended — detached watcher");
    } else {
      logger.info({ mint: coin.mint }, "AutoChat: stream ended — still watching chat");
    }
  });
}

/* ── Stats ────────────────────────────────────────────────────────────────── */

export interface AutoChatStats {
  enabled: boolean;
  hasOperatorKey: boolean;
  operatorPubkey: string;
  config: AutoChatConfig;
  active: Array<{
    mint: string; name: string; symbol: string;
    phase: ConversationPhase;
    messagesSent: number;
    detectedAt: number; streamEndedAt: number | null;
  }>;
}

export async function getAutoChatStats(): Promise<AutoChatStats> {
  let balance: number | null = null;
  if (operatorKeypair) {
    try { const { getSolBalance } = await import("./jupiterSwap"); balance = await getSolBalance(bs58.encode(operatorKeypair.secretKey)); }
    catch { balance = null; }
  }
  const activeList = Array.from(active.entries()).map(([mint, e]) => ({
    mint, name: e.ctx.coinName, symbol: e.ctx.coinSymbol,
    phase: e.state.phase, messagesSent: e.messagesSent,
    detectedAt: e.detectedAt, streamEndedAt: e.streamEndedAt ?? null,
  }));
  return {
    enabled: currentConfig.enabled,
    hasOperatorKey: !!operatorKeypair,
    operatorPubkey,
    config: currentConfig,
    active: activeList,
  };
}
