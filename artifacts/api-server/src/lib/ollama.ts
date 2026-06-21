/**
 * Ollama integration — free local AI for generating Texas trader responses.
 *
 * HOW IT WORKS:
 *   - Connects to a local Ollama server (default: http://localhost:11434)
 *   - Uses a Texas trader system prompt with real context (MC, creator wallet, etc.)
 *   - Generates responses that sound like a real degen trader
 *   - Falls back to template-based responses if Ollama is unavailable
 *   - Works 100% offline (no internet required for the AI)
 *
 * SETUP:
 *   1. Install Ollama: curl -fsSL https://ollama.com/install.sh | sh
 *   2. Pull a model:  ollama pull llama3.2:3b
 *   3. Start server:  ollama serve
 *   4. Set OLLAMA_URL in .env (or use default localhost)
 *
 * MODELS RECOMMENDED:
 *   - llama3.2:3b  (fast, ~2GB RAM) — good for short responses
 *   - llama3.1:8b  (smarter, ~5GB RAM) — better quality
 *   - mistral:7b   (balanced)
 */
import axios from "axios";
import { logger } from "./logger";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL     = "llama3.2:3b";
const MAX_HISTORY       = 10; // keep last N messages for context

export interface OllamaConfig {
  url: string;
  model: string;
  enabled: boolean;
}

export interface AIGenerateOptions {
  devUsername?: string;        // detected Telegram username
  devMessage?: string;         // what the dev just said
  coinName: string;
  coinSymbol: string;
  coinMint: string;
  marketCap: number;
  creatorAddress: string;
  creatorWalletAge?: number;   // days since first tx
  creatorVolume?: number;      // approximate SOL volume
  ourUsername: string;         // our TG username (no @)
  personaContext: string;      // "texas" | "pro" | "genz" | "custom"
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

let configuredUrl = DEFAULT_OLLAMA_URL;
let configuredModel = DEFAULT_MODEL;
let isEnabled = false;

export function configureOllama(cfg: OllamaConfig): void {
  configuredUrl   = cfg.url?.trim() || DEFAULT_OLLAMA_URL;
  configuredModel = cfg.model?.trim() || DEFAULT_MODEL;
  isEnabled       = cfg.enabled;
  logger.info({ url: configuredUrl, model: configuredModel, enabled: isEnabled }, "Ollama configured");
}

export function getOllamaConfig(): OllamaConfig {
  return { url: configuredUrl, model: configuredModel, enabled: isEnabled };
}

function buildSystemPrompt(opts: AIGenerateOptions): string {
  const mc = opts.marketCap >= 1000
    ? `$${(opts.marketCap / 1000).toFixed(1)}K`
    : `$${opts.marketCap.toFixed(0)}`;
  const walletAge = opts.creatorWalletAge ? `${opts.creatorWalletAge} days old` : "new wallet";
  const volume    = opts.creatorVolume   ? `~${opts.creatorVolume.toFixed(1)} SOL traded` : "no known volume";

  return `You are a Texas crypto degen trader — been in Solana since 2019, talk like a real trader from the Lone Star State.

RULES (NEVER BREAK):
- Max 4 words per message. Always.
- Use diacritics: í á é ó ú ñ ü (on words that can have them)
- Small typos and dropped letters like real typing
- No @ symbol — plain username like "${opts.ourUsername}"
- Texas slang: y'all, reckon, howdy, prob'ly, dóñe, fásty, déñse, sóundin
- Never use "I" — always "í"
- Sound confident, helpful, like you've been doing this for years

CONTEXT ABOUT THIS COIN:
- Name: ${opts.coinName}
- Symbol: ${opts.coinSymbol}
- Market Cap: ${mc}
- Creator wallet age: ${walletAge}
- Creator trading volume: ${volume}
- Your TG username (tell devs to reach you here): ${opts.ourUsername}

${opts.devUsername ? `IMPORTANT: The dev's Telegram is @${opts.devUsername}. You can mention it naturally.` : ""}

${opts.devMessage ? `The dev just said to you: "${opts.devMessage.slice(0, 200)}"` : "You're reaching out to the dev for the first time."}

${opts.conversationHistory && opts.conversationHistory.length > 0
  ? `Recent conversation:\n${opts.conversationHistory.slice(-MAX_HISTORY).map(m => `${m.role}: ${m.content}`).join("\n")}`
  : ""}

Always reply in the language the dev is using. Keep it short — 1 to 4 words.`;
}

function buildUserPrompt(opts: AIGenerateOptions): string {
  if (opts.devMessage) {
    return `The dev (${opts.devUsername ? `@${opts.devUsername}` : "anonymous"}) just replied to you in the ${opts.coinName} pump.fun chat saying:\n"${opts.devMessage.slice(0, 300)}"\n\nWrite a short, natural reply as a Texas trader. 1-4 words. Use diacritics.`;
  }
  return `Send a short first message to ${opts.coinName} ($${opts.coinSymbol}) dev. You're reaching out as a Solana degen trader who found their coin. 1-4 words max. Use diacritics.`;
}

export interface AIResult {
  ok: boolean;
  text?: string;
  error?: string;
  usedAI: boolean;
  model?: string;
}

/**
 * Generate a response using Ollama. Falls back to template if Ollama unavailable.
 */
export async function generateResponse(opts: AIGenerateOptions): Promise<AIResult> {
  // If AI is disabled or no Ollama URL configured, use fallback
  if (!isEnabled || !configuredUrl) {
    return { ok: true, text: buildFallbackResponse(opts), usedAI: false };
  }

  try {
    // Check if Ollama is actually running first
    const health = await Promise.race([
      axios.get(`${configuredUrl}/api/tags`, { timeout: 3000 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]).catch(() => null);

    if (!health) {
      logger.warn({ url: configuredUrl }, "Ollama not reachable — using fallback");
      return { ok: true, text: buildFallbackResponse(opts), usedAI: false, error: "Ollama not running" };
    }

    const messages: OllamaMessage[] = [
      { role: "system", content: buildSystemPrompt(opts) },
      ...(opts.conversationHistory ?? []).slice(-MAX_HISTORY).map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: buildUserPrompt(opts) },
    ];

    const response = await axios.post(
      `${configuredUrl}/api/chat`,
      {
        model: configuredModel,
        messages,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 50, // short responses
          stop: ["\n", ".", "?", "!"], // stop at sentence end
        },
      },
      { timeout: 30_000 },
    );

    const content = response.data?.message?.content as string | undefined;
    if (!content) {
      return { ok: true, text: buildFallbackResponse(opts), usedAI: false, error: "Empty response" };
    }

    // Clean up and limit to 4 words
    const cleaned = content.trim().replace(/\n/g, " ").replace(/\s+/g, " ").slice(0, 200);
    const words = cleaned.split(/\s+/);
    const limited = words.slice(0, 4).join(" ");

    logger.info({
      coin: opts.coinName,
      dev: opts.devUsername ?? "unknown",
      response: limited.slice(0, 80),
      model: configuredModel,
    }, "Ollama: generated response");

    return { ok: true, text: limited, usedAI: true, model: configuredModel };

  } catch (err) {
    const errMsg = (err as Error).message;
    logger.warn({ err: errMsg, url: configuredUrl }, "Ollama call failed — using fallback");
    return { ok: true, text: buildFallbackResponse(opts), usedAI: false, error: errMsg };
  }
}

/**
 * Fallback template-based responses when Ollama is unavailable.
 */
function buildFallbackResponse(opts: AIGenerateOptions): string {
  const { devMessage, devUsername, coinName, coinSymbol, ourUsername } = opts;
  const mc = opts.marketCap >= 1000
    ? `$${(opts.marketCap / 1000).toFixed(1)}K`
    : `$${opts.marketCap.toFixed(0)}`;

  if (devMessage) {
    // Dev replied — acknowledge and invite to TG
    const replies = [
      `déñse thát lóoks good yáll dm me`,
      `háppéns íf yáll want shóutouts jüst dm`,
      `í reckon thát cóól yáll jüst dm me`,
      `yáll jüst dm tg íf yáll wànna talk`,
      `thát lóoks fásty yáll dm me on tg`,
      `í gót a gróup thát cóuld hèlp yáll`,
      `yáll dm me on tg íf yáll wànna collab`,
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  } else {
    // First reach-out
    const drops = [
      `héy devs hów goes`,
      `í saw ${coinSymbol} on rádár`,
      `{symbol} lookïn good`,
      `yáll got tg?`,
      `í gotta tg`,
      `í run a gróup`,
      `dm me on tg`,
      `í been watchïn ${coinSymbol}`,
      `${coinSymbol} lookïn déñse`,
    ];
    return drops[Math.floor(Math.random() * drops.length)];
  }
}

/**
 * Detect Telegram username patterns in a message.
 * Returns the username if found, null otherwise.
 */
export function detectTelegramUsername(text: string): string | null {
  if (!text) return null;

  // Pattern 1: @username (no spaces, 5-32 chars, alphanumeric underscore)
  const atMatch = text.match(/@([a-zA-Z0-9_]{5,32})/);
  if (atMatch) return atMatch[1];

  // Pattern 2: t.me/username or telegram.me/username or tg.me/username
  const tgLinks = text.match(/(?:t\.me|telegram\.me|tg\.me)\/([a-zA-Z0-9_]{5,32})/i);
  if (tgLinks) return tgLinks[1];

  // Pattern 3: "reach me on telegram" followed by username
  const reachMatch = text.match(/(?:telegram|tg|reach|contact|dm|find me).*?@?([a-zA-Z0-9_]{5,32})/i);
  if (reachMatch && reachMatch[1].length >= 5) return reachMatch[1];

  return null;
}
