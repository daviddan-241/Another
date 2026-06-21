import React, { useState } from "react";
import { useLocation } from "wouter";
import { useSettings } from "@/contexts/settings-context";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const S = {
  page: {
    minHeight: "100vh",
    background: "hsl(150,18%,6%)",
    display: "flex",
    flexDirection: "column" as const,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    background: "hsl(150,18%,7%)",
    borderBottom: "1px solid hsla(150,15%,14%,0.8)",
    boxShadow: "0 1px 0 hsla(45,95%,55%,0.07)",
    flexShrink: 0,
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "hsla(150,15%,13%,0.8)", border: "1px solid hsla(150,15%,20%,0.5)",
    color: "hsl(150,8%,55%)", cursor: "pointer", flexShrink: 0,
  },
  title: {
    fontFamily: "monospace", fontWeight: 800, fontSize: 16,
    color: "hsl(45,95%,62%)", letterSpacing: "0.04em",
  },
  body: {
    flex: 1, overflowY: "auto" as const, overscrollBehavior: "contain" as const,
    padding: "20px 16px 60px",
    display: "flex", flexDirection: "column" as const, gap: 20,
    maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" as const,
  },
  card: {
    borderRadius: 16, overflow: "hidden" as const,
    border: "1px solid hsla(150,15%,15%,0.7)",
    background: "hsla(150,20%,7%,0.95)",
  },
  cardTop: {
    height: 2,
    background: "linear-gradient(90deg, hsla(45,95%,55%,0.2), hsl(45,95%,55%), hsla(45,95%,55%,0.2))",
  },
  cardBody: { padding: "18px 16px" },
  sectionLabel: {
    fontFamily: "monospace", fontSize: 10, fontWeight: 700,
    textTransform: "uppercase" as const, letterSpacing: "0.1em",
    color: "hsl(150,8%,40%)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6,
  },
  input: {
    width: "100%", boxSizing: "border-box" as const,
    borderRadius: 12, padding: "14px 16px",
    fontFamily: "monospace",
    /* 16px prevents iOS zoom on focus */
    fontSize: 16,
    color: "hsl(0,0%,92%)",
    background: "hsla(150,15%,10%,0.95)",
    border: "1.5px solid hsla(150,15%,20%,0.7)",
    outline: "none", marginBottom: 10,
  },
  btnGold: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "13px 0", borderRadius: 12, width: "100%", border: "none",
    fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: "pointer",
    background: "linear-gradient(135deg, hsl(45,95%,55%), hsl(36,80%,46%))",
    color: "hsl(150,18%,5%)",
  },
  btnGoldDisabled: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "13px 0", borderRadius: 12, width: "100%", border: "none",
    fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: "not-allowed",
    background: "hsla(45,60%,40%,0.3)", color: "hsl(150,8%,35%)",
  },
  btnOutline: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    padding: "13px 0", borderRadius: 12, width: "100%",
    fontFamily: "monospace", fontSize: 12, fontWeight: 700, cursor: "pointer",
    background: "transparent", border: "1.5px solid hsla(0,70%,45%,0.35)",
    color: "hsl(0,70%,62%)",
  },
  hint: {
    fontFamily: "monospace", fontSize: 11, color: "hsl(150,8%,42%)", lineHeight: 1.7,
  },
  row: { display: "flex", gap: 8 },
  pill: (active: boolean) => ({
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "13px 14px", borderRadius: 12, cursor: "pointer",
    background: active ? "hsla(45,80%,40%,0.08)" : "hsla(150,15%,10%,0.7)",
    border: `1.5px solid ${active ? "hsla(45,95%,55%,0.22)" : "hsla(150,15%,18%,0.6)"}`,
    marginBottom: 8,
  }),
  toggle: (active: boolean) => ({
    width: 42, height: 24, borderRadius: 12, position: "relative" as const,
    background: active ? "hsl(45,95%,55%)" : "hsla(150,15%,18%,0.8)",
    transition: "background 0.2s", flexShrink: 0,
  }),
  toggleThumb: (active: boolean) => ({
    position: "absolute" as const, top: 4,
    width: 16, height: 16, borderRadius: "50%",
    background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
    transition: "left 0.2s", left: active ? 22 : 4,
  }),
};

const Spinner = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M8 16H3v5"/>
  </svg>
);

export default function SettingsPage() {
  const [, nav] = useLocation();
  const {
    privateKey, setPrivateKey,
    privyToken, setPrivyToken,
    maxDevCoins, setMaxDevCoins,
    notificationsEnabled, setNotificationsEnabled,
    telegramChatId, setTelegramChatId,
    myProfile, profileLoading, refreshProfile,
  } = useSettings();

  const [keyDraft, setKeyDraft]         = useState(privateKey);
  const [showKey, setShowKey]           = useState(false);
  const [keySaved, setKeySaved]         = useState(false);

  const [tokenDraft, setTokenDraft]     = useState(privyToken);
  const [tokenSaved, setTokenSaved]     = useState(false);
  const [tokenSaving, setTokenSaving]   = useState(false);
  const [tokenMsg, setTokenMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  // Auto-link wallet state
  const [autoLinking, setAutoLinking]   = useState(false);
  const [autoLinkMsg, setAutoLinkMsg]   = useState<{ ok: boolean; text: string } | null>(null);
  const [showManual, setShowManual]     = useState(false);

  const [tgDraft, setTgDraft]           = useState(telegramChatId);
  const [tgTesting, setTgTesting]       = useState(false);
  const [tgMsg, setTgMsg]               = useState<{ ok: boolean; text: string } | null>(null);
  const [tgSaved, setTgSaved]           = useState(false);

  const [scannerRunning, setScannerRunning] = useState<boolean | null>(null);
  const [scannerBusy, setScannerBusy]       = useState(false);
  const [scannerMsg, setScannerMsg]         = useState<string | null>(null);

  // ── Poll scanner status ──────────────────────────────────────────────
  React.useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch(`${BASE}/api/scanner/status`);
        const j = await r.json() as { running?: boolean };
        if (!stop) setScannerRunning(!!j.running);
      } catch { if (!stop) setScannerRunning(null); }
    };
    void poll();
    const id = setInterval(() => void poll(), 5_000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  // ── Helpers: read real error from response ───────────────────────────
  async function parseError(r: Response): Promise<string> {
    try {
      const j = await r.json() as { error?: string; message?: string };
      return j.error ?? j.message ?? `Server error ${r.status}`;
    } catch {
      return `Server error ${r.status}`;
    }
  }

  // ── Scanner actions ──────────────────────────────────────────────────
  const restartScanner = async () => {
    setScannerBusy(true); setScannerMsg(null);
    try {
      const r = await fetch(`${BASE}/api/scanner/restart`, { method: "POST" });
      const j = await r.json() as { running?: boolean; message?: string };
      setScannerRunning(!!j.running);
      setScannerMsg(j.message ?? "Restarted");
      setTimeout(() => setScannerMsg(null), 3500);
    } catch { setScannerMsg("Network error — check connection"); }
    finally { setScannerBusy(false); }
  };

  const startScanner = async () => {
    setScannerBusy(true); setScannerMsg(null);
    try {
      const r = await fetch(`${BASE}/api/scanner/start`, { method: "POST" });
      const j = await r.json() as { running?: boolean; message?: string };
      setScannerRunning(!!j.running);
      setScannerMsg(j.message ?? "Started");
      setTimeout(() => setScannerMsg(null), 3500);
    } catch { setScannerMsg("Network error — check connection"); }
    finally { setScannerBusy(false); }
  };

  const stopScanner = async () => {
    setScannerBusy(true); setScannerMsg(null);
    try {
      const r = await fetch(`${BASE}/api/scanner/stop`, { method: "POST" });
      const j = await r.json() as { running?: boolean; message?: string };
      setScannerRunning(!!j.running);
      setScannerMsg(j.message ?? "Stopped");
      setTimeout(() => setScannerMsg(null), 3500);
    } catch { setScannerMsg("Network error — check connection"); }
    finally { setScannerBusy(false); }
  };

  // ── Key actions ──────────────────────────────────────────────────────
  const saveKey = () => {
    setPrivateKey(keyDraft.trim());
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2500);
  };

  const clearKey = () => { setKeyDraft(""); setPrivateKey(""); };

  // ── Auto-Link Wallet ─────────────────────────────────────────────────
  const autoLinkWallet = async () => {
    const key = privateKey.trim() || keyDraft.trim();
    if (!key) return;
    setAutoLinking(true); setAutoLinkMsg(null);
    try {
      const r = await fetch(`${BASE}/api/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey: key }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) {
        const errText = await parseError(r);
        setAutoLinkMsg({ ok: false, text: errText });
        return;
      }
      const j = await r.json() as { token?: string; tokens?: string[]; error?: string };
      if (!j.token) {
        setAutoLinkMsg({ ok: false, text: j.error ?? "No token returned — try the manual method below." });
        return;
      }
      setPrivyToken(j.token);
      setTokenDraft(j.token);
      setAutoLinkMsg({ ok: true, text: "✓ Wallet linked — pump.fun chat ready!" });
      setTimeout(() => setAutoLinkMsg(null), 5000);
    } catch (err) {
      const name = (err as Error).name;
      if (name === "TimeoutError") {
        setAutoLinkMsg({ ok: false, text: "Timed out — Privy took too long. Try the manual method below." });
      } else {
        setAutoLinkMsg({ ok: false, text: "Network error — check your connection and try again." });
      }
    } finally {
      setAutoLinking(false);
    }
  };

  // ── Manual session token ─────────────────────────────────────────────
  const saveToken = async () => {
    const tok = tokenDraft.trim();
    if (!tok) return;
    setTokenSaving(true); setTokenMsg(null);
    try {
      const r = await fetch(`${BASE}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tok, privateKey: privateKey || undefined }),
      });
      if (!r.ok) {
        const errText = await parseError(r);
        setTokenMsg({ ok: false, text: errText });
        return;
      }
      const j = await r.json() as { ok?: boolean; extractedAppId?: string; error?: string };
      if (j.ok) {
        setPrivyToken(tok);
        setTokenSaved(true);
        setTokenMsg({ ok: true, text: `✓ Token saved${j.extractedAppId ? ` (App ID: ${j.extractedAppId.slice(0, 12)}…)` : ""}` });
        setTimeout(() => { setTokenSaved(false); setTokenMsg(null); }, 4000);
      } else {
        setTokenMsg({ ok: false, text: j.error ?? "Failed to save token" });
      }
    } catch {
      setTokenMsg({ ok: false, text: "Network error — check your connection and try again." });
    } finally {
      setTokenSaving(false);
    }
  };

  const clearToken = () => { setTokenDraft(""); setPrivyToken(""); setTokenMsg(null); setAutoLinkMsg(null); };

  // ── Telegram ─────────────────────────────────────────────────────────
  const testTg = async () => {
    const id = tgDraft.trim();
    if (!id) return;
    setTelegramChatId(id);
    setTgTesting(true); setTgMsg(null);
    try {
      const r = await fetch(`${BASE}/api/telegram/test/${encodeURIComponent(id)}`);
      if (!r.ok) {
        const errText = await parseError(r);
        setTgMsg({ ok: false, text: errText });
        return;
      }
      const j = await r.json() as { ok?: boolean; error?: string };
      setTgMsg({ ok: !!j.ok, text: j.ok ? "✓ Message sent — check Telegram!" : String(j.error ?? "Failed") });
    } catch { setTgMsg({ ok: false, text: "Network error — check your connection." }); }
    finally { setTgTesting(false); }
  };

  const saveTg = () => {
    setTelegramChatId(tgDraft.trim());
    setTgSaved(true); setTimeout(() => setTgSaved(false), 2000);
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

  const keyChanged = keyDraft.trim() !== privateKey;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => nav("/")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <span style={S.title}>⚙ Settings</span>
        {myProfile && (
          <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 11, color: "hsl(150,65%,50%)", background: "hsla(150,60%,30%,0.1)", padding: "4px 10px", borderRadius: 8, border: "1px solid hsla(150,60%,35%,0.2)" }}>
            ✓ {myProfile.username ?? myProfile.name ?? "Key loaded"}
          </span>
        )}
      </div>

      <div style={S.body}>

        {/* ── Profile card ── */}
        {myProfile && (
          <div style={S.card}>
            <div style={S.cardTop} />
            <div style={{ ...S.cardBody, display: "flex", alignItems: "center", gap: 14 }}>
              {myProfile.avatar
                ? <img src={myProfile.avatar} alt="avatar" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid hsla(45,95%,55%,0.3)", flexShrink: 0 }} />
                : <div style={{ width: 52, height: 52, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, background: "hsla(45,80%,45%,0.14)", border: "1.5px solid hsla(45,95%,55%,0.25)", color: "hsl(45,95%,60%)", flexShrink: 0 }}>
                    {((myProfile.name ?? myProfile.username) || "?")[0]?.toUpperCase()}
                  </div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "hsl(0,0%,95%)" }}>{myProfile.name ?? myProfile.username ?? "No name"}</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "hsl(150,8%,45%)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myProfile.publicKey?.slice(0, 18)}…</div>
                <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "hsl(45,95%,60%)", fontWeight: 700 }}>◎ {(myProfile.solBalance ?? 0).toFixed(3)}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "hsl(150,8%,40%)" }}>{myProfile.coinsCreated ?? 0} coins</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "hsl(150,8%,40%)" }}>{myProfile.followers ?? 0} followers</span>
                </div>
              </div>
              <button onClick={refreshProfile} disabled={profileLoading} style={{ background: "transparent", border: "none", cursor: "pointer", color: "hsl(150,8%,40%)", padding: 6, flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={profileLoading ? { animation: "spin 1s linear infinite" } : {}}>
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── PUMP.FUN CHAT AUTH ── */}
        <div style={S.card}>
          <div style={S.cardTop} />
          <div style={S.cardBody}>
            <div style={S.sectionLabel}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="hsl(45,95%,55%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Pump.fun Session Token
            </div>

            <p style={{ ...S.hint, marginBottom: 14 }}>
              Unlocks <strong style={{ color: "hsl(45,95%,60%)" }}>real pump.fun livechat</strong> — comments appear for everyone on pump.fun instantly.<br /><br />
              Needed to post messages and read live chat. One-time setup — chat stays active until the token expires.
            </p>

            {/* AUTO-LINK section */}
            <div style={{ borderRadius: 12, padding: "14px 14px", background: "hsla(150,60%,25%,0.08)", border: "1px solid hsla(150,60%,35%,0.2)", marginBottom: 14 }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "hsl(150,60%,45%)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                Auto-Link via Private Key
              </div>
              <p style={{ ...S.hint, color: "hsl(150,8%,50%)", marginBottom: 12, fontSize: 11 }}>
                PumpRadar uses your saved private key to authenticate automatically — no bookmarklet or manual steps needed.
              </p>
              <button
                onClick={() => void autoLinkWallet()}
                disabled={autoLinking || (!privateKey.trim() && !keyDraft.trim())}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  padding: "13px 0", borderRadius: 12, width: "100%", border: "none",
                  fontFamily: "monospace", fontSize: 13, fontWeight: 700, cursor: autoLinking || (!privateKey.trim() && !keyDraft.trim()) ? "not-allowed" : "pointer",
                  background: autoLinking || (!privateKey.trim() && !keyDraft.trim())
                    ? "hsla(45,60%,40%,0.3)"
                    : "linear-gradient(135deg, hsl(45,95%,55%), hsl(36,80%,46%))",
                  color: autoLinking || (!privateKey.trim() && !keyDraft.trim()) ? "hsl(150,8%,35%)" : "hsl(150,18%,5%)",
                }}
              >
                {autoLinking ? <><Spinner /> Linking…</> : "🔑 Auto-Link Wallet"}
              </button>
              {!privateKey.trim() && !keyDraft.trim() && (
                <p style={{ fontFamily: "monospace", fontSize: 10, color: "hsl(150,8%,35%)", margin: "8px 0 0", textAlign: "center" }}>
                  Save your private key below first
                </p>
              )}
              {autoLinkMsg && (
                <p style={{ fontFamily: "monospace", fontSize: 11, color: autoLinkMsg.ok ? "hsl(150,65%,52%)" : "hsl(0,70%,65%)", margin: "10px 0 0", lineHeight: 1.5 }}>
                  {autoLinkMsg.text}
                </p>
              )}
            </div>

            {/* Manual method toggle */}
            <button
              onClick={() => setShowManual(v => !v)}
              style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: 11, color: "hsl(150,8%,45%)", display: "flex", alignItems: "center", gap: 5, padding: "4px 0", marginBottom: showManual ? 14 : 0 }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showManual ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {showManual ? "▲ Hide manual method" : "▼ Get token manually on iPhone"}
            </button>

            {showManual && (
              <>
                {/* iPhone steps */}
                <div style={{ borderRadius: 12, padding: "14px 14px", background: "hsla(150,15%,8%,0.8)", border: "1px solid hsla(150,15%,16%,0.6)", marginBottom: 14 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "hsl(150,8%,40%)", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
                    📱 Get Token Manually on iPhone
                  </div>
                  {[
                    "Open pump.fun in Safari. Log in — email or wallet both work.",
                    "Tap the Share button → Add Bookmark → save it anywhere.",
                    "Open Bookmarks → find that bookmark → swipe left → Edit.",
                    "Delete the URL field and paste the code you copy below. Tap Done.",
                    "Back on pump.fun: tap the address bar, type the bookmark name, tap it.",
                    "A dialog appears with your token — select ALL and copy it.",
                    "Come back here and paste it in the field below → tap Link Session.",
                  ].map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < 6 ? 10 : 0 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: "hsla(45,80%,40%,0.2)", border: "1px solid hsla(45,80%,40%,0.3)", color: "hsl(45,80%,60%)" }}>{i + 1}</div>
                      <span style={{ ...S.hint, fontSize: 12, lineHeight: 1.6 }}>{step}</span>
                    </div>
                  ))}
                </div>

                {/* Bookmarklet copy button */}
                <BookmarkletButton />

                {/* Desktop alternative */}
                <details style={{ marginTop: 12, marginBottom: 14 }}>
                  <summary style={{ fontFamily: "monospace", fontSize: 11, color: "hsl(150,8%,40%)", cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    On desktop / Mac instead?
                  </summary>
                  <p style={{ ...S.hint, marginTop: 8, fontSize: 11 }}>
                    Open pump.fun → press <code style={{ background: "hsla(150,15%,12%)", padding: "1px 5px", borderRadius: 4 }}>F12</code> → Application → Local Storage → <code style={{ background: "hsla(150,15%,12%)", padding: "1px 5px", borderRadius: 4 }}>https://pump.fun</code>. Find a key with <strong>privy</strong> and <strong>token</strong> in the name. Copy the value starting with <code style={{ background: "hsla(150,15%,12%)", padding: "1px 5px", borderRadius: 4 }}>eyJ…</code> and paste it below.
                  </p>
                </details>

                {/* Token textarea */}
                <textarea
                  rows={3}
                  style={{
                    ...S.input, fontFamily: "monospace", fontSize: 14,
                    resize: "none" as const, lineHeight: 1.5,
                    borderColor: tokenMsg ? (tokenMsg.ok ? "hsla(150,60%,40%,0.5)" : "hsla(0,70%,45%,0.5)") : "hsla(150,15%,20%,0.7)",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "hsla(45,95%,55%,0.6)"; e.target.style.boxShadow = "0 0 0 3px hsla(45,95%,55%,0.1)"; }}
                  onBlur={(e) => { e.target.style.borderColor = tokenMsg ? (tokenMsg.ok ? "hsla(150,60%,40%,0.5)" : "hsla(0,70%,45%,0.5)") : "hsla(150,15%,20%,0.7)"; e.target.style.boxShadow = "none"; }}
                  placeholder="Paste eyJ… token here"
                  value={tokenDraft}
                  onChange={(e) => { setTokenDraft(e.target.value); setTokenMsg(null); }}
                  autoComplete="off"
                  spellCheck={false}
                />

                {tokenMsg && (
                  <p style={{ fontFamily: "monospace", fontSize: 11, color: tokenMsg.ok ? "hsl(150,65%,52%)" : "hsl(0,70%,65%)", margin: "0 0 10px" }}>
                    {tokenMsg.text}
                  </p>
                )}

                <div style={{ ...S.row, marginTop: 4 }}>
                  <button
                    onClick={() => void saveToken()}
                    disabled={!tokenDraft.trim() || tokenSaving || tokenSaved}
                    style={tokenDraft.trim() && !tokenSaving && !tokenSaved ? S.btnGold : S.btnGoldDisabled}
                  >
                    {tokenSaving ? <><Spinner /> Linking…</> : tokenSaved ? "✓ Token Saved!" : "🔗 Link Session"}
                  </button>
                  {privyToken && (
                    <button onClick={clearToken} style={{ ...S.btnOutline, width: "auto", padding: "13px 16px", flexShrink: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      Clear
                    </button>
                  )}
                </div>
              </>
            )}

            {privyToken && !tokenMsg && !autoLinkMsg && (
              <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 10, background: "hsla(150,60%,30%,0.08)", border: "1px solid hsla(150,60%,35%,0.2)", fontFamily: "monospace", fontSize: 11, color: "hsl(150,65%,50%)" }}>
                ✓ Token active — real pump.fun chat enabled
              </div>
            )}
          </div>
        </div>

        {/* ── PRIVATE KEY ── */}
        <div style={S.card}>
          <div style={S.cardTop} />
          <div style={S.cardBody}>
            <div style={S.sectionLabel}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="hsl(45,95%,55%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              Solana Private Key
            </div>

            <p style={{ ...S.hint, marginBottom: 12 }}>
              Paste your <strong style={{ color: "hsl(45,95%,60%)" }}>base58 private key</strong> from Phantom, Solflare, or any Solana wallet.<br /><br />
              Unlocks: posting in chats, locking chats, banning users, and Telegram alerts.<br /><br />
              <span style={{ color: "hsl(150,60%,48%)" }}>🔐 Saved locally in your browser — never sent unencrypted.</span>
            </p>

            <div style={{ position: "relative", marginBottom: 10 }}>
              <input
                type={showKey ? "text" : "password"}
                style={{ ...S.input, paddingRight: 50, marginBottom: 0 }}
                onFocus={(e) => { e.target.style.borderColor = "hsla(45,95%,55%,0.6)"; e.target.style.boxShadow = "0 0 0 3px hsla(45,95%,55%,0.1)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "hsla(150,15%,20%,0.7)"; e.target.style.boxShadow = "none"; }}
                placeholder="Paste base58 private key here…"
                value={keyDraft}
                onChange={(e) => { setKeyDraft(e.target.value); setKeySaved(false); }}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={() => setShowKey(v => !v)}
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "hsl(150,8%,42%)", padding: 4 }}
              >
                {showKey
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>

            <div style={{ ...S.row, marginTop: 10 }}>
              <button
                onClick={saveKey}
                disabled={!keyDraft.trim() || !keyChanged}
                style={keyDraft.trim() && keyChanged ? S.btnGold : S.btnGoldDisabled}
              >
                {keySaved
                  ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Saved!</>
                  : "Save Key"
                }
              </button>
              {privateKey && (
                <button onClick={clearKey} style={{ ...S.btnOutline, width: "auto", padding: "13px 16px", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  Clear
                </button>
              )}
            </div>

            {!privateKey && (
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "hsla(45,80%,40%,0.07)", border: "1px solid hsla(45,80%,40%,0.18)" }}>
                <p style={{ ...S.hint, color: "hsl(45,80%,58%)", margin: 0 }}>
                  <strong>How to export from Phantom:</strong><br />
                  Settings → Security &amp; Privacy → Export Private Key → Copy
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── WHAT YOU CAN DO ── */}
        <div style={{ ...S.card, background: "hsla(150,20%,7%,0.7)" }}>
          <div style={S.cardBody}>
            <div style={S.sectionLabel}>With your key active you can:</div>
            {[
              { emoji: "💬", text: "Post messages in any pump.fun coin chat" },
              { emoji: "🔒", text: "Lock chat — others get \"failed to send\". Sends a real disable-replies signal to pump.fun (coin creators only on pump.fun's side, but blocks others in PumpRadar too)." },
              { emoji: "🚫", text: "Ban wallets from your coin's chat on pump.fun" },
              { emoji: "📲", text: "Get Telegram DMs when new replies appear on coins you're watching" },
            ].map(({ emoji, text }, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: i < 3 ? 12 : 0 }}>
                <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{emoji}</span>
                <span style={{ ...S.hint }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── TELEGRAM ── */}
        <div style={S.card}>
          <div style={S.cardTop} />
          <div style={S.cardBody}>
            <div style={S.sectionLabel}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="hsl(45,95%,55%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Telegram Alerts
            </div>
            <p style={{ ...S.hint, marginBottom: 12 }}>
              Get a Telegram DM every time someone replies on a coin you're watching.{" "}
              <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" style={{ color: "hsl(45,95%,60%)", fontWeight: 700 }}>Open @userinfobot</a>{" "}
              on Telegram — it replies with your chat ID. Paste it below.
            </p>
            <input
              type="text"
              inputMode="numeric"
              style={{ ...S.input, borderColor: tgMsg ? (tgMsg.ok ? "hsla(150,60%,40%,0.5)" : "hsla(0,70%,45%,0.5)") : "hsla(150,15%,20%,0.7)" }}
              onFocus={(e) => { e.target.style.borderColor = "hsla(45,95%,55%,0.6)"; }}
              onBlur={(e)  => { e.target.style.borderColor = tgMsg ? (tgMsg.ok ? "hsla(150,60%,40%,0.5)" : "hsla(0,70%,45%,0.5)") : "hsla(150,15%,20%,0.7)"; }}
              placeholder="Your Telegram chat ID (e.g. 123456789)"
              value={tgDraft}
              onChange={(e) => { setTgDraft(e.target.value); setTgMsg(null); setTgSaved(false); }}
            />
            {tgMsg && <p style={{ fontFamily: "monospace", fontSize: 11, color: tgMsg.ok ? "hsl(150,65%,52%)" : "hsl(0,70%,65%)", margin: "0 0 10px" }}>{tgMsg.text}</p>}
            <div style={S.row}>
              <button onClick={saveTg} disabled={!tgDraft.trim() || tgDraft.trim() === telegramChatId} style={tgDraft.trim() && tgDraft.trim() !== telegramChatId ? S.btnGold : { ...S.btnGoldDisabled }}>
                {tgSaved ? "✓ Saved" : "Save"}
              </button>
              <button
                onClick={() => void testTg()}
                disabled={!tgDraft.trim() || tgTesting}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "13px 0", borderRadius: 12, border: "1.5px solid hsla(150,15%,22%,0.6)", fontFamily: "monospace", fontSize: 12, fontWeight: 700, cursor: "pointer", background: "transparent", color: "hsl(150,8%,60%)" }}
              >
                {tgTesting ? <Spinner /> : "Send Test"}
              </button>
              {telegramChatId && (
                <button onClick={() => { setTgDraft(""); setTelegramChatId(""); setTgMsg(null); }}
                  style={{ padding: "13px 14px", borderRadius: 12, background: "transparent", border: "1.5px solid hsla(0,70%,45%,0.3)", color: "hsl(0,70%,60%)", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── BROWSER NOTIFICATIONS ── */}
        {typeof window !== "undefined" && "Notification" in window && (
          <div style={S.card}>
            <div style={S.cardBody}>
              <div style={S.sectionLabel}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="hsl(45,95%,55%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                Browser Notifications
              </div>
              <div style={S.pill(notificationsEnabled)} onClick={() => void toggleNotif()}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "hsl(0,0%,90%)" }}>
                    {notificationsEnabled ? "🔔 Notifications ON" : "🔕 Notifications OFF"}
                  </span>
                </div>
                <div style={S.toggle(notificationsEnabled)}>
                  <div style={S.toggleThumb(notificationsEnabled)} />
                </div>
              </div>
              {Notification.permission === "denied" && (
                <p style={{ ...S.hint, color: "hsl(0,70%,60%)", marginTop: 4 }}>⚠ Blocked by browser. Go to site settings to allow.</p>
              )}
            </div>
          </div>
        )}

        {/* ── DEV FILTER ── */}
        <div style={S.card}>
          <div style={S.cardBody}>
            <div style={S.sectionLabel}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="hsl(45,95%,55%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              Dev Launch Filter
            </div>
            <p style={{ ...S.hint, marginBottom: 12 }}>Hide coins from devs who've launched too many tokens before — high-launch devs often dump.</p>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "hsl(150,8%,50%)" }}>Max launches allowed</span>
              <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "hsl(45,95%,55%)" }}>
                {maxDevCoins >= 100 ? "Any amount" : `≤ ${maxDevCoins}`}
              </span>
            </div>
            <input
              type="range" min={1} max={100} value={maxDevCoins}
              onChange={(e) => setMaxDevCoins(parseInt(e.target.value, 10))}
              style={{ width: "100%", accentColor: "hsl(45,95%,55%)", marginBottom: 6 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: 9, color: "hsl(150,8%,30%)" }}>
              <span>1 (strict)</span><span>50</span><span>100 (off)</span>
            </div>
          </div>
        </div>

        {/* ── SCANNER ── */}
        <div style={S.card}>
          <div style={S.cardTop} />
          <div style={S.cardBody}>
            <div style={S.sectionLabel}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="hsl(45,95%,55%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
              Scanner
            </div>
            <p style={{ ...S.hint, marginBottom: 12 }}>
              Scans every 15s across <strong style={{ color: "hsl(45,95%,60%)" }}>pump.fun, four.meme, Birdeye, Raydium, Orca, Meteora, PancakeSwap, Uniswap</strong> and more. Only coins under <strong style={{ color: "hsl(45,95%,60%)" }}>$5K MC</strong> with a real Discord invite are kept.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "hsla(150,15%,10%,0.7)", border: "1px solid hsla(150,15%,18%,0.6)" }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: scannerRunning === null ? "hsl(45,80%,50%)" : scannerRunning ? "hsl(150,70%,50%)" : "hsl(0,70%,55%)",
                boxShadow: scannerRunning ? "0 0 8px hsla(150,70%,50%,0.7)" : undefined,
                flexShrink: 0,
              }} />
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "hsl(0,0%,88%)", fontWeight: 700 }}>
                {scannerRunning === null ? "Checking…" : scannerRunning ? "Scanner running" : "Scanner stopped"}
              </span>
              {scannerMsg && (
                <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 10, color: "hsl(150,65%,55%)" }}>{scannerMsg}</span>
              )}
            </div>

            <div style={S.row}>
              <button onClick={() => void restartScanner()} disabled={scannerBusy} style={scannerBusy ? S.btnGoldDisabled : S.btnGold}>
                {scannerBusy ? <Spinner /> : <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                  Restart Scanner
                </>}
              </button>
              {scannerRunning
                ? <button onClick={() => void stopScanner()} disabled={scannerBusy} style={{ ...S.btnOutline, width: "auto", padding: "13px 16px", flexShrink: 0 }}>Stop</button>
                : <button onClick={() => void startScanner()} disabled={scannerBusy} style={{ ...S.btnOutline, width: "auto", padding: "13px 16px", flexShrink: 0, borderColor: "hsla(150,60%,40%,0.5)", color: "hsl(150,70%,55%)" }}>Start</button>
              }
            </div>

            <p style={{ ...S.hint, fontSize: 10, marginTop: 10, color: "hsl(150,8%,38%)" }}>
              "Restart" purges the in-memory cache so old coins are cleared and the scan starts fresh.
            </p>
          </div>
        </div>

        {/* ── SECURITY ── */}
        <div style={{ borderRadius: 14, padding: "14px 16px", background: "hsla(45,80%,35%,0.04)", border: "1px solid hsla(45,80%,40%,0.14)" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "hsl(45,80%,52%)", marginBottom: 6 }}>⚠ Security</div>
          <p style={{ ...S.hint, margin: 0 }}>
            Your private key is stored in browser session memory only. It is sent to our server only to sign messages on pump.fun — exactly like any browser wallet. Close the tab to clear it. Never share your private key with anyone.
          </p>
        </div>

      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Bookmarklet copy button ─────────────────────────────────────────── */
function BookmarkletButton() {
  const [copied, setCopied] = useState(false);

  const bookmarklet = `javascript:(function(){var t=window.localStorage.getItem(Object.keys(window.localStorage).find(k=>k.includes('privy')&&k.includes('token'))||'');if(t){alert(t);}else{alert('Not found. Make sure you are logged in to pump.fun.');}})();`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const el = document.createElement("textarea");
      el.value = bookmarklet;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <button
      onClick={() => void copy()}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
        padding: "13px 0", borderRadius: 12, width: "100%", marginBottom: 4,
        fontFamily: "monospace", fontSize: 12, fontWeight: 700, cursor: "pointer",
        background: copied ? "hsla(150,60%,30%,0.12)" : "hsla(45,80%,40%,0.12)",
        border: `1.5px solid ${copied ? "hsla(150,60%,35%,0.4)" : "hsla(45,80%,40%,0.3)"}`,
        color: copied ? "hsl(150,65%,52%)" : "hsl(45,80%,60%)",
      }}
    >
      {copied
        ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
        : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy Bookmarklet Code (for step 4)</>
      }
    </button>
  );
}
