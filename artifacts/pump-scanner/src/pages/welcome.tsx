import React, { useState } from "react";
import { useLocation } from "wouter";
import { useSettings } from "@/contexts/settings-context";

export const SEEN_KEY = "pumpradar_seen";

export function markSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch {}
}

export function hasSeen(): boolean {
  try { return !!localStorage.getItem(SEEN_KEY); } catch { return false; }
}

export default function WelcomePage() {
  const [, nav] = useLocation();
  const { privateKey, setPrivateKey, myProfile, profileLoading, profileError } = useSettings();

  const [keyDraft, setKeyDraft] = useState(privateKey);
  const [showKey, setShowKey]   = useState(false);
  const [saving,  setSaving]    = useState(false);

  const canSave = keyDraft.trim().length > 30;

  const handleStart = async () => {
    if (canSave && keyDraft.trim() !== privateKey) {
      setSaving(true);
      setPrivateKey(keyDraft.trim());
      await new Promise((r) => setTimeout(r, 300));
      setSaving(false);
    }
    markSeen();
    nav("/");
  };

  const handleSkip = () => {
    markSeen();
    nav("/");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c14",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px 48px",
      boxSizing: "border-box",
    }}>
      {/* Blue glow at top */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 300,
        background: "linear-gradient(180deg, rgba(37,99,235,0.12) 0%, transparent 100%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 460 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 60, height: 60, borderRadius: 18, background: "#2563eb", marginBottom: 16, boxShadow: "0 8px 32px rgba(37,99,235,0.4)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/>
              <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/>
              <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/>
              <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/>
              <circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>
            </svg>
          </div>
          <h1 style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 32, color: "#f1f5f9", margin: "0 0 6px", letterSpacing: "-0.03em" }}>
            PumpRadar
          </h1>
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#475569", letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>
            Pump.fun · Four.meme · Raydium · Birdeye · +chains · &lt;$5K MC
          </p>
        </div>

        {/* Feature pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 32 }}>
          {[
            { icon: "🔴", label: "Live Streams" },
            { icon: "💬", label: "Real Chat" },
            { icon: "🔒", label: "Chat Lock" },
            { icon: "🚫", label: "Ban Users" },
            { icon: "📲", label: "Telegram Alerts" },
          ].map(({ icon, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid #1a2840", fontFamily: "monospace", fontSize: 11, color: "#94a3b8" }}>
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Main card */}
        <div style={{ borderRadius: 20, border: "1px solid #1a2840", background: "#0f1520", boxShadow: "0 4px 32px rgba(0,0,0,0.4)", marginBottom: 20, overflow: "hidden" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, rgba(37,99,235,0.1), #2563eb, rgba(37,99,235,0.1))" }} />
          <div style={{ padding: "24px 20px" }}>

            <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#60a5fa", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              🔑 Solana Private Key
            </div>

            <h2 style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 18, color: "#f1f5f9", margin: "0 0 8px" }}>
              Connect your wallet to unlock everything
            </h2>

            <p style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b", lineHeight: 1.7, marginBottom: 20 }}>
              Paste your <strong style={{ color: "#60a5fa" }}>base58 private key</strong> from Phantom or Solflare.
              Unlocks real chat, chat lock, bans — signed directly on pump.fun.{" "}
              <span style={{ color: "#60a5fa" }}>Saved locally in your browser — never sent to any server.</span>
            </p>

            {/* Key input */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                type={showKey ? "text" : "password"}
                style={{ width: "100%", boxSizing: "border-box", borderRadius: 14, padding: "15px 50px 15px 16px", fontFamily: "monospace", fontSize: 14, color: "#f1f5f9", background: "#080c14", border: "1.5px solid #1a2840", outline: "none" }}
                onFocus={(e) => { e.target.style.borderColor = "#3b82f6"; e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.15)"; }}
                onBlur={(e) => { e.target.style.borderColor = "#1a2840"; e.target.style.boxShadow = "none"; }}
                placeholder="Paste base58 private key here…"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={() => setShowKey(v => !v)}
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#475569", padding: 4 }}
              >
                {showKey
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>

            {/* Phantom hint */}
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 12, background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "#60a5fa", margin: 0, lineHeight: 1.7 }}>
                <strong>Export from Phantom:</strong> Settings → Security &amp; Privacy → Export Private Key → Copy
              </p>
            </div>

            {/* Validating */}
            {profileLoading && (
              <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid #1a2840", display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}>
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
                </svg>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>Validating key…</span>
              </div>
            )}

            {/* Profile found */}
            {myProfile && !profileLoading && (
              <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", display: "flex", alignItems: "center", gap: 12 }}>
                {myProfile.avatar
                  ? <img src={myProfile.avatar} alt="avatar" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid rgba(59,130,246,0.4)" }} />
                  : <div style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, background: "rgba(59,130,246,0.15)", border: "2px solid rgba(59,130,246,0.3)", color: "#60a5fa", flexShrink: 0 }}>
                      {((myProfile.name ?? myProfile.username) || "?")[0]?.toUpperCase()}
                    </div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#60a5fa" }}>
                    ✓ {myProfile.name ?? myProfile.username ?? "Wallet found"}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    ◎ {(myProfile.solBalance ?? 0).toFixed(3)} SOL · {myProfile.coinsCreated ?? 0} coins created
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {profileError && !profileLoading && keyDraft.trim() && (
              <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <p style={{ fontFamily: "monospace", fontSize: 11, color: "#ef4444", margin: 0 }}>⚠ {profileError}</p>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={() => void handleStart()}
              disabled={saving}
              style={{
                width: "100%", padding: "16px 0",
                borderRadius: 14, border: "none",
                fontFamily: "monospace", fontSize: 14, fontWeight: 800,
                cursor: saving ? "wait" : "pointer",
                background: canSave ? "#2563eb" : "rgba(255,255,255,0.05)",
                color: canSave ? "#ffffff" : "#334155",
                transition: "all 0.2s",
                letterSpacing: "0.02em",
                boxShadow: canSave ? "0 4px 20px rgba(37,99,235,0.4)" : "none",
              }}
            >
              {saving ? "Loading…" : canSave
                ? (myProfile ? "✓ Start Scanning" : "Connect & Start Scanning")
                : "Paste your key above to connect"
              }
            </button>
          </div>
        </div>

        {/* Feature list */}
        <div style={{ borderRadius: 16, padding: "18px 20px", marginBottom: 20, background: "#0f1520", border: "1px solid #1a2840" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569", marginBottom: 14 }}>
            With your key active:
          </div>
          {[
            { emoji: "📡", title: "Real-time scanner", desc: "pump.fun, four.meme, Birdeye, Raydium, Orca, Meteora, PancakeSwap, Uniswap and more — every Discord-linked coin under $5K MC, pushed to your Telegram." },
            { emoji: "📊", title: "Live coin stats", desc: "Market cap, reply count, holder count, and live status pulled straight from pump.fun" },
            { emoji: "🔒", title: "Chat lock (in-app)", desc: "Lock your coin's in-app chat so only you can post" },
            { emoji: "🚫", title: "User ban (in-app)", desc: "Remove users from your coin's in-app chat" },
            { emoji: "📲", title: "Telegram alerts", desc: "Get notified when new coins are detected or replies come in" },
          ].map(({ emoji, title, desc }, i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginBottom: i < 4 ? 14 : 0 }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>{title}</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Skip */}
        <div style={{ textAlign: "center" }}>
          <button
            onClick={handleSkip}
            style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: 12, color: "#334155", textDecoration: "underline", textDecorationColor: "rgba(51,65,85,0.4)", padding: 8 }}
          >
            Skip — browse without a key (read-only mode)
          </button>
        </div>

      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
