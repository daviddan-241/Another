/**
 * Bot personas — Texas big trader voice.
 *
 * RULES FOR ALL DROPS:
 *   1. Max 4 words. No exceptions.
 *   2. Diacritics on every word that can have them (á é í ó ú ñ ü)
 *   3. Real typos, missed punctuation, dropped letters — like actual typing
 *   4. No @ symbol — plain username like "TradeSignals"
 *   5. Texas slang — y'all, reckon, howdy, prob'ly, dóñe, fásty
 *   6. Each drop has 25+ variations so it NEVER repeats the same way
 *
 * HOW IT WORKS:
 *   AutoChat picks 1-3 drops per coin, staggered with random delays.
 *   Dev reply triggers one of the devReplyVariants, sent with typing delay.
 *   Dev's reply is DM'd to user with the full conversation.
 *
 * NO AI, NO API CALLS — all template-based, works 100% offline.
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
// TEXAS BIG TRADER — the main one
// ──────────────────────────────────────────────────────────────────────────────
const TEXAS_DROPS: string[] = [
  // 1-word reach-outs (most common)
  "cómo vai",
  "héy devs hów goes",
  "{symbol} lookïn good",
  "í saw {symbol}",
  "{symbol} catch my éye",
  "í been watchïn {symbol}",
  "sé {symbol} goïng úp",
  "{symbol} lookïn déñse",
  "yo {symbol}",
  "í gt u",

  // 2-word drops
  "yáll got tg?",
  "í gotta tg",
  "í run a gróup",
  "í got a sóundin gróup",
  "dm me on tg",
  "í run a trádïn gróup",
  "í post nü coins",
  "whó runs thís",
  "álready in thís",
  "ím in this cóin",
  "í tràde nü mints",
  "í been in sól",
  "í run dégens",

  // 3-word drops
  "í gotta tg abóut it",
  "í got a tg calld",
  "í tráde nü mints",
  "í launch nü coins",
  "í got a gróup for devs",
  "ím a dégen tràder",
  "í been in sól since 2019",
  "í run a tg gróup",
  "yáll shóuld dm me",
  "í can hèlp yáll",
  "í post new mints",
  "í gt a sóundin gróup",

  // 4-word drops (rare)
  "í got a tg if yáll intrésted",
  "í run a tg that featurés nü coins",
  "yáll shóuld dm me on tg íf yáll want",
  "ím a dégen tràder from thé lone stár",
  "í been tràding sölana since 2019",
  "í post nü mints to my tg éveryday",

  // Messy fast-typing variants
  "yall gt tg??",
  "i gt tg",
  "i run grp",
  "dm me",
  "yall got tg??",
  "devs dm me",
  "i gottta tg",
  "yall shood dm me",
  "i can help w listings",
  "i post new mints lots",
];

const TEXAS_DEV_REPLIES: string[] = [
  "déñse thát lóoks good yáll dm me",
  "háppéns íf yáll want shóutouts jüst dm",
  "í reckon thát cóól yáll jüst dm me",
  "yáll jüst dm tg íf yáll wànna talk",
  "thát lóoks fásty yáll dm me on tg",
  "í gót a gróup thát cóuld hèlp yáll",
  "dóñe thát lóoks góod jüst dm me",
  "yáll dm me on tg íf yáll wànna collab",
  "háppéns íf yáll nèed listíngs help",
  "í reckon thát cóuld wórk yáll jüst dm",
  "yáll dm tg íf yáll wànna shówcase",
  "thát lóoks déñse jüst dm me",
  "í can help yáll jüst dm on tg",
];

// ──────────────────────────────────────────────────────────────────────────────
// PRO — professional but still human
// ──────────────────────────────────────────────────────────────────────────────
const PRO_DROPS: string[] = [
  "héy devs lóoks good",
  "{symbol} tràding wéll",
  "í got a tg",
  "í run a gróup",
  "dm me on tg",
  "í can hèlp",
  "yáll got tg?",
  "í post nü launches",
  "í got a sóundin gróup",
  "whó runs thís projèct",
  "devs dm me",
  "í can list yáll",
  "yáll shóuld dm",
  "í got a tg for devs",
  "í tràde nü mints",
  "yáll lóoks good",
];

const PRO_DEV_REPLIES: string[] = [
  "yáll jüst dm me on tg",
  "íf yáll nèed hèlp jüst dm",
  "thát cóól yáll dm me",
  "háppéns íf yáll wànna collab",
  "yáll jüst dm tg íf yáll wànna talk",
];

// ──────────────────────────────────────────────────────────────────────────────
// GEN Z — crypto native, ultra casual
// ──────────────────────────────────────────────────────────────────────────────
const GENZ_DROPS: string[] = [
  "gm devs {symbol}",
  "gm {symbol} lóoks fásty",
  "í got tg?",
  "í run a gróup",
  "dm me tg",
  "í gottta tg",
  "yall dm me",
  "i post new mints",
  "{symbol} góing up",
  "yall rly lóoks good",
  "í been in sölana",
  "devs yall got tg",
  "i got a gróup",
  "í tràde nü mints",
];

const GENZ_DEV_REPLIES: string[] = [
  "gm thát lóoks fásty dm me",
  "yall dm me on tg if yall wànna collab",
  "yall jüst dm tg íf yall wànna talk",
  "háppéns dm me on tg",
  "yall jüst dm íf yall need hèlp",
];

// ──────────────────────────────────────────────────────────────────────────────
// CUSTOM — user writes their own
// ──────────────────────────────────────────────────────────────────────────────
const CUSTOM_DROPS: string[] = [
  "gm devs lóoks good",
  "í got a tg",
  "dm me on tg",
  "í can hèlp w listings",
];

const CUSTOM_DEV_REPLIES: string[] = [
  "yáll dm me on tg",
  "háppéns jüst dm me",
];

// ──────────────────────────────────────────────────────────────────────────────
export const PERSONAS: Record<PersonaId, Persona> = {
  texas: {
    id: "texas",
    name: "🤠 Texas Big Trader",
    blurb: "Degen from the Lone Star State — been in Solana since 2019, talks like a real trader with accent marks and typos.",
    drops: TEXAS_DROPS,
    delaysMs: [4000, 25000, 55000, 90000],
    devReply: TEXAS_DEV_REPLIES[0],
    devReplyVariants: TEXAS_DEV_REPLIES,
  },

  pro: {
    id: "pro",
    name: "💼 Pro Outreach",
    blurb: "Polite, clean, still has human touches.",
    drops: PRO_DROPS,
    delaysMs: [3500, 22000, 50000],
    devReply: PRO_DEV_REPLIES[0],
    devReplyVariants: PRO_DEV_REPLIES,
  },

  genz: {
    id: "genz",
    name: "🧬 Gen Z Crypto",
    blurb: "gm ser, full degen energy.",
    drops: GENZ_DROPS,
    delaysMs: [3000, 18000, 40000],
    devReply: GENZ_DEV_REPLIES[0],
    devReplyVariants: GENZ_DEV_REPLIES,
  },

  custom: {
    id: "custom",
    name: "✍ Custom",
    blurb: "Write your own drops and dev reply in Settings.",
    drops: CUSTOM_DROPS,
    delaysMs: [3500, 22000, 50000],
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
