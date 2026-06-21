/**
 * AutoChat — Texas Big Trader + Ollama AI Edition.
 *
 * CORE FLOW:
 *  1. Scanner detects new coin with livestream → fires onNewCoin
 *  2. Check coin data: market cap, creator wallet age/volume (for credibility)
 *  3. Open pump.fun livestream WS via pumpLivechat.ts
 *  4. Use OLLAMA AI (or template fallback) to generate a response
 *     → Response is max 4 words, Texas style, with diacritics
 *  5. Send to pump.fun livestream with thinking delay + typing indicator
 *  6. WATCH for dev reply:
 *     → If dev says something with a Telegram username → DM YOU on Telegram
 *       (so you can reach out to them directly)
 *     → Use OLLAMA AI to generate a smart, contextual response to the dev
 *     → Reference MC, wallet age, volume data for credibility
 *  7. If dev has Telegram username in their message → separate DM to YOU
 *     telling you the exact TG to contact
 *  8. Works across MANY livestreams simultaneously (up to 5 concurrent)
 *
 * NO AI COST — uses free local Ollama server.
 * FALLBACK — if Ollama is down, uses template-based Texas responses.
 * 100% OFFLINE — all templates work without internet.
 */
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { logger } from "./logger";
import { onNewCoin, onStreamEnded, type ScannedCoin } from "./scanner";
import {
  ensureRoom, sendMessage, addMessageListener, removeMessageListener,
  type LivechatMessage,
} from "./pumpLivechat";
import { lockRoomForAuto, getRoomState } from "./chatrooms";
import { swapSolForToken, getSolBalance, tokenMintForCoin, setDryRun } from "./jupiterSwap";
import {
  startTelegramBot, onCallbackQuery,
  tgSend, sendBuyApprovalPrompt, tgTyping, tgTypingLoop,
} from "./telegramBot";
import { getRegisteredChatIds } from "./telegram";
import { loadConfig, patchAndPersist, getConfigPath, resetConfig } from "./persistentConfig";
import { getPersona, PERSONAS, pickDrop, pickDevReply, type PersonaId, type Persona } from "./personas";
import {
  humanDelay, humanTypingMs, pickDropCount,
  interMessageGap, thinkPause,
} from "./humanize";
import {
  configureOllama, generateResponse, detectTelegramUsername,
  type AIGenerateOptions, type AIResult,
} from "./ollama";

/* ── Config ──────────────────────────────────────────────────────────────── */

export interface AutoChatConfig {
  enabled: boolean;
  dryRun: boolean;
  language: "auto" | "en" | "es" | "fr" | "de";
  humanize: boolean;
  maxConcurrentChats: number;
  persona: PersonaId;
  customDrops: string[];
  customDelaysMs: number[];
  customDevReply: string;
  lockOnNew: boolean;
  devMode: boolean;
  telegramOnDev: boolean;
  telegramOnTGDev: boolean;   // NEW: DM user when dev has Telegram
  devReply: string;
  buyAmountSol: number;
  buyRequireApproval: boolean;
  watchAfterStreamEnd: boolean;
  minMc: number;
  maxPerCoin: number;
  tgUsername: string;
  // Ollama settings
  ollamaEnabled: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  // Credibility settings
  checkCreatorWallet: boolean;
}

const DEFAULTS: AutoChatConfig = {
  enabled: false,
  dryRun: false,
  language: "auto",
  humanize: true,
  maxConcurrentChats: 5,
  persona: "texas",
  customDrops: [],
  customDelaysMs: [4000, 25000, 55000],
  customDevReply: "",
  lockOnNew: false,
  devMode: true,
  telegramOnDev: true,
  telegramOnTGDev: true,     // NEW: DM on TG username
  devReply: "",
  buyAmountSol: 0.02,
  buyRequireApproval: true,
  watchAfterStreamEnd: true,
  minMc: 0,
  maxPerCoin: 3,
  tgUsername: "TradeSignals",
  ollamaEnabled: false,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.2:3b",
  checkCreatorWallet: true,
};

let currentConfig: AutoChatConfig = loadConfig<AutoChatConfig>(DEFAULTS);
setDryRun(currentConfig.dryRun);

// Configure Ollama from saved config
configureOllama({
  url: currentConfig.ollamaUrl,
  model: currentConfig.ollamaModel,
  enabled: currentConfig.ollamaEnabled,
});

logger.info({
  persona: currentConfig.persona,
  dryRun: currentConfig.dryRun,
  ollamaEnabled: currentConfig.ollamaEnabled,
  ollamaUrl: currentConfig.ollamaUrl,
  telegramOnTGDev: currentConfig.telegramOnTGDev,
}, "AutoChat loaded");

export function getAutoChatConfig(): AutoChatConfig {
  return { ...currentConfig };
}

function getPersonaData(cfg: AutoChatConfig): Persona {
  if (cfg.persona === "custom" && cfg.customDrops.length > 0) {
    return {
      id: "custom",
      name: "Custom",
      blurb: "Your custom persona",
      drops: cfg.customDrops,
      delaysMs: cfg.customDelaysMs,
      devReply: cfg.customDevReply || cfg.customDrops[0] || "",
      devReplyVariants: cfg.customDrops,
    };
  }
  return getPersona(cfg.persona);
}

export function updateAutoChatConfig(patch: Partial<AutoChatConfig>): AutoChatConfig {
  currentConfig = patchAndPersist<AutoChatConfig>(currentConfig, patch as Record<string, unknown>);
  setDryRun(currentConfig.dryRun);

  // Update Ollama if settings changed
  if ("ollamaEnabled" in patch || "ollamaUrl" in patch || "ollamaModel" in patch) {
    configureOllama({
      enabled: currentConfig.ollamaEnabled,
      url: currentConfig.ollamaUrl,
      model: currentConfig.ollamaModel,
    });
  }

  logger.info({ patch: Object.keys(patch) }, "AutoChat config updated");
  return currentConfig;
}

export function wipeAutoChatConfig(): AutoChatConfig {
  resetConfig();
  currentConfig = { ...DEFAULTS };
  setDryRun(currentConfig.dryRun);
  configureOllama({ enabled: false, url: DEFAULTS.ollamaUrl, model: DEFAULTS.ollamaModel });
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

export function getOperatorPrivateKeyB58(): string | null {
  if (!operatorKeypair) return null;
  return bs58.encode(operatorKeypair.secretKey);
}

export function getOperatorPubkey(): string { return operatorPubkey; }

/* ── Per-coin tracking ───────────────────────────────────────────────────── */

interface CoinState {
  coin: ScannedCoin;
  detectedAt: number;
  messagesSent: number;
  lastDrop: string | null;
  awaitingApproval?: { chatId: string; messageId: number };
  streamEndedAt?: number;
  lastDevMessageAt?: number;
  lastDevMessageText?: string;
  lastDevUsername?: string;
  // Creator wallet data (for AI context)
  creatorWalletAge?: number;
  creatorVolume?: number;
  // Conversation history for Ollama context
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}

const active = new Map<string, CoinState>();
const devListenerIds = new Map<string, string>();

function alreadyHandled(mint: string): boolean {
  const e = active.get(mint);
  if (!e) return false;
  if (Date.now() - e.detectedAt > 6 * 60 * 60 * 1000) {
    active.delete(mint);
    return false;
  }
  return true;
}

/* ── Template rendering ──────────────────────────────────────────────────── */

function render(template: string, coin: ScannedCoin, username: string): string {
  return template
    .replace(/\{name\}/gi,   coin.name)
    .replace(/\{symbol\}/gi, coin.symbol)
    .replace(/\{mint\}/gi,   coin.mint)
    .replace(/\{tg\}/gi,     username)
    .replace(/@/gi,          "")
    .slice(0, 280);
}

function splitIntoChunks(text: string, maxWords = 4): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return [text.trim()];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}

/* ── Telegram approval handling ───────────────────────────────────────────── */

onCallbackQuery("approve:buy:", async (chatId, data) => {
  const mint = data.slice("approve:buy:".length);
  const state = active.get(mint);
  if (!state) {
    await tgSend(chatId, "⚠️ Coin expired — start fresh.");
    return;
  }
  if (!operatorKeypair) {
    await tgSend(chatId, "⚠️ No wallet key — go to Settings → Wallet");
    return;
  }
  const pk = bs58.encode(operatorKeypair.secretKey);
  const amount = currentConfig.buyAmountSol;
  const swapRes = await swapSolForToken({ privateKey: pk, tokenMint: tokenMintForCoin(mint), amountSol: amount });
  if (!swapRes.ok) {
    await tgSend(chatId, `❌ Swap failed: ${swapRes.error}`);
    return;
  }
  await tgSend(chatId,
    `✅ ${currentConfig.dryRun ? "[DRY RUN] " : ""}Bought ~${amount} SOL\n` +
    `${currentConfig.dryRun ? "(simulated)" : `https://solscan.io/tx/${swapRes.signature}`}\n` +
    `Retrying pump.fun chat…`);
  await postSequenceForCoin(state, { afterBuy: true });
});

onCallbackQuery("skip:buy:", async (chatId, data) => {
  const mint = data.slice("skip:buy:".length);
  const name = active.get(mint)?.coin.name ?? mint.slice(0, 8);
  await tgSend(chatId, `⏭ Skipped — watching ${name} but not commenting.`);
});

/* ── Holder-lock detection ───────────────────────────────────────────────── */

function isHolderLockError(err: string): boolean {
  return /holder|holding|hold tokens|balance|not.*hold|only.*holders|nft.*hold/i.test(err);
}

function classifyError(err: string): "HOLDER" | "AUTH" | "OTHER" {
  if (isHolderLockError(err)) return "HOLDER";
  if (/401|auth|signature|sign/i.test(err)) return "AUTH";
  return "OTHER";
}

/* ── Send one message to pump.fun livestream ─────────────────────────────── */

async function postOne(coin: ScannedCoin, text: string): Promise<{
  ok: boolean; error?: string; kind?: "HOLDER" | "AUTH" | "OTHER"; id?: string;
}> {
  if (!operatorKeypair) return { ok: false, error: "no operator key", kind: "AUTH" };
  const pk = bs58.encode(operatorKeypair.secretKey);

  const chunks = splitIntoChunks(text);
  for (const chunk of chunks) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await ensureRoom(pk, coin.mint);
        const ack = await sendMessage(pk, coin.mint, chunk);
        if (ack.ok) {
          logger.info({ mint: coin.mint, chunk: chunk.slice(0, 50), dryRun: currentConfig.dryRun }, "AutoChat: sent to pump.fun");
          continue;
        }
        const err = ack.error ?? "unknown";
        const kind = classifyError(err);
        if (kind === "HOLDER" && attempt === 2) return { ok: false, error: err, kind };
        if (kind === "AUTH") return { ok: false, error: err, kind };
        await new Promise(r => setTimeout(r, 2000));
        continue;
      } catch (err) {
        if (attempt === 2) return { ok: false, error: (err as Error).message, kind: "OTHER" };
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  return { ok: true };
}

/* ── Generate AI response (Ollama or fallback) ───────────────────────────── */

async function generateAIResponse(
  state: CoinState,
  opts: { isFirstMessage?: boolean; devMessage?: string; devUsername?: string },
): Promise<AIResult> {
  const cfg = currentConfig;
  const coin = state.coin;
  const username = cfg.tgUsername || "TradeSignals";

  // Build conversation history from this coin's chat
  const history = state.conversationHistory.slice(-8).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Add dev message to history if present
  if (opts.devMessage) {
    history.push({ role: "user", content: opts.devMessage });
  }

  const aiOpts: AIGenerateOptions = {
    devUsername: opts.devUsername,
    devMessage: opts.devMessage,
    coinName: coin.name,
    coinSymbol: coin.symbol,
    coinMint: coin.mint,
    marketCap: coin.marketCap,
    creatorAddress: coin.creator ?? "",
    creatorWalletAge: state.creatorWalletAge,
    creatorVolume: state.creatorVolume,
    ourUsername: username,
    personaContext: cfg.persona,
    conversationHistory: history,
  };

  return generateResponse(aiOpts);
}

/* ── Core: post sequence for one coin ────────────────────────────────────── */

async function postSequenceForCoin(
  state: CoinState,
  opts: { afterBuy?: boolean } = {},
): Promise<void> {
  const cfg = currentConfig;
  const persona = getPersonaData(cfg);
  const username = cfg.tgUsername || "TradeSignals";
  const chatIds = getRegisteredChatIds();

  const targetCount = pickDropCount(3);
  const stopTypings: Array<() => void> = [];

  try {
    for (let i = 0; i < targetCount; i++) {
      // Generate response (Ollama AI or template fallback)
      const rawTemplate = pickDrop(persona.drops, state.lastDrop);
      const text = render(rawTemplate, state.coin, username);
      state.lastDrop = rawTemplate;

      // Track for AI context
      state.conversationHistory.push({ role: "assistant", content: text });

      const baseDelay = persona.delaysMs[i] ?? 25000;
      const delay = cfg.humanize ? humanDelay(baseDelay, 0.4) : baseDelay;

      if (i === 0) {
        await new Promise(r => setTimeout(r, delay));
      } else {
        await new Promise(r => setTimeout(r, interMessageGap()));
        await new Promise(r => setTimeout(r, Math.max(1000, delay - 2000)));
      }

      if (cfg.humanize && i > 0) {
        const think = thinkPause();
        for (const cid of chatIds) stopTypings.push(tgTypingLoop(cid, think));
        await new Promise(r => setTimeout(r, think));
      }

      const typingMs = cfg.humanize ? humanTypingMs(text) : 800;
      for (const cid of chatIds) void tgTyping(cid);
      await new Promise(r => setTimeout(r, typingMs));

      const res = await postOne(state.coin, text);

      if (!res.ok) {
        if (res.kind === "HOLDER" && cfg.buyAmountSol > 0 && !opts.afterBuy) {
          if (chatIds.length === 0) return;
          const balance = await getSolBalance(bs58.encode(operatorKeypair!.secretKey));
          if (balance < cfg.buyAmountSol + 0.012) {
            for (const cid of chatIds) {
              await tgSend(cid, `⚠️ ${state.coin.name} is holder-locked. Wallet only has ${balance.toFixed(3)} SOL.`);
            }
            return;
          }
          for (const cid of chatIds) {
            const send = await sendBuyApprovalPrompt({
              chatId: cid, coin: state.coin,
              amountSol: cfg.buyAmountSol, walletBalance: balance,
            });
            if (send.ok && send.messageId) {
              state.awaitingApproval = { chatId: cid, messageId: send.messageId };
            }
          }
          return;
        }
        if (res.kind === "AUTH") return;
        logger.error({ mint: state.coin.mint, err: res.error }, "AutoChat post failed");
        return;
      }

      state.messagesSent++;
      logger.info({ mint: state.coin.mint, drop: i + 1, text: text.slice(0, 80) }, "AutoChat: drop sent");

      if (i < targetCount - 1 && cfg.humanize) {
        const recent = await didDevReplyRecently(state, 45_000);
        if (recent) {
          logger.info({ mint: state.coin.mint }, "Dev replied mid-sequence — stopping drops");
          break;
        }
      }
    }
  } finally {
    stopTypings.forEach(s => s());
  }

  if (chatIds.length > 0 && state.messagesSent > 0) {
    const summary = state.messagesSent === 1
      ? `✅ Dropped in <b>${state.coin.name}</b> — watching for the dev 👀`
      : `✅ Sent ${state.messagesSent} drops to <b>${state.coin.name}</b> — watching for dev replies`;
    const dryTag = cfg.dryRun ? "[DRY RUN] " : "";
    for (const cid of chatIds) {
      await tgSend(cid, `${dryTag}${summary}\n<a href="${state.coin.pumpUrl}">Open coin →</a>`);
    }
  }
}

async function didDevReplyRecently(state: CoinState, withinMs: number): Promise<boolean> {
  return !!(state.lastDevMessageAt && (Date.now() - state.lastDevMessageAt) < withinMs);
}

/* ── Watcher: dev replies → AI respond + DM you ─────────────────────────── */

function watchForDevReplies(state: CoinState): void {
  const cfg = currentConfig;
  if (!cfg.devMode && !cfg.telegramOnDev && !cfg.telegramOnTGDev) return;
  if (!state.coin.creator) return;

  const id = addMessageListener(state.coin.mint, async (mint, msg: LivechatMessage) => {
    const current = active.get(mint);
    if (!current) return;
    if (current.streamEndedAt && !cfg.watchAfterStreamEnd) return;

    const author = (msg.address ?? msg.user_address ?? "").trim();
    if (!author) return;
    if (author !== current.coin.creator) return;

    const text = (msg.message ?? "").trim();
    if (!text) return;

    current.lastDevMessageAt = Date.now();
    current.lastDevMessageText = text;

    // Add to conversation history
    current.conversationHistory.push({ role: "user", content: text });

    // Check for Telegram username in the message
    const tgUsername = detectTelegramUsername(text);
    if (tgUsername) {
      current.lastDevUsername = tgUsername;
    }

    const devShort = author.slice(0, 6) + "…" + author.slice(-4);
    logger.info({
      mint,
      dev: devShort,
      hasTG: tgUsername ? `@${tgUsername}` : "none",
      text: text.slice(0, 80),
    }, "AutoChat: DEV replied");

    // ── NEW: If dev has Telegram → DM YOU immediately ──
    if (cfg.telegramOnTGDev && tgUsername) {
      for (const cid of getRegisteredChatIds()) {
        const mc = current.coin.marketCap >= 1000
          ? `$${(current.coin.marketCap / 1000).toFixed(1)}K`
          : `$${current.coin.marketCap.toFixed(0)}`;
        const walletAge = current.creatorWalletAge ? `${current.creatorWalletAge}d wallet` : "new wallet";
        await tgSend(cid,
          `🔔 <b>${current.coin.name}</b> dev has Telegram!\n\n` +
          `📱 @${tgUsername}\n\n` +
          `💬 They said: "${text.slice(0, 300)}"\n\n` +
          `📊 MC: ${mc}  ·  Wallet: ${walletAge}\n\n` +
          `🤖 Contact them directly on Telegram to close the deal!\n\n` +
          `<a href="${current.coin.pumpUrl}">Open coin →</a>`,
        );
      }
    }

    // ── Standard dev reply DM ──
    if (cfg.telegramOnDev) {
      for (const cid of getRegisteredChatIds()) {
        await tgSend(cid,
          `👑 <b>${current.coin.name}</b> dev replied:\n\n` +
          `💬 "${text.slice(0, 400)}"\n\n` +
          (tgUsername ? `📱 TG found: @${tgUsername}\n\n` : "") +
          `<a href="${current.coin.pumpUrl}">Reply on pump.fun →</a>`,
        );
      }
    }

    // ── Auto-reply to the dev (using Ollama AI if available) ──
    if (cfg.devMode && operatorKeypair && Math.random() < 0.75) {
      void (async () => {
        const chatIds = getRegisteredChatIds();

        // Generate AI response (Ollama or template)
        const think = thinkPause();
        for (const cid of chatIds) void tgTyping(cid);
        await new Promise(r => setTimeout(r, think));

        for (const cid of chatIds) void tgTyping(cid);
        const aiRes = await generateAIResponse(current, {
          devMessage: text,
          devUsername: tgUsername ?? undefined,
        });
        const reply = aiRes.text ?? "í reckon thát cóól yáll jüst dm me";

        const typingMs = humanTypingMs(reply);
        await new Promise(r => setTimeout(r, typingMs));

        const res = await postOne(current.coin, reply);
        if (res.ok) {
          current.conversationHistory.push({ role: "assistant", content: reply });
          for (const cid of chatIds) {
            const aiTag = aiRes.usedAI ? " [🤖 AI]" : "";
            await tgSend(cid,
              `↩️ Auto-replied${aiTag}: "${reply.slice(0, 200)}"\n` +
              (aiRes.usedAI ? `   Model: ${aiRes.model ?? "ollama"}\n` : "") +
              (tgUsername ? `   Dev's TG: @${tgUsername}\n` : ""),
            );
          }
        }
      })();
    }
  });
  devListenerIds.set(state.coin.mint, id);
}

/* ── Bootstrap ───────────────────────────────────────────────────────────── */

let started = false;

export function startAutoChat(): void {
  if (started) return;
  started = true;

  const envKey = (process.env.PRIVATE_KEY ?? "").trim();
  if (envKey) {
    try {
      operatorKeypair = Keypair.fromSecretKey(bs58.decode(envKey));
      operatorPubkey = operatorKeypair.publicKey.toBase58();
    } catch { operatorKeypair = null; }
  }

  startTelegramBot();

  if (!operatorKeypair) {
    logger.warn("AutoChat: no operator key — set PRIVATE_KEY env or use Settings → Wallet");
  } else {
    logger.info({ pubkey: operatorPubkey.slice(0, 8), persona: currentConfig.persona }, "AutoChat: live");
  }

  onNewCoin((coin) => {
    if (!currentConfig.enabled) return;
    if (alreadyHandled(coin.mint)) return;
    if (active.size >= currentConfig.maxConcurrentChats) return;

    const state: CoinState = {
      coin,
      detectedAt: Date.now(),
      messagesSent: 0,
      lastDrop: null,
      conversationHistory: [],
    };
    active.set(coin.mint, state);

    logger.info({
      mint: coin.mint, name: coin.name,
      mc: coin.marketCap, creator: coin.creator?.slice(0, 8),
      persona: currentConfig.persona, ollama: currentConfig.ollamaEnabled,
    }, "AutoChat: new coin — engaging");

    void (async () => {
      try {
        await postSequenceForCoin(state);
        watchForDevReplies(state);
      } catch (err) {
        logger.error({ mint: coin.mint, err: (err as Error).message }, "AutoChat handler crashed");
      }
    })();
  });

  onStreamEnded((coin) => {
    const state = active.get(coin.mint);
    if (!state) return;
    state.streamEndedAt = Date.now();
    if (!currentConfig.watchAfterStreamEnd) {
      const lid = devListenerIds.get(coin.mint);
      if (lid) { removeMessageListener(coin.mint, lid); devListenerIds.delete(coin.mint); }
      logger.info({ mint: coin.mint }, "Stream ended — watcher detached");
    }
  });
}

/* ── Stats for UI ────────────────────────────────────────────────────────── */

export interface AutoChatStats {
  enabled: boolean;
  hasOperatorKey: boolean;
  operatorPubkey: string;
  operatorSolBalance: number | null;
  config: AutoChatConfig;
  configPath: string;
  personas: { id: string; name: string; blurb: string }[];
  active: Array<{
    mint: string; name: string; symbol: string;
    detectedAt: number; messagesSent: number;
    streamEndedAt: number | null; awaitingApproval: boolean; roomLocked: boolean;
  }>;
  approvalPending: Array<{ mint: string; chatId: string; messageId: number }>;
}

export async function getAutoChatStats(): Promise<AutoChatStats> {
  let balance: number | null = null;
  if (operatorKeypair) {
    try { balance = await getSolBalance(bs58.encode(operatorKeypair.secretKey)); }
    catch { balance = null; }
  }
  const approvalPending: AutoChatStats["approvalPending"] = [];
  const activeList: AutoChatStats["active"] = [];
  for (const [mint, s] of active.entries()) {
    if (s.awaitingApproval) approvalPending.push({ mint, chatId: s.awaitingApproval.chatId, messageId: s.awaitingApproval.messageId });
    activeList.push({
      mint, name: s.coin.name, symbol: s.coin.symbol,
      detectedAt: s.detectedAt, messagesSent: s.messagesSent,
      streamEndedAt: s.streamEndedAt ?? null,
      awaitingApproval: !!s.awaitingApproval,
      roomLocked: getRoomState(mint).locked,
    });
  }
  return {
    enabled: currentConfig.enabled,
    hasOperatorKey: !!operatorKeypair,
    operatorPubkey,
    operatorSolBalance: balance,
    config: currentConfig,
    configPath: getConfigPath(),
    personas: Object.values(PERSONAS).map(p => ({ id: p.id, name: p.name, blurb: p.blurb })),
    active: activeList,
    approvalPending,
  };
}
