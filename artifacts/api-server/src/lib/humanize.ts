/**
 * Humanization — makes the bot sound like a real Texas big trader, not a robot.
 *
 * WHAT REAL HUMANS DO:
 *   - Variable delays between messages (not fixed timers)
 *   - Real typing speed (20-38 WPM, different each time)
 *   - Show Telegram typing indicator while composing
 *   - Think pause before replying to someone
 *   - Short messages split into small chunks (max 4 words each)
 *   - Stop their sequence when the dev replies
 *
 * NO AI, NO EXTERNAL CALLS — pure math, works offline.
 */

function rand(min: number, max: number): number {
  if (max <= min) return min;
  const range = max - min + 1;
  return min + Math.floor(Math.random() * range);
}

export function humanDelay(baseMs: number, jitter = 0.4): number {
  if (baseMs <= 0) return 0;
  return Math.round(rand(baseMs * (1 - jitter), baseMs * (1 + jitter)));
}

export function humanTypingMs(text: string): number {
  if (!text) return 800;
  const words = text.trim().split(/\s+/).length;
  const wpm = rand(20, 38);
  const ms = (words / wpm) * 60_000;
  return Math.max(800, Math.round(ms));
}

export function pickDropCount(target: number, rng = Math.random): number {
  if (target <= 1) return 1;
  if (target === 2) return rng() < 0.65 ? 1 : 2;
  const r = rng();
  if (r < 0.45) return 1;
  if (r < 0.80) return 2;
  return 3;
}

export function interMessageGap(): number {
  return rand(1500, 6000);
}

export function thinkPause(): number {
  return rand(7000, 22000);
}

export function shouldReply(): boolean {
  return Math.random() < 0.72;
}

export function injectTypos(text: string): string {
  if (text.split(/\s+/).length < 3 || Math.random() > 0.25) return text;
  return text.split(/\s+/).map((word, i) => {
    if (i === 0 && /^[A-Z]/.test(word)) return word;
    if (/[áéíóúñü]/i.test(word)) return word;
    if (word.length < 3) return word;
    if (Math.random() > 0.28) return word;
    const typos: Array<[string, string]> = [
      ["í", "i"], ["é", "e"], ["á", "a"], ["th", "h"],
      ["the", "teh"], ["and", "nad"], ["that", "tat"],
      ["look", "lok"], ["good", "god"], ["want", "wnat"],
      ["devs", "dev"], ["yall", "yall"], ["going", "goin"],
      ["trading", "tradin"], ["dm", "d"], ["gotta", "gota"],
      ["really", "rilly"], ["about", "abot"], ["your", "yur"],
    ];
    const [from, to] = typos[Math.floor(Math.random() * typos.length)];
    return word.replace(from, to);
  }).join(" ");
}

export function splitIntoChunks(text: string, maxWords = 4): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return [text.trim()];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}
