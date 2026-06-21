import React, { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import {
  isPushSupported, subscribeToPush, unsubscribeFromPush,
  getCurrentSubscription, sendTestPush as sendTestPushFn,
} from "@/lib/push";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// Bookmarklet that extracts the Privy JWT from pump.fun's localStorage on iOS Safari.
// Saves as a bookmark, then run on pump.fun to auto-extract and copy the token.
const BOOKMARKLET = `javascript:(function()%7Bvar%20t%3D''%3Bfunction%20find(v%2Cd)%7Bif(d%3E4%7C%7Ct)return%3Bif(typeof%20v%3D%3D%3D'string'%26%26v.length%3E50%26%26v.startsWith('eyJ')%26%26v.split('.').length%3D%3D%3D3)%7Bt%3Dv%3Breturn%3B%7Dif(typeof%20v%3D%3D%3D'object'%26%26v!%3D%3Dnull)%7Bfor(var%20k%20in%20v)%7Bif(t)return%3Bfind(v%5Bk%5D%2Cd%2B1)%3B%7D%7D%7Dfunction%20scan(s)%7Btry%7Bvar%20keys%3DObject.keys(s)%3Bfor(var%20i%3D0%3Bi%3Ckeys.length%3Bi%2B%2B)%7Bif(t)return%3Bvar%20v%3Ds%5Bkeys%5Bi%5D%5D%3Bfind(v%2C0)%3Bif(!t)%7Btry%7Bfind(JSON.parse(v)%2C0)%3B%7Dcatch(e)%7B%7D%7D%7D%7Dcatch(e)%7B%7D%7Dscan(localStorage)%3Bif(!t)scan(sessionStorage)%3Bif(t)%7Bprompt('Your%20pump.fun%20token%20%E2%80%94%20select%20ALL%20then%20copy%3A'%2Ct)%3B%7Delse%7Balert('Token%20not%20found.%0A%0AMake%20sure%20you%20are%20logged%20into%20pump.fun%20in%20this%20same%20browser%20tab%2C%20then%20try%20again.')%3B%7D%7D)()`;

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Settings"
        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #1a2840", color: "#60a5fa", WebkitTapHighlightColor: "transparent" }}
        aria-label="Open settings"
      >
        <Settings className="w-4 h-4" />
      </button>
      {open && <SettingsOverlay onClose={() => setOpen(false)} />}
    </>
  );
}

export function SettingsOverlay({ onClose }: { onClose: () => void }) {
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const {
    privateKey, setPrivateKey,
    operatorSynced, setOperatorKey,
    maxDevCoins, setMaxDevCoins,
    notificationsEnabled, setNotificationsEnabled,
    telegramChatId, setTelegramChatId,
    myProfile, profileLoading, refreshProfile,
  } = useSettings();

  const [keyDraft, setKeyDraft]   = useState(privateKey);
  const [showKey, setShowKey]     = useState(false);
  const [keySaved, setKeySaved]   = useState(false);
  const [tgDraft, setTgDraft]     = useState(telegramChatId);
  const [tgTesting, setTgTesting] = useState(false);
  const [tgMsg, setTgMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [tgSaved, setTgSaved]     = useState(false);

  // Push notifications
  const pushSupported = typeof window !== "undefined" && isPushSupported();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!pushSupported) return;
    void getCurrentSubscription().then(sub => setPushEnabled(!!sub));
  }, [pushSupported]);

  const togglePush = async () => {
    setPushLoading(true);
    setPushMsg(null);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
        setPushMsg({ ok: true, text: "Push notifications disabled." });
      } else {
        const result = await subscribeToPush("__global__");
        if (result.ok) {
          setPushEnabled(true);
          setPushMsg({ ok: true, text: "✓ Push notifications enabled! You'll be notified on new coin activity." });
        } else {
          setPushMsg({ ok: false, text: result.error ?? "Could not enable push notifications." });
        }
      }
    } finally {
      setPushLoading(false);
    }
  };

  const testPush = async () => {
    setPushLoading(true);
    setPushMsg(null);
    try {
      const result = await sendTestPushFn();
      setPushMsg({ ok: result.ok, text: result.ok ? "✓ Test push sent — check your notifications!" : (result.error ?? "Failed to send.") });
    } finally {
      setPushLoading(false);
    }
  };

  const [sessionToken, setSessionToken] = useState("");
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionMsg, setSessionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [showBookmarkletSteps, setShowBookmarkletSteps] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);

  // Auto-link state
  const [autoLinking, setAutoLinking] = useState(false);
  const [autoLinkResult, setAutoLinkResult] = useState<{ ok: boolean; text: string } | null>(null);

  // ── AutoChat config (server-side; persisted to disk) ───────────────────
  const [autoChat, setAutoChat] = useState<{
    enabled: boolean;
    dryRun: boolean;
    humanize: boolean;
    language: "auto" | "en" | "es" | "fr" | "de";
    persona: "texas" | "pro" | "genz" | "custom";
    customDrops: string[];
    customDelaysMs: number[];
    customDevReply: string;
    lockOnNew: boolean;
    devMode: boolean;
    telegramOnDev: boolean;
    buyRequireApproval: boolean;
    watchAfterStreamEnd: boolean;
    buyAmountSol: number;
    minMc: number;
    maxPerCoin: number;
    maxConcurrentChats: number;
    hasOperatorKey: boolean;
    operatorPubkey: string;
    operatorSolBalance: number | null;
    configPath: string;
    personas: Array<{ id: string; name: string; blurb: string }>;
    active: Array<{
      mint: string; name: string; symbol: string;
      detectedAt: number; messagesSent: number;
      streamEndedAt: number | null; awaitingApproval: boolean; roomLocked: boolean;
    }>;
    approvalPending: Array<{ mint: string; chatId: string; messageId: number }>;
  }>({
    enabled: false, dryRun: false, humanize: true, language: "auto",
    persona: "texas",
    customDrops: [], customDelaysMs: [], customDevReply: "",
    lockOnNew: true, devMode: true, telegramOnDev: true,
    buyRequireApproval: true, watchAfterStreamEnd: true,
    buyAmountSol: 0.02, minMc: 0, maxPerCoin: 3, maxConcurrentChats: 5,
    hasOperatorKey: false, operatorPubkey: "",
    operatorSolBalance: null, configPath: "",
    personas: [],
    active: [], approvalPending: [],
  });
  const [autoChatLoading, setAutoChatLoading] = useState(false);
  const [autoChatMsg, setAutoChatMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [autoChatDirty, setAutoChatDirty] = useState(false);

  // ── Browser language detect (English default per user request) ─────────
  const detectedLang: "en" | "es" | "fr" | "de" = (() => {
    if (typeof navigator === "undefined") return "en";
    const raw = (navigator.language || "en").toLowerCase().slice(0, 2);
    if (raw === "es" || raw === "fr" || raw === "de") return raw;
    return "en";
  })();

  // ── Tab navigation ──────────────────────────────────────────────────────
  const [settingsTab, setSettingsTab] = useState<"wallet" | "autochat" | "alerts" | "filters">("wallet");

  // ── Test Send state ──
  const [testMint, setTestMint] = useState("");
  const [testMessage, setTestMessage] = useState("🤖 test from PumpRadar — if you see this, posting works!");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string; txLink?: string } | null>(null);

  const refreshAutoChat = async () => {
    setAutoChatLoading(true);
    try {
      const r = await fetch(`${BASE}/api/config/autochat`, { cache: "no-store" });
      const text = await r.text();
      let j: Partial<typeof autoChat> & { config?: typeof autoChat } = {};
      try { j = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
      if (r.ok) {
        const cfg = (j.config ?? j) as Partial<typeof autoChat>;
        setAutoChat(prev => ({
          ...prev,
          enabled:               cfg.enabled               ?? prev.enabled,
          dryRun:                cfg.dryRun                ?? prev.dryRun,
          humanize:              cfg.humanize              ?? prev.humanize,
          language:              (cfg.language ?? prev.language) as typeof prev.language,
          persona:               (cfg.persona ?? prev.persona) as typeof prev.persona,
          customDrops:           Array.isArray(cfg.customDrops) ? cfg.customDrops : prev.customDrops,
          customDelaysMs:        Array.isArray(cfg.customDelaysMs) ? cfg.customDelaysMs : prev.customDelaysMs,
          customDevReply:        cfg.customDevReply ?? prev.customDevReply,
          lockOnNew:             cfg.lockOnNew             ?? prev.lockOnNew,
          devMode:               cfg.devMode               ?? prev.devMode,
          telegramOnDev:         cfg.telegramOnDev         ?? prev.telegramOnDev,
          buyRequireApproval:    cfg.buyRequireApproval    ?? prev.buyRequireApproval,
          watchAfterStreamEnd:   cfg.watchAfterStreamEnd   ?? prev.watchAfterStreamEnd,
          buyAmountSol:          cfg.buyAmountSol          ?? prev.buyAmountSol,
          minMc:                 cfg.minMc                 ?? prev.minMc,
          maxPerCoin:            cfg.maxPerCoin            ?? prev.maxPerCoin,
          maxConcurrentChats:    cfg.maxConcurrentChats    ?? prev.maxConcurrentChats,
          hasOperatorKey:        cfg.hasOperatorKey        ?? prev.hasOperatorKey,
          operatorPubkey:        cfg.operatorPubkey        ?? prev.operatorPubkey,
          operatorSolBalance:    cfg.operatorSolBalance    ?? prev.operatorSolBalance,
          configPath:            cfg.configPath ?? prev.configPath,
          personas:              Array.isArray(cfg.personas) ? cfg.personas : prev.personas,
          active:                Array.isArray(cfg.active) ? cfg.active : prev.active,
          approvalPending:       Array.isArray(cfg.approvalPending) ? cfg.approvalPending : prev.approvalPending,
        }));
      }
    } catch { /* swallow */ }
    finally { setAutoChatLoading(false); }
  };

  useEffect(() => { void refreshAutoChat(); }, []);

  const saveAutoChat = async () => {
    setAutoChatLoading(true);
    setAutoChatMsg(null);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const r = await fetch(`${BASE}/api/config/autochat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled:               autoChat.enabled,
          dryRun:                autoChat.dryRun,
          humanize:              autoChat.humanize,
          language:              autoChat.language,
          persona:               autoChat.persona,
          customDrops:           autoChat.customDrops,
          customDelaysMs:        autoChat.customDelaysMs,
          customDevReply:        autoChat.customDevReply,
          lockOnNew:             autoChat.lockOnNew,
          devMode:               autoChat.devMode,
          telegramOnDev:         autoChat.telegramOnDev,
          buyRequireApproval:    autoChat.buyRequireApproval,
          watchAfterStreamEnd:   autoChat.watchAfterStreamEnd,
          buyAmountSol:          autoChat.buyAmountSol,
          minMc:                 autoChat.minMc,
          maxPerCoin:            autoChat.maxPerCoin,
          maxConcurrentChats:    autoChat.maxConcurrentChats,
          operatorPrivateKey:    privateKey.trim() || undefined,
        }),
        signal: ctrl.signal,
      });
      const text = await r.text();
      let j: { ok?: boolean; error?: string; operatorPubkey?: string } = {};
      try { j = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
      if (r.ok && j.ok) {
        setAutoChatMsg({ ok: true, text: j.operatorPubkey
          ? `✓ Saved — bot operator: ${j.operatorPubkey.slice(0, 6)}…${j.operatorPubkey.slice(-4)}`
          : "✓ Saved" });
        setAutoChatDirty(false);
        await refreshAutoChat();
      } else {
        setAutoChatMsg({ ok: false, text: j.error ?? `Server error ${r.status}` });
      }
    } catch (e) {
      const err = e as Error;
      setAutoChatMsg({
        ok: false,
        text: err.name === "AbortError"
          ? "Timed out — try again."
          : `Network error: ${err.message}`,
      });
    } finally {
      clearTimeout(tid);
      setAutoChatLoading(false);
    }
  };

  const resetAutoChat = async () => {
    if (!confirm("Reset ALL AutoChat settings to defaults? This wipes pumpradar-config.json on the server.")) return;
    setAutoChatLoading(true);
    try {
      const r = await fetch(`${BASE}/api/config/autochat/reset`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && (j as { ok?: boolean }).ok) {
        setAutoChatMsg({ ok: true, text: "✓ Reset to defaults" });
        setAutoChatDirty(false);
        await refreshAutoChat();
      } else {
        setAutoChatMsg({ ok: false, text: "Reset failed" });
      }
    } catch {
      setAutoChatMsg({ ok: false, text: "Network error during reset" });
    } finally {
      setAutoChatLoading(false);
    }
  };

  const sendTestMessage = async () => {
    const mint = testMint.trim();
    const msg  = testMessage.trim();
    if (!mint) {
      setTestResult({ ok: false, text: "Paste a coin mint address to test against." });
      return;
    }
    if (!msg) {
      setTestResult({ ok: false, text: "Message is empty." });
      return;
    }
    setTestSending(true);
    setTestResult(null);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const r = await fetch(`${BASE}/api/config/testsend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, message: msg, privateKey: privateKey.trim() || undefined }),
        signal: ctrl.signal,
      });
      const text = await r.text();
      let j: { ok?: boolean; postedToPumpFun?: boolean; error?: string; id?: string } = {};
      try { j = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
      if (r.ok && j.postedToPumpFun) {
        setTestResult({ ok: true, text: `✓ Posted to real pump.fun — message ID: ${j.id?.slice(0, 16) ?? "ok"}` });
        await refreshAutoChat();
      } else {
        setTestResult({ ok: false, text: `❌ pump.fun rejected: ${j.error ?? `HTTP ${r.status}`}` });
      }
    } catch (e) {
      const err = e as Error;
      setTestResult({
        ok: false,
        text: err.name === "AbortError" ? "Timed out (30s) — pump.fun didn't ack." : `Network error: ${err.message}`,
      });
    } finally {
      clearTimeout(tid);
      setTestSending(false);
    }
  };

  const keyChanged = keyDraft.trim() !== privateKey;

  const [operatorSaving, setOperatorSaving] = useState(false);
  const [operatorResult, setOperatorResult] = useState<{ ok: boolean; text: string } | null>(null);

  const saveKey = async () => {
    const trimmed = keyDraft.trim();
    setPrivateKey(trimmed);
    setKeySaved(true);
    setOperatorSaving(true);
    setOperatorResult(null);
    // Auto-sync to server (so AutoChat can use it without env vars)
    const r = await setOperatorKey(trimmed);
    setOperatorSaving(false);
    if (r.ok) {
      setOperatorResult({ ok: true, text: r.pubkey ? `✓ Saved + synced to server (${r.pubkey.slice(0, 6)}…${r.pubkey.slice(-4)})` : "✓ Saved + synced to server" });
    } else {
      setOperatorResult({ ok: false, text: `Saved locally, but server sync failed: ${r.error}` });
    }
    setTimeout(() => setKeySaved(false), 2500);
    setTimeout(() => setOperatorResult(null), 6000);
  };

  const clearKey = () => {
    setKeyDraft("");
    setPrivateKey("");
    void setOperatorKey("");
  };

  const saveTg = () => {
    setTelegramChatId(tgDraft.trim());
    setTgSaved(true);
    setTimeout(() => setTgSaved(false), 2000);
  };

  const testTg = async () => {
    const id = tgDraft.trim();
    if (!id) return;
    setTelegramChatId(id);
    setTgTesting(true);
    setTgMsg(null);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const r = await fetch(`${BASE}/api/telegram/test/${encodeURIComponent(id)}`, { signal: ctrl.signal });
      const text = await r.text();
      let j: { ok?: boolean; error?: string } = {};
      try { j = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
      setTgMsg({ ok: !!j.ok, text: j.ok ? "✓ Message sent — check Telegram!" : String(j.error ?? `Failed (HTTP ${r.status})`) });
    } catch (e) {
      const err = e as Error;
      const isAbort = err.name === "AbortError" || ctrl.signal.aborted;
      setTgMsg({
        ok: false,
        text: isAbort
          ? "Timed out after 12s — try again."
          : /Failed to fetch|NetworkError|Load failed/i.test(err.message)
            ? "Network blocked. Check your connection, VPN, or browser extensions."
            : `Network error: ${err.message || "unknown"}`,
      });
    } finally {
      clearTimeout(tid);
      setTgTesting(false);
    }
  };

  const toggleNotif = async () => {
    if (!notificationsEnabled) {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        const p = await Notification.requestPermission();
        if (p !== "granted") return;
      }
      setNotificationsEnabled(true);
    } else {
      setNotificationsEnabled(false);
    }
  };

  const saveSession = async () => {
    const token = sessionToken.trim();
    if (!token || !token.startsWith("eyJ")) {
      setSessionMsg({ ok: false, text: "Paste the full token starting with eyJ…" });
      return;
    }
    if (token.length > 6000) {
      setSessionMsg({ ok: false, text: `Token looks too long (${token.length} chars). Trim it to a single JWT (3 dot-separated parts).` });
      return;
    }
    setSessionSaving(true);
    setSessionMsg(null);

    // Resolve API base robustly — relative URL can break on some mobile browsers
    // when BASE_URL ends up empty. Fall back to current origin if needed.
    const apiBase = (() => {
      const b = (BASE ?? "").trim();
      if (!b) return "";                                // relative
      if (/^https?:\/\//i.test(b)) return b;            // absolute
      return "";                                        // weird path → relative
    })();

    // AbortController so we don't hang forever on flaky networks
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15_000);

    try {
      // Health check first so we can give a precise error if the server is down
      try {
        const h = await fetch(`${apiBase}/api/healthz`, { signal: ctrl.signal, cache: "no-store" });
        if (!h.ok) throw new Error(`Server returned ${h.status}`);
      } catch (he) {
        const msg = he instanceof Error ? he.message : String(he);
        const isAbort = ctrl.signal.aborted;
        setSessionMsg({
          ok: false,
          text: isAbort
            ? "Server didn't respond in 15s — check your connection."
            : `Can't reach server (${msg}). Try again or use Auto-Link.`,
        });
        return;
      }

      const r = await fetch(`${apiBase}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, privateKey: privateKey.trim() || undefined }),
        signal: ctrl.signal,
      });
      const text = await r.text();
      let j: { ok?: boolean; pubkey?: string; expiresAt?: string; error?: string } = {};
      try { j = text ? JSON.parse(text) : {}; } catch { /* keep {} */ }

      if (r.ok && j.ok) {
        setSessionMsg({ ok: true, text: `✓ Linked! Chat should now work.${j.expiresAt ? ` Token expires ${new Date(j.expiresAt).toLocaleDateString()}.` : ""}` });
        setSessionToken("");
      } else {
        setSessionMsg({ ok: false, text: j.error ?? `Server error ${r.status}` });
      }
    } catch (e) {
      // Show the real error so users can self-diagnose
      const err = e as Error;
      const isAbort = err.name === "AbortError" || ctrl.signal.aborted;
      // eslint-disable-next-line no-console
      console.error("[PumpRadar] saveSession failed:", err);
      let text: string;
      if (isAbort) text = "Request timed out after 15s — try again.";
      else if (/Failed to fetch|NetworkError|Load failed/i.test(err.message))
        text = "Network blocked. Check your connection, VPN, or browser extensions.";
      else if (/SSL|TLS|certificate/i.test(err.message))
        text = `Secure connection failed: ${err.message}`;
      else text = `Network error: ${err.message || "unknown"}`;
      setSessionMsg({ ok: false, text });
    } finally {
      clearTimeout(tid);
      setSessionSaving(false);
    }
  };

  const handleAutoLink = async () => {
    const key = privateKey.trim();
    if (!key) {
      setAutoLinkResult({ ok: false, text: "Save your private key first (step above), then tap Auto-Link." });
      return;
    }
    setAutoLinking(true);
    setAutoLinkResult(null);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 30_000);
    try {
      // 1. Get Privy tokens server-side using the private key
      const r1 = await fetch(`${BASE}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey: key }),
        signal: ctrl.signal,
      });
      const t1 = await r1.text();
      let j1: { token?: string; tokens?: string[]; error?: string } = {};
      try { j1 = t1 ? JSON.parse(t1) : {}; } catch { /* ignore */ }
      if (!j1.token) {
        setAutoLinkResult({ ok: false, text: j1.error ?? "Could not get token from server. Try the manual method below." });
        return;
      }
      // 2. Save it as the active session token
      const r2 = await fetch(`${BASE}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: j1.token, privateKey: key }),
        signal: ctrl.signal,
      });
      const t2 = await r2.text();
      let j2: { ok?: boolean; expiresAt?: string; error?: string } = {};
      try { j2 = t2 ? JSON.parse(t2) : {}; } catch { /* ignore */ }
      if (j2.ok) {
        setAutoLinkResult({ ok: true, text: `✓ Wallet linked! Chat is now active.${j2.expiresAt ? ` Valid until ${new Date(j2.expiresAt).toLocaleDateString()}.` : ""}` });
      } else {
        setAutoLinkResult({ ok: false, text: j2.error ?? "Linking failed — try the manual method below." });
      }
    } catch (e) {
      const err = e as Error;
      const isAbort = err.name === "AbortError" || ctrl.signal.aborted;
      // eslint-disable-next-line no-console
      console.error("[PumpRadar] autoLink failed:", err);
      setAutoLinkResult({
        ok: false,
        text: isAbort
          ? "Timed out after 30s — check your connection."
          : /Failed to fetch|NetworkError|Load failed/i.test(err.message)
            ? "Network blocked. Check VPN, ad-blockers, or browser extensions."
            : `Network error: ${err.message || "unknown"}`,
      });
    } finally {
      clearTimeout(tid);
      setAutoLinking(false);
    }
  };

  const copyBookmarklet = async () => {
    try {
      // Copy the raw JavaScript (for editing into a bookmark)
      const raw = decodeURIComponent(BOOKMARKLET);
      await navigator.clipboard.writeText(raw);
      setBookmarkletCopied(true);
      setTimeout(() => setBookmarkletCopied(false), 2500);
    } catch {
      setBookmarkletCopied(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999,
        overflowY: "auto",
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
        background: "#080c14",
      } as React.CSSProperties}
    >
      {/* Sticky header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "#080c14", borderBottom: "1px solid #1a2840", boxShadow: "0 1px 8px rgba(0,0,0,0.4)" }}>
        <button
          onClick={onClose}
          style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", border: "1px solid #1a2840", color: "#60a5fa", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 16, color: "#f1f5f9" }}>
          ⚙ Settings
        </span>
        {myProfile && (
          <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 11, color: "#60a5fa", background: "rgba(59,130,246,0.1)", padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(59,130,246,0.25)" }}>
            ✓ {myProfile.username ?? myProfile.name ?? "Key active"}
          </span>
        )}
      </div>

      {/* Tab navigation */}
      <TabBar
        tabs={[
          { id: "wallet",    label: "🔑 Wallet" },
          { id: "autochat",  label: "🤖 AutoChat" },
          { id: "alerts",    label: "📲 Alerts" },
          { id: "filters",   label: "🔽 Filters" },
        ]}
        active={settingsTab}
        onChange={(id) => setSettingsTab(id as "wallet" | "autochat" | "alerts" | "filters")}
      />

      {/* Content */}
      <div style={{ padding: "16px 16px 60px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>

        {/* ── WALLET TAB ─────────────────────────────────────────────────── */}
        {settingsTab === "wallet" && (<>
        {/* Profile card */}
        {myProfile && (
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {myProfile.avatar
                ? <img src={myProfile.avatar} alt="avatar" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(59,130,246,0.4)", flexShrink: 0 }} />
                : <div style={{ width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, background: "rgba(59,130,246,0.15)", border: "2px solid rgba(59,130,246,0.3)", color: "#60a5fa", flexShrink: 0 }}>
                    {((myProfile.name ?? myProfile.username) || "?")[0]?.toUpperCase()}
                  </div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9" }}>{myProfile.name ?? myProfile.username ?? "No name"}</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#475569", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myProfile.publicKey?.slice(0, 20)}…</div>
                <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>◎ {(myProfile.solBalance ?? 0).toFixed(3)}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{myProfile.coinsCreated ?? 0} coins</span>
                </div>
              </div>
              <button onClick={refreshProfile} disabled={profileLoading} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#475569", padding: 8, flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={profileLoading ? { animation: "spin 1s linear infinite" } : {}}>
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
                </svg>
              </button>
            </div>
          </Card>
        )}

        {/* OPERATOR WALLET (Private Key + Auto-sync to server) */}
        <Card>
          <SectionLabel icon="🔑" text="Operator Wallet" />
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
            Paste your <strong style={{ color: "#60a5fa" }}>Solana base58 private key</strong>. It's saved in your browser AND auto-synced to the server so the bot can post on your behalf. <span style={{ color: "#fbbf24" }}>Use a fresh dedicated wallet (not your main).</span>
          </p>

          {/* Sync status pill */}
          {privateKey && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{
                fontFamily: "monospace", fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
                background: operatorSynced ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.12)",
                border: `1px solid ${operatorSynced ? "rgba(34,197,94,0.4)" : "rgba(251,191,36,0.4)"}`,
                color: operatorSynced ? "#4ade80" : "#fbbf24",
              }}>
                {operatorSynced ? "✓ Synced to server" : "⚠ Not synced — tap Save Key"}
              </span>
            </div>
          )}

          <div style={{ position: "relative", marginBottom: 10 }}>
            <input
              type={showKey ? "text" : "password"}
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, padding: "14px 50px 14px 16px", fontFamily: "monospace", fontSize: 14, color: "#f1f5f9", background: "#080c14", border: "1.5px solid #1a2840", outline: "none" }}
              onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.15)"; }}
              onBlur={(e) => { e.target.style.borderColor = "#1a2840"; e.target.style.boxShadow = "none"; }}
              placeholder="Paste base58 private key here…"
              value={keyDraft}
              onChange={(e) => { setKeyDraft(e.target.value); setKeySaved(false); setOperatorResult(null); }}
              autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
            />
            <button onClick={() => setShowKey(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#475569", padding: 6, WebkitTapHighlightColor: "transparent" }}>
              {showKey
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <BlueBtn disabled={!keyDraft.trim() || !keyChanged || operatorSaving} onClick={() => void saveKey()}>
              {operatorSaving ? "🔄 Saving…" : (keySaved ? "✓ Saved!" : "💾 Save Key & Sync")}
            </BlueBtn>
            {privateKey && (
              <DangerBtn onClick={clearKey}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                Clear
              </DangerBtn>
            )}
            {operatorResult && (
              <p style={{ fontFamily: "monospace", fontSize: 11, color: operatorResult.ok ? "#4ade80" : "#fbbf24", margin: 0, flex: 1, minWidth: 200, lineHeight: 1.4 }}>
                {operatorResult.text}
              </p>
            )}
          </div>
          {!privateKey && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#60a5fa", margin: 0 }}>
                Export from Phantom:<br />
                <span style={{ color: "#93c5fd" }}>Settings → Security & Privacy → Export Private Key → Copy</span>
              </p>
            </div>
          )}
        </Card>

        {/* PUMP.FUN SESSION TOKEN — prominent, right after private key */}
        <div style={{ borderRadius: 16, border: "1.5px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.04)", padding: "18px 16px", boxShadow: "0 0 0 1px rgba(251,191,36,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>🔗</span>
            <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#fbbf24" }}>
              Link Wallet to pump.fun Chat
            </span>
          </div>

          {/* Why you need this */}
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", lineHeight: 1.75, marginBottom: 16 }}>
            Needed to post messages and read live chat. One-time setup — chat stays active until the token expires.
          </div>

          {/* ── AUTO-LINK (primary path) ── */}
          <div style={{ borderRadius: 12, background: privateKey ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.03)", border: `1.5px solid ${privateKey ? "rgba(34,197,94,0.25)" : "#1a2840"}`, padding: "14px 14px", marginBottom: 12 }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: privateKey ? "#4ade80" : "#475569", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
              {privateKey ? "⚡ Auto-Link via Private Key" : "⚡ Auto-Link (save private key above first)"}
            </div>
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", lineHeight: 1.65, margin: "0 0 12px 0" }}>
              PumpRadar uses your saved private key to authenticate automatically — no bookmarklet or manual steps needed.
            </p>
            <button
              onClick={() => void handleAutoLink()}
              disabled={autoLinking || !privateKey}
              style={{
                width: "100%", padding: "13px 0", borderRadius: 10,
                border: privateKey ? "1.5px solid rgba(34,197,94,0.5)" : "1.5px solid #1a2840",
                background: autoLinking ? "rgba(34,197,94,0.06)" : privateKey ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
                color: privateKey ? "#4ade80" : "#334155",
                fontFamily: "monospace", fontSize: 14, fontWeight: 700,
                cursor: privateKey && !autoLinking ? "pointer" : "not-allowed",
                WebkitTapHighlightColor: "transparent",
                transition: "all 0.15s",
              }}
            >
              {autoLinking ? "🔄 Linking…" : "🔑 Auto-Link Wallet"}
            </button>
            {autoLinkResult && (
              <p style={{ fontFamily: "monospace", fontSize: 11, color: autoLinkResult.ok ? "#4ade80" : "#f87171", marginTop: 10, lineHeight: 1.6 }}>
                {autoLinkResult.text}
              </p>
            )}
          </div>

          {/* ── MANUAL FALLBACK (collapsed by default) ── */}
          <button
            onClick={() => setShowManualFallback(v => !v)}
            style={{ background: "transparent", border: "none", fontFamily: "monospace", fontSize: 10, color: "#475569", cursor: "pointer", padding: "2px 0", marginBottom: showManualFallback ? 12 : 0, WebkitTapHighlightColor: "transparent" }}
          >
            {showManualFallback ? "▲ Hide manual method" : "▼ Auto-link not working? Use manual method instead"}
          </button>

          {showManualFallback && (
            <>
              {/* HOW TO GET IT — iOS focused */}
              <div style={{ borderRadius: 12, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(251,191,36,0.15)", padding: "14px 14px", marginBottom: 12 }}>
                <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#fbbf24", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                  📱 Get token manually on iPhone
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { n: "1", text: "Open pump.fun in Safari. Log in — email or wallet both work." },
                    { n: "2", text: "Tap the Share button → Add Bookmark → save it anywhere." },
                    { n: "3", text: "Open Bookmarks → find that bookmark → swipe left → Edit." },
                    { n: "4", text: "Delete the URL field and paste the code you copy below. Tap Done." },
                    { n: "5", text: "Back on pump.fun: tap the address bar, type the bookmark name, tap it." },
                    { n: "6", text: "A dialog appears with your token — select ALL and copy it." },
                    { n: "7", text: "Come back here and paste it in the field below → tap Link Session." },
                  ].map(({ n, text }) => (
                    <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(251,191,36,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fbbf24", flexShrink: 0, marginTop: 1 }}>{n}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>{text}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => void copyBookmarklet()}
                  style={{ marginTop: 14, width: "100%", padding: "12px 0", borderRadius: 10, border: "1.5px solid rgba(251,191,36,0.4)", background: bookmarkletCopied ? "rgba(34,197,94,0.12)" : "rgba(251,191,36,0.08)", color: bookmarkletCopied ? "#4ade80" : "#fbbf24", fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
                >
                  {bookmarkletCopied ? "✓ Code Copied! Now follow step 3 above" : "📋 Copy Bookmarklet Code (for step 4)"}
                </button>
              </div>

              {/* Desktop fallback */}
              <button
                onClick={() => setShowBookmarkletSteps(v => !v)}
                style={{ background: "transparent", border: "none", fontFamily: "monospace", fontSize: 10, color: "#475569", cursor: "pointer", padding: 0, marginBottom: showBookmarkletSteps ? 10 : 0, WebkitTapHighlightColor: "transparent" }}
              >
                {showBookmarkletSteps ? "▲ Hide" : "▼ On desktop / Mac instead?"}
              </button>
              {showBookmarkletSteps && (
                <div style={{ borderRadius: 10, background: "rgba(0,0,0,0.2)", border: "1px solid #1a2840", padding: "12px 14px", marginBottom: 12 }}>
                  <p style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", lineHeight: 1.75, margin: 0 }}>
                    1. Open <a href="https://pump.fun" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>pump.fun</a> in Chrome/Firefox.<br />
                    2. Log in with your wallet or email.<br />
                    3. Press <strong style={{ color: "#f1f5f9" }}>F12</strong> → Application tab → Local Storage → pump.fun.<br />
                    4. Find a key starting with <code style={{ color: "#fbbf24" }}>privy</code> whose value starts with <code style={{ color: "#fbbf24" }}>eyJ</code>.<br />
                    5. Copy that value and paste below.
                  </p>
                </div>
              )}

              {/* Token input */}
              <div style={{ marginBottom: 10 }}>
                <textarea
                  style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, padding: "12px 14px", fontFamily: "monospace", fontSize: 12, color: "#f1f5f9", background: "#080c14", border: `1.5px solid ${sessionMsg ? (sessionMsg.ok ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)") : "rgba(251,191,36,0.25)"}`, outline: "none", resize: "none", minHeight: 72, lineHeight: 1.5 }}
                  onFocus={(e) => { e.target.style.borderColor = "#fbbf24"; }}
                  onBlur={(e) => { e.target.style.borderColor = sessionMsg ? (sessionMsg.ok ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)") : "rgba(251,191,36,0.25)"; }}
                  placeholder="eyJ… paste your pump.fun session token here"
                  value={sessionToken}
                  onChange={(e) => { setSessionToken(e.target.value); setSessionMsg(null); }}
                  autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                />
              </div>

              {sessionMsg && (
                <p style={{ fontFamily: "monospace", fontSize: 11, color: sessionMsg.ok ? "#4ade80" : "#ef4444", marginBottom: 8, lineHeight: 1.5 }}>{sessionMsg.text}</p>
              )}
              <BlueBtn disabled={!sessionToken.trim() || sessionSaving} onClick={() => void saveSession()}>
                {sessionSaving ? "Linking…" : "🔗 Link Session"}
              </BlueBtn>
            </>
          )}
        </div>

        {/* Capabilities card (wallet tab) */}
        <Card>
          <SectionLabel icon="⚡" text="What your key unlocks" />
          {[
            { e: "💬", t: "Post messages in any pump.fun coin chat" },
            { e: "🔒", t: "Lock chat — others get 'failed to send'. Coin creators only on pump.fun's side." },
            { e: "🚫", t: "Ban wallets from your coin's chat on pump.fun" },
            { e: "📲", t: "Get Telegram DMs when new replies appear on coins you're watching" },
            { e: "🤖", t: "AutoChat — bot posts on new coins using your wallet (see AutoChat tab)" },
          ].map(({ e, t }, i, arr) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < arr.length - 1 ? 10 : 0 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{e}</span>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>{t}</span>
            </div>
          ))}
        </Card>

        {/* ── AUTOCHAT TAB ──────────────────────────────────────────────── */}
        </>)}

        {settingsTab === "autochat" && (<>
        {/* QUICK START WIZARD */}
        <Card>
          <SectionLabel icon="🚀" text="Quick Start (3 steps)" />
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", lineHeight: 1.6, marginBottom: 12 }}>
            Set this up once. After that, the bot handles everything automatically.
          </p>
          {(() => {
            const step1Done = !!privateKey && operatorSynced;
            const step2Done = !!telegramChatId;
            const step3Done = !!autoChat.hasOperatorKey && step1Done;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Step
                  n={1}
                  done={step1Done}
                  title="Save your Solana wallet key"
                  hint={step1Done ? "✓ Key saved + synced to server" : "Tap 🔑 Wallet tab → paste key → Save Key & Sync"}
                />
                <Step
                  n={2}
                  done={step2Done}
                  title="Connect your Telegram"
                  hint={step2Done ? `✓ Connected to chat ${telegramChatId}` : "Tap 📲 Alerts tab → paste your Telegram chat ID"}
                />
                <Step
                  n={3}
                  done={autoChat.enabled}
                  title="Turn on AutoChat (dry-run first)"
                  hint={autoChat.enabled
                    ? (autoChat.dryRun ? "✓ Running in safe test mode — flip dry-run OFF when ready" : "✓ Live — bot is posting to real pump.fun")
                    : "Toggle the green switch below ↑ when ready"}
                />
              </div>
            );
          })()}
        </Card>

        {/* AUTO-CHAT - auto-send messages on new coins (REAL pump.fun posts) */}
        <Card>
          <SectionLabel icon="🤖" text="Auto-Chat on New Coins (REAL pump.fun posts)" />
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
            When the scanner spots a new coin, the bot opens the <strong style={{ color: "#22c55e" }}>real pump.fun livestream</strong> via WebSocket and posts your messages
            using <strong style={{ color: "#60a5fa" }}>your wallet</strong>. Every message reaches pump.fun's live chat — no in-app fallback masquerading as success.
            It watches for the coin creator's replies, locks the in-app room to just you + the dev, and keeps watching even after the livestream ends.
          </p>

          {/* Status pill row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "monospace", fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
              background: autoChat.hasOperatorKey ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              border: `1px solid ${autoChat.hasOperatorKey ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
              color: autoChat.hasOperatorKey ? "#4ade80" : "#f87171",
            }}>
              {autoChat.hasOperatorKey
                ? `✓ Operator: ${autoChat.operatorPubkey.slice(0, 6)}…${autoChat.operatorPubkey.slice(-4)}`
                : "✗ No operator key — save private key above to activate"}
            </span>
            {autoChat.operatorSolBalance !== null && autoChat.hasOperatorKey && (
              <span style={{
                fontFamily: "monospace", fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
                background: autoChat.operatorSolBalance < 0.05 ? "rgba(239,68,68,0.12)" : "rgba(148,163,184,0.08)",
                border: `1px solid ${autoChat.operatorSolBalance < 0.05 ? "rgba(239,68,68,0.4)" : "#1a2840"}`,
                color: autoChat.operatorSolBalance < 0.05 ? "#f87171" : "#94a3b8",
              }}>
                💰 {autoChat.operatorSolBalance.toFixed(4)} SOL
              </span>
            )}
            {autoChat.active.length > 0 && (
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#60a5fa", padding: "4px 10px", borderRadius: 8, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)" }}>
                🔥 {autoChat.active.length} active
              </span>
            )}
            {autoChat.approvalPending.length > 0 && (
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#fbbf24", padding: "4px 10px", borderRadius: 8, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)" }}>
                ⏳ {autoChat.approvalPending.length} awaiting TG approval
              </span>
            )}
            <button
              onClick={() => void refreshAutoChat()}
              disabled={autoChatLoading}
              style={{ marginLeft: "auto", background: "transparent", border: "1px solid #1a2840", borderRadius: 8, padding: "4px 10px", color: "#94a3b8", fontFamily: "monospace", fontSize: 10, cursor: autoChatLoading ? "wait" : "pointer", WebkitTapHighlightColor: "transparent" }}
            >
              {autoChatLoading ? "…" : "↻ refresh"}
            </button>
          </div>

          {/* Master enable */}
          <div
            onClick={() => { setAutoChat(p => ({ ...p, enabled: !p.enabled })); setAutoChatDirty(true); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px", borderRadius: 12, cursor: "pointer", background: autoChat.enabled ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)", border: `1.5px solid ${autoChat.enabled ? "rgba(34,197,94,0.4)" : "#1a2840"}`, marginBottom: 12, WebkitTapHighlightColor: "transparent" }}
          >
            <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: autoChat.enabled ? "#4ade80" : "#f1f5f9" }}>
              {autoChat.enabled
                ? `🤖 AutoChat ON${autoChat.dryRun ? " (DRY RUN — no real posts)" : " — posting to real pump.fun"}`
                : "🤖 AutoChat OFF"}
            </span>
            <div style={{ width: 44, height: 26, borderRadius: 13, position: "relative", background: autoChat.enabled ? "#22c55e" : "#1a2840" }}>
              <div style={{ position: "absolute", top: 4, left: autoChat.enabled ? 22 : 4, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
            </div>
          </div>

          {/* ── Persona + Language + Dry-run ─────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                Bot persona
              </div>
              <select
                value={autoChat.persona}
                onChange={(e) => { setAutoChat(p => ({ ...p, persona: e.target.value as typeof p.persona })); setAutoChatDirty(true); }}
                style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: "#f1f5f9", background: "#080c14", border: "1.5px solid #1a2840", outline: "none" }}
              >
                {(autoChat.personas.length ? autoChat.personas : [
                  { id: "texas", name: "🤠 Texas Crypto Trader", blurb: "" },
                  { id: "pro",   name: "💼 Professional Outreach", blurb: "" },
                  { id: "genz",  name: "🧬 Gen Z Crypto Native", blurb: "" },
                  { id: "custom", name: "✍ Custom", blurb: "" },
                ]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {autoChat.personas.find(p => p.id === autoChat.persona)?.blurb && (
                <p style={{ fontFamily: "monospace", fontSize: 10, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>
                  {autoChat.personas.find(p => p.id === autoChat.persona)?.blurb}
                </p>
              )}
            </div>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                Language (UI / TG)
              </div>
              <select
                value={autoChat.language}
                onChange={(e) => { setAutoChat(p => ({ ...p, language: e.target.value as typeof p.language })); setAutoChatDirty(true); }}
                style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: "#f1f5f9", background: "#080c14", border: "1.5px solid #1a2840", outline: "none" }}
              >
                <option value="auto">🌐 Auto-detect (detected: {detectedLang})</option>
                <option value="en">🇺🇸 English</option>
                <option value="es">🇪🇸 Español</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="de">🇩🇪 Deutsch</option>
              </select>
              <p style={{ fontFamily: "monospace", fontSize: 10, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>
                Bot messages stay English by default — language here affects UI labels + TG alerts.
              </p>
            </div>
          </div>

          {/* Dry run banner */}
          <div style={{ borderRadius: 12, padding: "12px 14px", marginBottom: 8, background: autoChat.dryRun ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.02)", border: `1.5px solid ${autoChat.dryRun ? "rgba(251,191,36,0.4)" : "#1a2840"}` }}>
            <div
              onClick={() => { setAutoChat(p => ({ ...p, dryRun: !p.dryRun })); setAutoChatDirty(true); }}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
            >
              <div style={{ width: 40, height: 24, borderRadius: 12, position: "relative", background: autoChat.dryRun ? "#fbbf24" : "#1a2840", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 3, left: autoChat.dryRun ? 19 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: autoChat.dryRun ? "#fbbf24" : "#f1f5f9" }}>
                  {autoChat.dryRun ? "🧪 DRY RUN is ON" : "🧪 Dry run (safe test mode)"}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", lineHeight: 1.5 }}>
                  When ON: posts return fake acks, Jupiter swaps are simulated. ZERO SOL spent. Use to verify the whole chain.
                </div>
              </div>
            </div>
          </div>

          {/* Human mode banner */}
          <div style={{ borderRadius: 12, padding: "12px 14px", marginBottom: 12, background: autoChat.humanize ? "rgba(59,130,246,0.06)" : "rgba(255,255,255,0.02)", border: `1.5px solid ${autoChat.humanize ? "rgba(59,130,246,0.3)" : "#1a2840"}` }}>
            <div
              onClick={() => { setAutoChat(p => ({ ...p, humanize: !p.humanize })); setAutoChatDirty(true); }}
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
            >
              <div style={{ width: 40, height: 24, borderRadius: 12, position: "relative", background: autoChat.humanize ? "#3b82f6" : "#1a2840", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 3, left: autoChat.humanize ? 19 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: autoChat.humanize ? "#60a5fa" : "#f1f5f9" }}>
                  {autoChat.humanize ? "🧍 Human mode ON" : "🤖 Robot mode (no jitter)"}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", lineHeight: 1.5 }}>
                  Random delays ±45%, shows "typing…" indicator while composing, sends 1 drop 70% of the time, stops mid-sequence if the dev replies.
                </div>
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <Toggle
              on={autoChat.lockOnNew}
              onChange={(v) => { setAutoChat(p => ({ ...p, lockOnNew: v })); setAutoChatDirty(true); }}
              label="🔒 Auto-lock in-app chat for new coins"
              hint="Only you and the coin creator can post. Everyone else gets a locked message."
            />
            <Toggle
              on={autoChat.devMode}
              onChange={(v) => { setAutoChat(p => ({ ...p, devMode: v })); setAutoChatDirty(true); }}
              label="👑 Auto-reply when the dev responds"
              hint="When the coin creator (dev) posts in chat, send your configured reply back."
            />
            <Toggle
              on={autoChat.telegramOnDev}
              onChange={(v) => { setAutoChat(p => ({ ...p, telegramOnDev: v })); setAutoChatDirty(true); }}
              label="📲 Ping me on Telegram when dev replies"
              hint="Get a Telegram DM the moment the coin dev posts in any tracked chat."
            />
            <Toggle
              on={autoChat.buyRequireApproval}
              onChange={(v) => { setAutoChat(p => ({ ...p, buyRequireApproval: v })); setAutoChatDirty(true); }}
              label="🛒 Ask before spending SOL on holder-locked coins"
              hint="If a coin's chat rejects you (holder-only), the bot sends a TG message with Approve/Skip buttons before buying ~$0.20 via Jupiter."
            />
            <Toggle
              on={autoChat.watchAfterStreamEnd}
              onChange={(v) => { setAutoChat(p => ({ ...p, watchAfterStreamEnd: v })); setAutoChatDirty(true); }}
              label="👁 Keep watching chat after livestream ends"
              hint="The pump.fun room stays open even when the stream stops — keep monitoring for dev replies."
            />
          </div>

          {/* Messages - one card per drop, with its own delay */}
          <div style={{ marginBottom: 12 }}>
            {autoChat.persona === "custom" ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                    Custom drops ({autoChat.customDrops.length}/20)
                  </div>
                  <button
                    onClick={() => {
                      setAutoChat(p => ({
                        ...p,
                        customDrops: [...p.customDrops, "👋 gm {name} devs"],
                        customDelaysMs: [...p.customDelaysMs, 5000],
                      }));
                      setAutoChatDirty(true);
                    }}
                    style={{ background: "transparent", border: "1px solid #22c55e", borderRadius: 8, padding: "4px 10px", color: "#22c55e", fontFamily: "monospace", fontSize: 10, fontWeight: 700, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
                  >
                    + Add drop
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {autoChat.customDrops.map((msg, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 10, color: "#475569", padding: "0 8px", minWidth: 28 }}>
                        #{idx + 1}
                      </div>
                      <textarea
                        style={{ flex: 1, boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: "#f1f5f9", background: "#080c14", border: "1.5px solid #1a2840", outline: "none", resize: "vertical", minHeight: 56, lineHeight: 1.5 }}
                        onFocus={(e) => { e.target.style.borderColor = "#22c55e"; }}
                        onBlur={(e) => { e.target.style.borderColor = "#1a2840"; }}
                        placeholder="👋 gm devs…"
                        value={msg}
                        onChange={(e) => {
                          setAutoChat(p => ({
                            ...p,
                            customDrops: p.customDrops.map((m, i) => i === idx ? e.target.value : m),
                          }));
                          setAutoChatDirty(true);
                        }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center" }}>
                        <input
                          type="number"
                          min={0} max={600} step={5}
                          value={(autoChat.customDelaysMs[idx] ?? 0) / 1000}
                          title="Delay in seconds before this message"
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            if (Number.isFinite(n)) {
                              setAutoChat(p => ({
                                ...p,
                                customDelaysMs: p.customDelaysMs.map((d, i) => i === idx ? Math.round(n * 1000) : d),
                              }));
                              setAutoChatDirty(true);
                            }
                          }}
                          style={{ width: 64, boxSizing: "border-box", borderRadius: 8, padding: "6px 8px", fontFamily: "monospace", fontSize: 11, color: "#f1f5f9", background: "#080c14", border: "1.5px solid #1a2840", outline: "none", textAlign: "center" }}
                        />
                        <span style={{ fontFamily: "monospace", fontSize: 9, color: "#475569" }}>sec</span>
                      </div>
                      <button
                        onClick={() => {
                          setAutoChat(p => ({
                            ...p,
                            customDrops: p.customDrops.filter((_, i) => i !== idx),
                            customDelaysMs: p.customDelaysMs.filter((_, i) => i !== idx),
                          }));
                          setAutoChatDirty(true);
                        }}
                        style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "0 8px", color: "#f87171", fontFamily: "monospace", fontSize: 14, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
                        title="Remove this drop"
                      >×</button>
                    </div>
                  ))}
                  {autoChat.customDrops.length === 0 && (
                    <div style={{ borderRadius: 10, padding: 16, textAlign: "center", color: "#475569", fontFamily: "monospace", fontSize: 11, border: "1.5px dashed #1a2840" }}>
                      No custom drops yet. Tap "+ Add drop" to write your first.
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#475569", marginTop: 8, lineHeight: 1.6 }}>
                  Placeholders: <code style={{ color: "#fbbf24" }}>{"{name}"}</code> <code style={{ color: "#fbbf24" }}>{"{symbol}"}</code> <code style={{ color: "#fbbf24" }}>{"{mint}"}</code> <code style={{ color: "#fbbf24" }}>{"{mc}"}</code> <code style={{ color: "#fbbf24" }}>{"{platform}"}</code> <code style={{ color: "#fbbf24" }}>{"{creator}"}</code>
                </div>
              </>
            ) : (
              <div style={{ borderRadius: 10, padding: 14, background: "rgba(0,0,0,0.2)", border: "1px solid #1a2840" }}>
                <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 6 }}>
                  📝 Current drops (read-only — switch to "Custom" to edit)
                </div>
                {(autoChat.personas.find(p => p.id === autoChat.persona)?.name ?? "—")}
              </div>
            )}
          </div>

          {/* Dev reply template - editable when persona === "custom" */}
          {autoChat.devMode && autoChat.persona === "custom" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                Custom reply template (when the dev responds)
              </div>
              <input
                type="text"
                style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: "#f1f5f9", background: "#080c14", border: "1.5px solid #1a2840", outline: "none" }}
                onFocus={(e) => { e.target.style.borderColor = "#22c55e"; }}
                onBlur={(e) => { e.target.style.borderColor = "#1a2840"; }}
                placeholder="🤝 {name} — yeah let's talk. TG: @yourtg"
                value={autoChat.customDevReply}
                onChange={(e) => { setAutoChat(p => ({ ...p, customDevReply: e.target.value })); setAutoChatDirty(true); }}
              />
            </div>
          )}

          {/* Fine tuning row */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <NumField
              label="Buy cap (SOL, holder-locked)"
              value={autoChat.buyAmountSol}
              min={0} max={1} step={0.01}
              onChange={(n) => { setAutoChat(p => ({ ...p, buyAmountSol: n })); setAutoChatDirty(true); }}
            />
            <NumField
              label="Skip above MC"
              value={autoChat.minMc}
              min={0} max={100000} step={500}
              onChange={(n) => { setAutoChat(p => ({ ...p, minMc: n })); setAutoChatDirty(true); }}
            />
            <NumField
              label="Max concurrent chats"
              value={autoChat.maxConcurrentChats}
              min={1} max={20} step={1}
              onChange={(n) => { setAutoChat(p => ({ ...p, maxConcurrentChats: Math.round(n) })); setAutoChatDirty(true); }}
            />
          </div>

          {/* Save button */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <BlueBtn disabled={!autoChatDirty || autoChatLoading} onClick={() => void saveAutoChat()}>
              {autoChatLoading ? "Saving…" : "Save AutoChat Config"}
            </BlueBtn>
            <GhostBtn onClick={() => void resetAutoChat()}>
              ↺ Reset
            </GhostBtn>
            {autoChatMsg && (
              <p style={{ fontFamily: "monospace", fontSize: 11, color: autoChatMsg.ok ? "#4ade80" : "#f87171", margin: 0, flex: 1 }}>
                {autoChatMsg.text}
              </p>
            )}
          </div>
          {autoChat.configPath && (
            <p style={{ fontFamily: "monospace", fontSize: 10, color: "#475569", marginBottom: 12, lineHeight: 1.6, wordBreak: "break-all" as const }}>
              💾 Config persists to: <code style={{ color: "#94a3b8" }}>{autoChat.configPath}</code> — survives restarts.
            </p>
          )}

          {/* Test Send panel */}
          <div style={{ borderRadius: 12, background: "rgba(59,130,246,0.06)", border: "1.5px solid rgba(59,130,246,0.25)", padding: "14px 14px", marginBottom: 12 }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#60a5fa", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
              🧪 Test Send — verify posting works end-to-end
            </div>
            <p style={{ fontFamily: "monospace", fontSize: 10, color: "#94a3b8", lineHeight: 1.6, margin: "0 0 10px 0" }}>
              Paste any pump.fun coin mint and a message. The bot will open the real pump.fun livestream via WebSocket and post — no in-app fallback. If pump.fun rejects, you'll see the exact reason.
            </p>
            <input
              type="text"
              placeholder="Pump.fun coin mint (e.g. 8sLsDT…)"
              value={testMint}
              onChange={(e) => setTestMint(e.target.value.trim())}
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: "#f1f5f9", background: "#080c14", border: "1.5px solid #1a2840", outline: "none", marginBottom: 8 }}
            />
            <textarea
              placeholder="Test message…"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: "#f1f5f9", background: "#080c14", border: "1.5px solid #1a2840", outline: "none", resize: "vertical", minHeight: 56, lineHeight: 1.5, marginBottom: 8 }}
            />
            <button
              onClick={() => void sendTestMessage()}
              disabled={testSending || !testMint.trim()}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10,
                border: "1.5px solid rgba(59,130,246,0.5)",
                background: testSending ? "rgba(59,130,246,0.06)" : "rgba(59,130,246,0.15)",
                color: testSending ? "#60a5fa" : "#ffffff",
                fontFamily: "monospace", fontSize: 13, fontWeight: 700,
                cursor: testSending || !testMint.trim() ? "not-allowed" : "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {testSending
                ? (autoChat.dryRun ? "🧪 Simulating (dry run)…" : "🔄 Posting to real pump.fun…")
                : (autoChat.dryRun ? "🧪 Test (simulated — safe)" : "🚀 Send test to pump.fun")}
            </button>
            {testResult && (
              <p style={{ fontFamily: "monospace", fontSize: 11, color: testResult.ok ? "#4ade80" : "#f87171", marginTop: 10, lineHeight: 1.6 }}>
                {testResult.text}
              </p>
            )}
          </div>

          {/* Active chats panel */}
          {autoChat.active.length > 0 && (
            <div style={{ borderRadius: 12, background: "rgba(0,0,0,0.3)", border: "1px solid #1a2840", padding: "12px 14px" }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                🔥 Active chats
              </div>
              {autoChat.active.map((a) => (
                <div key={a.mint} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: "#f1f5f9", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.name} <span style={{ color: "#60a5fa" }}>${a.symbol}</span>
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#94a3b8" }}>
                    {a.messagesSent} sent
                  </span>
                  {a.roomLocked && <span style={{ fontFamily: "monospace", fontSize: 10, color: "#fbbf24" }}>🔒</span>}
                  {a.awaitingApproval && <span style={{ fontFamily: "monospace", fontSize: 10, color: "#fbbf24" }}>⏳</span>}
                  {a.streamEndedAt && <span style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b" }}>📴</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
        </>)}

        {/* ── ALERTS TAB ─────────────────────────────────────────────────── */}
        {settingsTab === "alerts" && (<>
        {/* TELEGRAM */}
        <Card>
          <SectionLabel icon="📲" text="Telegram Alerts" />
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", lineHeight: 1.7, marginBottom: 12 }}>
            Get a Telegram message the instant a new coin under $5K MC with a Discord link is detected.<br /><br />
            <b style={{ color: "#f1f5f9" }}>Step 1:</b> Message <a href="https://t.me/PumpRadarBot" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>@PumpRadarBot</a> on Telegram — send <code>/start</code>.<br />
            <b style={{ color: "#f1f5f9" }}>Step 2:</b>{" "}
            <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" style={{ color: "#60a5fa", fontWeight: 700 }}>Open @userinfobot</a>{" "}
            — copy your chat ID and paste it below.
          </p>
          <input
            type="text"
            inputMode="numeric"
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, padding: "14px 16px", fontFamily: "monospace", fontSize: 14, color: "#f1f5f9", background: "#080c14", border: `1.5px solid ${tgMsg ? (tgMsg.ok ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)") : "#1a2840"}`, outline: "none", marginBottom: 8 }}
            onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; }}
            onBlur={(e) => { e.target.style.borderColor = tgMsg ? (tgMsg.ok ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)") : "#1a2840"; }}
            placeholder="Your Telegram chat ID (e.g. 123456789)"
            value={tgDraft}
            onChange={(e) => { setTgDraft(e.target.value); setTgMsg(null); setTgSaved(false); }}
          />
          {tgMsg && <p style={{ fontFamily: "monospace", fontSize: 11, color: tgMsg.ok ? "#4ade80" : "#ef4444", marginBottom: 8 }}>{tgMsg.text}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <BlueBtn disabled={!tgDraft.trim() || tgDraft.trim() === telegramChatId} onClick={saveTg}>
              {tgSaved ? "✓ Saved" : "Save"}
            </BlueBtn>
            <GhostBtn disabled={!tgDraft.trim() || tgTesting} onClick={() => void testTg()}>
              {tgTesting
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                : "Send Test"
              }
            </GhostBtn>
            {telegramChatId && (
              <DangerBtn onClick={() => { setTgDraft(""); setTelegramChatId(""); setTgMsg(null); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </DangerBtn>
            )}
          </div>
        </Card>

        {/* BROWSER NOTIFICATIONS */}
        {typeof window !== "undefined" && "Notification" in window && (
          <Card>
            <SectionLabel icon="🔔" text="Browser Notifications" />
            <div
              onClick={() => void toggleNotif()}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px", borderRadius: 12, cursor: "pointer", background: notificationsEnabled ? "rgba(59,130,246,0.08)" : "rgba(255,255,255,0.03)", border: `1.5px solid ${notificationsEnabled ? "rgba(59,130,246,0.25)" : "#1a2840"}`, WebkitTapHighlightColor: "transparent" }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>
                {notificationsEnabled ? "Notifications ON" : "Notifications OFF"}
              </span>
              <div style={{ width: 44, height: 26, borderRadius: 13, position: "relative", background: notificationsEnabled ? "#2563eb" : "#1a2840", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 4, left: notificationsEnabled ? 22 : 4, width: 18, height: 18, borderRadius: "50%", background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.4)", transition: "left 0.2s" }} />
              </div>
            </div>
            {typeof Notification !== "undefined" && Notification.permission === "denied" && (
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#ef4444", marginTop: 8 }}>⚠ Blocked — enable in site settings.</p>
            )}
          </Card>
        )}

        {/* PUSH NOTIFICATIONS */}
        {pushSupported && (
          <Card>
            <SectionLabel icon="🔔" text="Push Alerts (Background)" />
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", lineHeight: 1.7, marginBottom: 12 }}>
              Get notified even when PumpRadar is closed. Tap the <b style={{ color: "#f1f5f9" }}>🔔 bell</b> icon on any coin chat to subscribe to that coin, or enable globally here.
              <br /><br />
              <b style={{ color: "#fbbf24" }}>iPhone:</b> Add PumpRadar to your Home Screen first — Safari requires the app to be installed for push to work (iOS 16.4+).
            </p>
            <div
              onClick={() => { if (!pushLoading) void togglePush(); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px", borderRadius: 12, cursor: pushLoading ? "not-allowed" : "pointer", background: pushEnabled ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)", border: `1.5px solid ${pushEnabled ? "rgba(34,197,94,0.25)" : "#1a2840"}`, WebkitTapHighlightColor: "transparent", marginBottom: 8 }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>
                {pushEnabled ? "Push Alerts ON" : "Push Alerts OFF"}
              </span>
              <div style={{ width: 44, height: 26, borderRadius: 13, position: "relative", background: pushEnabled ? "#16a34a" : "#1a2840", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 4, left: pushEnabled ? 22 : 4, width: 18, height: 18, borderRadius: "50%", background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.4)", transition: "left 0.2s" }} />
              </div>
            </div>
            {pushEnabled && (
              <button
                onClick={() => void testPush()}
                disabled={pushLoading}
                style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "1px solid #1a2840", background: "rgba(255,255,255,0.04)", color: "#94a3b8", fontFamily: "monospace", fontSize: 12, cursor: pushLoading ? "not-allowed" : "pointer", marginBottom: 8 }}
              >
                {pushLoading ? "Sending…" : "Send Test Notification"}
              </button>
            )}
            {pushMsg && (
              <p style={{ fontFamily: "monospace", fontSize: 11, color: pushMsg.ok ? "#22c55e" : "#f87171", marginTop: 4 }}>{pushMsg.text}</p>
            )}
            {typeof Notification !== "undefined" && Notification.permission === "denied" && (
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#ef4444", marginTop: 4 }}>⚠ Blocked — enable notifications in your browser/site settings.</p>
            )}
          </Card>
        )}
        </>)}

        {/* ── FILTERS TAB ────────────────────────────────────────────────── */}
        {settingsTab === "filters" && (<>
        {/* DEV FILTER */}
        <Card>
          <SectionLabel icon="🔽" text="Dev Launch Filter" />
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", lineHeight: 1.7, marginBottom: 12 }}>
            Hide coins from devs with too many prior launches.
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>Max launches allowed</span>
            <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#60a5fa" }}>
              {maxDevCoins >= 100 ? "Any" : `≤ ${maxDevCoins}`}
            </span>
          </div>
          <input type="range" min={1} max={100} value={maxDevCoins} onChange={(e) => setMaxDevCoins(parseInt(e.target.value, 10))} style={{ width: "100%", accentColor: "#2563eb", marginBottom: 6 }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: 9, color: "#334155" }}>
            <span>1 (strict)</span><span>50</span><span>100 (off)</span>
          </div>
        </Card>

        {/* SECURITY */}
        <div style={{ borderRadius: 14, padding: "14px 16px", background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#fbbf24", marginBottom: 6 }}>⚠ Security</div>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#78716c", margin: 0, lineHeight: 1.7 }}>Your private key is stored in your browser only. It is sent to our server only to sign messages on pump.fun. Never share your key with anyone.</p>
        </div>
        </>)}

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Shared sub-components ───────────────────────────────────────────────── */
function Step({ n, done, title, hint }: {
  n: number; done: boolean; title: string; hint: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "12px 14px", borderRadius: 12,
      background: done ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.02)",
      border: `1.5px solid ${done ? "rgba(34,197,94,0.3)" : "#1a2840"}`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 14, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: done ? "#22c55e" : "#1a2840",
        color: done ? "white" : "#64748b",
        fontFamily: "monospace", fontSize: 13, fontWeight: 700,
      }}>
        {done ? "✓" : n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: done ? "#4ade80" : "#f1f5f9" }}>
          {title}
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 10, color: done ? "#86efac" : "#64748b", marginTop: 4, lineHeight: 1.5 }}>
          {hint}
        </div>
      </div>
    </div>
  );
}

function TabBar({ tabs, active, onChange }: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{
      display: "flex", gap: 4, padding: "0 16px 12px",
      background: "#080c14", borderBottom: "1px solid #1a2840",
      position: "sticky", top: 68, zIndex: 9,
    }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1, padding: "10px 8px", borderRadius: 10,
            border: "none", cursor: "pointer", WebkitTapHighlightColor: "transparent",
            background: active === t.id ? "rgba(34,197,94,0.12)" : "transparent",
            color: active === t.id ? "#4ade80" : "#94a3b8",
            fontFamily: "monospace", fontSize: 12, fontWeight: 700,
            transition: "all 0.15s",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 16, border: "1px solid #1a2840", background: "#0f1520", padding: "18px 16px", boxShadow: "0 1px 8px rgba(0,0,0,0.3)" }}>
      {children}
    </div>
  );
}

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
      <span>{icon}</span> {text}
    </div>
  );
}

function BlueBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px 0", borderRadius: 12, border: "none", fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", background: disabled ? "rgba(37,99,235,0.2)" : "#2563eb", color: disabled ? "rgba(96,165,250,0.4)" : "#ffffff", WebkitTapHighlightColor: "transparent" }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px 0", borderRadius: 12, border: "1.5px solid #1a2840", fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", background: "transparent", color: "#94a3b8", WebkitTapHighlightColor: "transparent" }}
    >
      {children}
    </button>
  );
}

function DangerBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px 16px", borderRadius: 12, border: "1.5px solid rgba(239,68,68,0.3)", fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "rgba(239,68,68,0.08)", color: "#f87171", WebkitTapHighlightColor: "transparent" }}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onChange, label, hint }: {
  on: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 12, cursor: "pointer", background: on ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.02)", border: `1.5px solid ${on ? "rgba(34,197,94,0.25)" : "#1a2840"}`, WebkitTapHighlightColor: "transparent" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: on ? "#4ade80" : "#f1f5f9", marginBottom: hint ? 4 : 0 }}>{label}</div>
        {hint && <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64748b", lineHeight: 1.5 }}>{hint}</div>}
      </div>
      <div style={{ width: 40, height: 24, borderRadius: 12, position: "relative", background: on ? "#22c55e" : "#1a2840", flexShrink: 0, marginTop: 2 }}>
        <div style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (n: number) => void; min: number; max: number; step: number;
}) {
  return (
    <div style={{ flex: 1, minWidth: 110 }}>
      <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{label}</div>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min} max={max} step={step}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: "#f1f5f9", background: "#080c14", border: "1.5px solid #1a2840", outline: "none" }}
      />
    </div>
  );
}
