/**
 * Ollama AI — Texas degen trader conversation engine.
 *
 * REAL CONVERSATION FLOW:
 *   1. Opening → casual greet + about me
 *   2. Question phase → ask about coin, what they're building, goals
 *   3. Rapport phase → relate, show understanding, build trust
 *   4. Contact ask → do you have TG/X/Discord?
 *   5. Follow up → if yes, ask "have you messaged me?" → detect confirmation
 *   6. Alert → send me DM with full conversation + contact + coin details
 *
 * PUMP.FUN SAFE:
 *   - NO @ symbols (pump.fun blocks them)
 *   - Short messages (4-8 words per send)
 *   - Natural Texas slang
 *   - Diacritics on words that can have them
 *
 * WORKS OFFLINE:
 *   - If Ollama not available, falls back to scripted template conversation
 */
import axios from "axios";
import { logger } from "./logger";
import type { ScannedCoin } from "./scanner";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2:3b";

// ── Conversation Phases ─────────────────────────────────────────────────────
export type ConversationPhase =
  | "opening"       // First message, casual reach-out
  | "questioning"   // Asking about the coin/project
  | "rapport"       // Building trust, relating to them
  | "contact_ask"   // Asking about Telegram/X/Discord
  | "confirming"    // "Have you messaged me?"
  | "done";         // Done, watching for more

export interface OllamaConfig {
  url: string;
  model: string;
  enabled: boolean;
}

export interface CoinContext {
  coinName: string;
  coinSymbol: string;
  coinMint: string;
  marketCap: number;
  mcFormatted: string;
  creatorAddress: string;
  creatorWalletAge: number | null; // days
  creatorVolume: number | null;    // SOL volume
  platform: string;
  pumpUrl: string;
  hasDiscord: boolean;
  discordUrl: string | null;
}

interface ConversationState {
  phase: ConversationPhase;
  messageCount: number;
  askedAboutCoin: boolean;
  askedAboutGoals: boolean;
  askedAboutTG: boolean;
  devConfirmedTG: boolean;
  devTGUsername: string | null;
  devXUsername: string | null;
  devDiscord: string | null;
  devReplied: boolean;
  lastDevMessage: string;
  lastOurMessage: string;
}

let configuredUrl = DEFAULT_OLLAMA_URL;
let configuredModel = DEFAULT_MODEL;
let isEnabled = false;

export function configureOllama(cfg: OllamaConfig): void {
  configuredUrl = cfg.url?.trim() || DEFAULT_OLLAMA_URL;
  configuredModel = cfg.model?.trim() || DEFAULT_MODEL;
  isEnabled = cfg.enabled;
  logger.info({ url: configuredUrl, model: configuredModel, enabled: isEnabled }, "Ollama configured");
}

export function getOllamaConfig(): OllamaConfig {
  return { url: configuredUrl, model: configuredModel, enabled: isEnabled };
}

/** Create a new conversation state for a coin */
export function newConversationState(): ConversationState {
  return {
    phase: "opening",
    messageCount: 0,
    askedAboutCoin: false,
    askedAboutGoals: false,
    askedAboutTG: false,
    devConfirmedTG: false,
    devTGUsername: null,
    devXUsername: null,
    devDiscord: null,
    devReplied: false,
    lastDevMessage: "",
    lastOurMessage: "",
  };
}

/** Detect if dev confirmed they messaged us */
function devConfirmedMessaging(text: string): boolean {
  const t = text.toLowerCase();
  const patterns = [
    /i\s*(already\s*)?(did|msgd|messaged|msg|sent|hit)\s*(you|up)/i,
    /yep\s*(done|did|msgd|sent)/i,
    /yeah?\s*(did|done|msgd|sent)/i,
    /already\s*(did|msgd|sent)/i,
    /yes\s*(i\s*)?(did|msgd|sent)/i,
    /done\s*(that|it|did)/i,
    /sent\s*(you|a\s*)?(msg|message)/i,
    /hit\s*(you|up)/i,
    /yep\s*(done|did)/i,
    /yea\s*(done|did)/i,
    /sure\s*(did|did\s*it)/i,
    /on\s*it/i,
    /sending\s*(now|it)/i,
    /just\s*(did|sent|msgd)/i,
  ];
  return patterns.some(p => p.test(t));
}

/** Detect contact info from dev's message */
function detectContactInfo(text: string): { tg: string | null; x: string | null; discord: string | null } {
  // Telegram detection
  const tgAt = text.match(/@([a-zA-Z0-9_]{5,32})/);
  const tgMe = text.match(/(?:t\.me|telegram\.me|tg\.me)\/([a-zA-Z0-9_]{5,32})/i);

  // X/Twitter detection
  const xAt = text.match(/(?:^|\s)@([a-zA-Z0-9_]{1,15})/);
  // Filter out telegram-like patterns that xAt might catch
  const tgUsernames = ["telegram", "tele", "tg_", "tg_", "admin", "support", "bot", "channel"];
  const filteredX = xAt && !tgUsernames.some(u => xAt[1].toLowerCase().includes(u)) ? xAt : null;

  // Discord detection
  const discords = text.match(/(?:discord|disc)\s*[:.]?\s*([a-zA-Z0-9_#]{3,32})/i);

  return {
    tg: tgAt ? tgAt[1] : tgMe ? tgMe[1] : null,
    x: filteredX ? filteredX[1] : null,
    discord: discords ? discords[1] : null,
  };
}

/** Build the system prompt for the conversation */
function buildSystemPrompt(
  myTG: string,
  myX: string,
  myDiscord: string,
  ctx: CoinContext,
  state: ConversationState,
  history: Array<{role: string; content: string}>,
): string {
  const walletInfo = ctx.creatorWalletAge
    ? `Creator wallet is ${ctx.creatorWalletAge} days old — shows they are serious`
    : "Creator wallet is brand new";
  const volumeInfo = ctx.creatorVolume
    ? `Creator has traded ~${ctx.creatorVolume.toFixed(1)} SOL onchain — shows they are active`
    : "Creator has limited onchain history";
  const mcInfo = `Current market cap: ${ctx.mcFormatted}`;

  const phaseInstruction = (() => {
    switch (state.phase) {
      case "opening":
        return `PHASE: OPENING — Send ONE short casual message (4-8 words). Introduce yourself as a Solana degen who found their coin. Use Texas slang. Diacritics on words that can have them (í á é ó ú ñ). NO @ symbol — just say your name/numbers naturally. Example: "hey devs í been watchïn this cóin lookïn fásty"`;
      case "questioning":
        return `PHASE: QUESTIONING — Ask ONE short question about the coin or project (4-8 words). Ask about what they're building, their roadmap, or what they plan to do with it. Be curious but not pushy. Use Texas slang with diacritics. NO @ symbols.`;
      case "rapport":
        return `PHASE: RAPPORT — Respond to what the dev said, build rapport. Relate to what they shared. Show genuine interest. One short message (4-8 words). Use Texas slang. NO @ symbols. You can mention you have a community or TG group that helps coins get visibility.`;
      case "contact_ask":
        return `PHASE: CONTACT ASK — Ask ONE short question about how to reach them. Use natural phrasing: "yáll got tg or x? íf not discord works too" or "how í reach yáll best?" Keep it 4-8 words. NO @ symbols.`;
      case "confirming":
        return `PHASE: CONFIRMING — Ask one short question to confirm they messaged you: "yáll already messaged me on tg?" or "did yáll hit me up on tg?" 4-8 words. NO @ symbols.`;
      case "done":
        return `PHASE: DONE — Don't send any more messages. The dev is engaged, you've asked for contact, now just watch. If they reply, just acknowledge briefly (2-4 words). No more outreach needed.`;
    }
  })();

  return `You are a Texas crypto degen trader — been in Solana since 2019, talk like a real trader from the Lone Star State. You found a new coin and you're chatting with the dev in the pump.fun livestream.

COIN INFO:
- Name: ${ctx.coinName}
- Symbol: ${ctx.coinSymbol}
- Market Cap: ${ctx.mcFormatted}
- ${walletInfo}
- ${volumeInfo}
- Pump.fun URL: ${ctx.pumpUrl}

YOUR CONTACT INFO:
- Telegram: ${myTG}  (just say the name like "TradeSignals" or "TradeSigs" — NO @ symbol)
- X: ${myX}
- Discord: ${myDiscord}

RULES (FOLLOW ALWAYS):
- Every message is 4-8 words maximum. Short sentences.
- Use diacritics on words that can have them: í á é ó ú ñ ü
- Real typos: lookïn, gróup, yáll, déñse, sóundin, reckon, howdy, fásty, gótta, prób'ly
- NEVER use @ symbol — pump.fun blocks it. Just say names naturally like "hit me on TradeSignals"
- Sound confident, helpful, like you've been doing this for years
- Don't push hard — be friendly, let the conversation flow naturally
- If the dev seems uninterested, back off — send one more friendly message then stop
- Keep asking questions that show genuine interest in their project

${phaseInstruction}

CONVERSATION HISTORY (for context):
${history.slice(-6).map(m => `${m.role === "assistant" ? "YOU" : "DEV"}: ${m.content}`).join("\n")}

Respond with ONLY your message. Nothing else. Max 8 words.`;
}

function buildUserPrompt(devMessage: string, state: ConversationState): string {
  if (state.phase === "opening") {
    return `Start the conversation. This is the first message to the ${state.messageCount === 0 ? "dev" : "dev"}. Keep it very casual and short. 4-8 words.`;
  }
  return `The dev just said: "${devMessage.slice(0, 300)}"\n\nWhat do you say back? Keep it 4-8 words. Follow the phase rules.`;
}

/** Should we advance to the next phase based on message count? */
function shouldAdvancePhase(state: ConversationState): boolean {
  switch (state.phase) {
    case "opening":    return state.messageCount >= 2;
    case "questioning": return state.messageCount >= 4;
    case "rapport":     return state.messageCount >= 6;
    case "contact_ask": return state.messageCount >= 8;
    case "confirming":  return state.devConfirmedTG;
    default:            return false;
  }
}

/** Advance phase based on what happened */
export function advancePhase(state: ConversationState, myTG: string, myX: string, myDiscord: string): ConversationPhase {
  switch (state.phase) {
    case "opening":
      return "questioning";
    case "questioning":
      return state.askedAboutGoals ? "rapport" : "questioning";
    case "rapport":
      return "contact_ask";
    case "contact_ask":
      return "confirming";
    case "confirming":
      return state.devConfirmedTG ? "done" : "confirming";
    default:
      return state.phase;
  }
}

/** Main AI generate function */
export interface GenerateResult {
  ok: boolean;
  text: string;
  usedAI: boolean;
  model?: string;
  advanceTo: ConversationPhase;
  isConfirmation: boolean;
  contactInfo: { tg: string | null; x: string | null; discord: string | null };
  isAlertTrigger: boolean;
}

export async function generateConversationResponse(
  myTG: string,
  myX: string,
  myDiscord: string,
  ctx: CoinContext,
  state: ConversationState,
  history: Array<{role: string; content: string}>,
  devMessage?: string,
): Promise<GenerateResult> {

  // Check if this is a confirmation message
  const isConfirmation = devMessage ? devConfirmedMessaging(devMessage) : false;

  // Detect contact info from dev's message
  const contactInfo = devMessage ? detectContactInfo(devMessage) : { tg: null, x: null, discord: null };

  // Determine if we should trigger an alert
  const isAlertTrigger = isConfirmation || (contactInfo.tg && contactInfo.tg !== myTG);

  // Determine next phase
  let nextPhase = state.phase;
  if (devMessage && !state.devReplied) {
    state.devReplied = true;
  }
  if (shouldAdvancePhase(state)) {
    nextPhase = advancePhase(state, myTG, myX, myDiscord);
  }
  if (isConfirmation) {
    nextPhase = "done";
  }

  // Build actual state with updates
  const currentState: ConversationState = {
    ...state,
    phase: nextPhase,
    devConfirmedTG: isConfirmation ? true : state.devConfirmedTG,
    devTGUsername: contactInfo.tg || state.devTGUsername,
    devXUsername: contactInfo.x || state.devXUsername,
    devDiscord: contactInfo.discord || state.devDiscord,
  };

  // If done phase, don't generate a message
  if (currentState.phase === "done") {
    return {
      ok: true,
      text: "",
      usedAI: false,
      advanceTo: "done",
      isConfirmation,
      contactInfo,
      isAlertTrigger,
    };
  }

  // Try Ollama first
  if (isEnabled && configuredUrl) {
    try {
      const response = await axios.post(
        `${configuredUrl}/api/chat`,
        {
          model: configuredModel,
          messages: [
            { role: "system", content: buildSystemPrompt(myTG, myX, myDiscord, ctx, currentState, history) },
            ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
            ...(devMessage ? [{ role: "user", content: buildUserPrompt(devMessage, currentState) }] : []),
          ],
          stream: false,
          options: {
            temperature: 0.8,
            num_predict: 60,
          },
        },
        { timeout: 30_000 },
      );

      const content = (response.data?.message?.content as string | undefined) ?? "";
      if (content) {
        // Limit to ~60 chars (roughly 4-8 words)
        const limited = content.trim().replace(/\n+/g, " ").replace(/\s+/g, " ").slice(0, 80);
        const words = limited.split(/\s+/);
        const truncated = words.slice(0, 8).join(" ");

        logger.info({
          coin: ctx.coinName,
          phase: currentState.phase,
          response: truncated.slice(0, 60),
          model: configuredModel,
        }, "Ollama: conversation response");

        return {
          ok: true,
          text: truncated,
          usedAI: true,
          model: configuredModel,
          advanceTo: currentState.phase,
          isConfirmation,
          contactInfo,
          isAlertTrigger,
        };
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "Ollama call failed — using fallback");
    }
  }

  // FALLBACK: Template-based conversation
  const text = templateFallback(myTG, myX, myDiscord, ctx, currentState, devMessage);
  return {
    ok: true,
    text,
    usedAI: false,
    advanceTo: currentState.phase,
    isConfirmation,
    contactInfo,
    isAlertTrigger,
  };
}

/** Template fallback when Ollama is not available */
function templateFallback(
  myTG: string,
  myX: string,
  myDiscord: string,
  ctx: CoinContext,
  state: ConversationState,
  devMessage?: string,
): string {
  const { phase } = state;
  const sym = ctx.coinSymbol;

  if (phase === "opening") {
    const msgs = [
      `héy devs í been watching ${sym} lookïn fásty`,
      `yo í saw ${sym} on my rádár`,
      `howdy devs this ${sym} catch my éye`,
      `í reckon ${sym} cóuld móve real fást`,
      `yáll this ${sym} lookïn déñse í'm in`,
      `héy í run a tg gróup — ${sym} lóoks good`,
      `í been in sólana since 2019 — ${sym} is exactly what we look for`,
      `yo devs í run a cóin listing gróup on tg`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  if (phase === "questioning") {
    const msgs = [
      `yáll what yáll plánning for ${sym}?`,
      `devs what's the roadmap for ${sym}?`,
      `háppéns yáll got a community behind this?`,
      `yáll building anything around ${sym}?`,
      `í reckon ${sym} cóuld pop — what yáll think?`,
      `devs do yáll have discord or just tg?`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  if (phase === "rapport") {
    const msgs = devMessage ? [
      `déñse í hear yáll — í can hèlp with that`,
      `yáll knów what yáll doing í can tell`,
      `í reckon yáll dóñe the right thing there`,
      `that makes sense — í run a gróup that lists exactly this`,
      `í can gét eyes on ${sym} — my gróup loves early launches`,
      `yáll sound séríous — í want to feature this for my traders`,
    ] : [
      `í reckon yáll got something real here`,
      `this exactly what my gróup been waiting for`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  if (phase === "contact_ask") {
    const msgs = [
      `yáll got tg? íf not x or discord works too`,
      `how í best reach yáll — tg or x?`,
      `devs dm me on tg ${myTG} íf yáll wanna talk`,
      `yáll dm me on tg íf yáll interested in a listing`,
      `íf yáll want my gróup to feature ${sym} dm me on tg`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  if (phase === "confirming") {
    const msgs = [
      `yáll already hit me on tg ${myTG}?`,
      `did yáll dm me on tg yet?`,
      `yáll messaged me on tg ${myTG} already?`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  // Done phase — brief ack
  if (devMessage) {
    const acks = ["déñse", "í gót yáll", "háppéns", "good deal", "that wórks"];
    return acks[Math.floor(Math.random() * acks.length)];
  }

  return "";
}
