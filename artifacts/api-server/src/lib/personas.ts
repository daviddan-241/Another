/**
 * Bot personas — Texas big trader voice.
 *
 * RULES FOR ALL DROPS:
 *   1. Max 5-6 words. Natural and believable.
 *   2. Diacritics on words (á é í ó ú ñ ü) — looks human
 *   3. Real typos, missed punctuation — like actual typing
 *   4. No @ symbol — plain username like "TradeSignals"
 *   5. Texas slang — y'all, reckon, howdy, prob'ly
 *   6. 30+ variations so it NEVER repeats
 *
 * GOAL: Get the dev to DM you on Telegram / X / Discord.
 * The hook is: "i run a group that lists new coins and i want to feature yours"
 */
export type PersonaId = "texas" | "pro" | "genz" | "custom";

export interface Persona {
  id: PersonaId;
  name: string;
  blurb: string;
  drops: string[];
  delaysMs: number[];
  devReply: string;
  devReplyVariants: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// TEXAS BIG TRADER — main persona
// ──────────────────────────────────────────────────────────────────────────────
const TEXAS_DROPS: string[] = [
  // Opening — casual, just landed in the chat
  "héy devs í been watching this cóin",
  "{symbol} lookïn real gôod rn",
  "í see {symbol} on my rádár",
  "yáll this {symbol} cátch my éye",
  "í been watching {symbol} since éarly",
  "howdy devs thís {symbol} lookïn fásty",
  "yáll í tràde nü launches daily",
  "í reckon this cóin moving fást",
  "{symbol} lookïn déñse I'm in",
  "yo devs í been in sólana since 2019",

  // Value prop — what you offer
  "í run a tg gróup that feátures new mints",
  "í run a big tràding gróup yáll",
  "í post new cóins to my tg daily",
  "í got a gróup of dégens that buy launches",
  "í run a sóundin gróup on tg",
  "í got a tg called TradeSignals",
  "my gróup been buying new launches for years",
  "í push new cóins to 5k traders on tg",
  "í run a gróup that tracks live launches",
  "í got a big tg with active bùyers",

  // Soft ask — invite them to DM
  "yáll shóuld dm me on tg",
  "devs dm me if yáll wànna be féatured",
  "dm me if yáll want listings hèlp",
  "yáll can reach me on tg TradeSignals",
  "hit me up on tg if yáll intérested",
  "í can hèlp yáll get éyes on this",
  "yáll want shoutouts? dm me on tg",
  "í can list this for my gróup devs",
  "reach me on tg if yáll want hèlp",
  "í have buyers ready dm me yáll",

  // Urgency / FOMO variants
  "í been looking for a launch like this",
  "yáll this exactly what my gróup buys",
  "í been waiting for sómething like {symbol}",
  "yáll my gróup been asking for a coin like this",
  "í reckon this the one we been waiting for",
];

const TEXAS_DEV_REPLIES: string[] = [
  "déñse thát — yáll dm me on tg TradeSignals",
  "í hear yáll — dm me on tg íf yáll wànna talk",
  "thát lóoks real gôod — yáll just dm me",
  "yáll dm me on tg TradeSignals íf interested",
  "í reckon thát cóol — dm me yáll",
  "yáll sound séríous — hit me on tg",
  "háppéns — just dm me on tg TradeSignals",
  "í gót yáll — dm me when yáll ready",
  "dóñe — yáll dm me on tg and we'll talk",
  "í like what yáll got — dm me on tg",
  "thát lóoks déñse — yáll dm TradeSignals on tg",
  "í can hèlp — just dm me on tg yáll",
  "yáll dm me on tg when yáll ready to talk listings",
];

// ──────────────────────────────────────────────────────────────────────────────
// PRO — polished, professional community manager vibe
// ──────────────────────────────────────────────────────────────────────────────
const PRO_DROPS: string[] = [
  "hey devs — {symbol} looks promising",
  "I run a crypto community — would love to feature {symbol}",
  "we push new launches to our group daily",
  "I have an active TG with serious buyers",
  "interested in listing {symbol} in my group",
  "our community focuses on early launches like this",
  "I run TradeSignals on TG — we list new coins",
  "devs dm me — we could feature {symbol}",
  "I push new mints to 5k+ active traders",
  "been looking for a launch like {symbol}",
  "our group buys early — interested in {symbol}",
  "dm me on TG if you want TradeSignals coverage",
  "I help devs get their coin in front of buyers",
  "we have traders ready for launches like this",
  "dm me if you want exposure for {symbol}",
  "I run a listing group — would love to chat",
];

const PRO_DEV_REPLIES: string[] = [
  "great — dm me on TG: TradeSignals",
  "love to hear it — dm me on TG when ready",
  "perfect — reach me on TG at TradeSignals",
  "sounds good — hit me up on TG",
  "dm me on TG TradeSignals and we'll set it up",
];

// ──────────────────────────────────────────────────────────────────────────────
// GEN Z — crypto native, full degen energy
// ──────────────────────────────────────────────────────────────────────────────
const GENZ_DROPS: string[] = [
  "gm devs {symbol} is clean",
  "bro {symbol} on my radar fr",
  "i run a tg with active degens",
  "we push new mints every day",
  "my group been buying early launches",
  "dm me if yall want exposure",
  "i got a tg group that lists coins",
  "i push new launches to 5k traders",
  "yo {symbol} is exactly what my group buys",
  "i run TradeSignals on tg — we list coins",
  "devs dm me if you want listings",
  "we buy early — {symbol} looks good",
  "i can get {symbol} in front of buyers",
  "dm me on tg for the hookup",
  "my group asks for launches like this fr",
];

const GENZ_DEV_REPLIES: string[] = [
  "clean — dm me on tg TradeSignals",
  "fr fr — dm me on tg when you're ready",
  "let's go — hit me on tg TradeSignals",
  "bet — dm me on tg",
  "say less — dm me on tg TradeSignals",
];

// ──────────────────────────────────────────────────────────────────────────────
// CUSTOM — user writes their own
// ──────────────────────────────────────────────────────────────────────────────
const CUSTOM_DROPS: string[] = [
  "héy devs í been watchïng this cóin",
  "í run a tg gróup that lists new launches",
  "dm me if yáll want hèlp getting listed",
  "yáll shóuld dm me on tg",
];

const CUSTOM_DEV_REPLIES: string[] = [
  "yáll dm me on tg TradeSignals",
  "háppéns — just dm me on tg",
];

// ──────────────────────────────────────────────────────────────────────────────
export const PERSONAS: Record<PersonaId, Persona> = {
  texas: {
    id: "texas",
    name: "🤠 Texas Big Trader",
    blurb: "Degen from the Lone Star State — been in Solana since 2019, runs a TG group that lists new coins.",
    drops: TEXAS_DROPS,
    delaysMs: [5000, 28000, 65000, 110000],
    devReply: TEXAS_DEV_REPLIES[0],
    devReplyVariants: TEXAS_DEV_REPLIES,
  },

  pro: {
    id: "pro",
    name: "💼 Pro Outreach",
    blurb: "Polished community manager who lists early launches in their group.",
    drops: PRO_DROPS,
    delaysMs: [4000, 25000, 55000],
    devReply: PRO_DEV_REPLIES[0],
    devReplyVariants: PRO_DEV_REPLIES,
  },

  genz: {
    id: "genz",
    name: "🧬 Gen Z Crypto",
    blurb: "gm ser, full degen energy — runs an active TG with early buyers.",
    drops: GENZ_DROPS,
    delaysMs: [3500, 20000, 45000],
    devReply: GENZ_DEV_REPLIES[0],
    devReplyVariants: GENZ_DEV_REPLIES,
  },

  custom: {
    id: "custom",
    name: "✍ Custom",
    blurb: "Write your own drops and dev reply in Settings.",
    drops: CUSTOM_DROPS,
    delaysMs: [4000, 25000, 55000],
    devReply: CUSTOM_DEV_REPLIES[0],
    devReplyVariants: CUSTOM_DEV_REPLIES,
  },
};

export const PERSONA_LIST: Persona[] = Object.values(PERSONAS);

export function getPersona(id: string | undefined): Persona {
  if (id && (id in PERSONAS)) return PERSONAS[id as PersonaId];
  return PERSONAS.texas;
}

export function pickDrop(drops: string[], lastDrop: string | null): string {
  let pool = [...drops];
  if (lastDrop) pool = pool.filter(d => d !== lastDrop);
  if (pool.length === 0) pool = [...drops];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickDevReply(variants: string[]): string {
  return variants[Math.floor(Math.random() * variants.length)];
}
