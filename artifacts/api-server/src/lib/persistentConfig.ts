/**
 * Persistent config on disk — survives restarts.
 *
 * All AutoChat / Telegram / Jupiter settings live here as JSON.
 * Server reads on boot, the Settings UI writes through /api/config/autochat.
 *
 * Why not env vars?
 *   - You said: "add them in settings, not env, saves on restart".
 *   - Env vars require Render redeploys to change. JSON file is hot-reloadable.
 *
 * File location: <cwd>/pumpradar-config.json (gitignored by default).
 */
import fs from "fs";
import path from "path";
import { logger } from "./logger";

const CONFIG_PATH = path.resolve(process.cwd(), "pumpradar-config.json");

/** Generic deep-merge for plain JSON objects. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(patch)) {
    const bv = (base as Record<string, unknown>)[k];
    const pv = patch[k];
    if (isPlainObject(bv) && isPlainObject(pv)) {
      out[k] = deepMerge(bv, pv);
    } else if (pv !== undefined) {
      out[k] = pv;
    }
  }
  return out as T;
}

/** Load config from disk, merged with defaults. */
export function loadConfig<T extends object>(defaults: T): T {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      logger.info({ path: CONFIG_PATH }, "Loaded persisted config from disk");
      return deepMerge(defaults as Record<string, unknown>, parsed) as T;
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, path: CONFIG_PATH }, "Failed to load config from disk — using defaults");
  }
  return defaults;
}

/** Save config to disk. Atomic-ish (write to tmp, rename). */
export function saveConfig(cfg: Record<string, unknown>): void {
  try {
    const tmp = CONFIG_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmp, CONFIG_PATH);
    logger.debug({ path: CONFIG_PATH }, "Persisted config to disk");
  } catch (err) {
    logger.error({ err: (err as Error).message, path: CONFIG_PATH }, "Failed to save config to disk");
  }
}

/** Patch and persist in one call. */
export function patchAndPersist<T extends object>(base: T, patch: Record<string, unknown>): T {
  const merged = deepMerge(base as Record<string, unknown>, patch) as T;
  saveConfig(merged as unknown as Record<string, unknown>);
  return merged;
}

/** Returns the on-disk path so the UI can show "config saved to…" */
export function getConfigPath(): string { return CONFIG_PATH; }

/** Wipe the on-disk config (reset everything to defaults). */
export function resetConfig(): void {
  try {
    if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
    logger.warn("Config wiped — back to defaults");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Failed to wipe config");
  }
}
