import React, { createContext, useContext, useState, useEffect, useRef } from "react";

export interface MyProfile {
  publicKey: string;
  username?: string | null;
  name?: string | null;
  avatar?: string | null;
  bio?: string | null;
  followers?: number;
  following?: number;
  twitter?: string | null;
  coinsCreated?: number;
  solBalance?: number;
  solUsd?: number;
  recentCoins?: { mint: string; name: string; symbol: string; marketCap: number }[];
}

interface SettingsContextValue {
  privateKey: string;
  setPrivateKey: (key: string) => void;
  operatorSynced: boolean;
  setOperatorKey: (key: string) => Promise<{ ok: boolean; pubkey?: string; error?: string }>;
  privyToken: string;
  setPrivyToken: (token: string) => void;
  maxDevCoins: number;
  setMaxDevCoins: (n: number) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (v: boolean) => void;
  telegramChatId: string;
  setTelegramChatId: (id: string) => void;
  myProfile: MyProfile | null;
  profileLoading: boolean;
  profileError: string | null;
  refreshProfile: () => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  privateKey: "",
  setPrivateKey: () => {},
  operatorSynced: false,
  setOperatorKey: async () => ({ ok: false, error: "not initialized" }),
  privyToken: "",
  setPrivyToken: () => {},
  maxDevCoins: 20,
  setMaxDevCoins: () => {},
  notificationsEnabled: false,
  setNotificationsEnabled: () => {},
  telegramChatId: "",
  setTelegramChatId: () => {},
  myProfile: null,
  profileLoading: false,
  profileError: null,
  refreshProfile: () => {},
});

const STORAGE_KEY   = "pumpradar_devkey";
const PRIVY_TOK_KEY = "pumpradar_privy_token";
const MAX_DEV_KEY   = "pumpradar_maxdev";
const NOTIF_KEY     = "pumpradar_notif";
const TG_CHAT_KEY   = "pumpradar_tg_chatid";
const BASE          = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [privateKey, setPrivateKeyRaw] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [privyToken, setPrivyTokenRaw] = useState<string>(() => {
    try { return localStorage.getItem(PRIVY_TOK_KEY) ?? ""; } catch { return ""; }
  });
  const [maxDevCoins, setMaxDevCoinsRaw] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(MAX_DEV_KEY) ?? "20", 10) || 20; } catch { return 20; }
  });
  const [notificationsEnabled, setNotifRaw] = useState<boolean>(() => {
    try { return localStorage.getItem(NOTIF_KEY) === "1"; } catch { return false; }
  });
  const [telegramChatId, setTelegramChatIdRaw] = useState<string>(() => {
    try { return localStorage.getItem(TG_CHAT_KEY) ?? ""; } catch { return ""; }
  });

  const [myProfile, setMyProfile]   = useState<MyProfile | null>(null);
  const [profileLoading, setLoading] = useState(false);
  const [profileError, setError]     = useState<string | null>(null);

  const keyRef = useRef(privateKey);
  keyRef.current = privateKey;

  // Re-register stored Telegram chat ID with the backend on mount (clears on server restart)
  useEffect(() => {
    const stored = (() => { try { return localStorage.getItem(TG_CHAT_KEY) ?? ""; } catch { return ""; } })();
    if (stored.trim()) {
      fetch(`${BASE}/api/telegram/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: stored.trim() }),
      }).catch(() => {});
    }
  }, []); // eslint-disable-line

  // On mount, push stored privy token to backend if we have both key + token
  useEffect(() => {
    const storedToken = (() => { try { return localStorage.getItem(PRIVY_TOK_KEY) ?? ""; } catch { return ""; } })();
    const storedKey   = (() => { try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; } })();
    if (storedToken && storedKey) {
      fetch(`${BASE}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: storedToken, privateKey: storedKey }),
      }).catch(() => {});
    }
  }, []); // eslint-disable-line

  const doFetch = async (key: string) => {
    if (!key.trim()) { setMyProfile(null); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/dev/me`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey: key.trim() }),
      });
      const json = await res.json() as MyProfile & { error?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? "Failed to load profile");
        setMyProfile(null);
      } else {
        setMyProfile(json);
        setError(null);
      }
    } catch {
      setError("Network error — check your connection");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void doFetch(privateKey); }, [privateKey]); // eslint-disable-line

  const refreshProfile = () => { void doFetch(keyRef.current); };

  const setPrivateKey = (key: string) => {
    setPrivateKeyRaw(key);
    try {
      if (key) localStorage.setItem(STORAGE_KEY, key);
      else     localStorage.removeItem(STORAGE_KEY);
    } catch {}
    if (!key) { setMyProfile(null); setError(null); }
  };

  const setPrivyToken = (token: string) => {
    setPrivyTokenRaw(token);
    try {
      if (token) localStorage.setItem(PRIVY_TOK_KEY, token);
      else       localStorage.removeItem(PRIVY_TOK_KEY);
    } catch {}
    // Push to backend immediately
    const key = keyRef.current;
    if (token) {
      fetch(`${BASE}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, privateKey: key || undefined }),
      }).catch(() => {});
    }
  };

  const setMaxDevCoins = (n: number) => {
    setMaxDevCoinsRaw(n);
    try { localStorage.setItem(MAX_DEV_KEY, String(n)); } catch {}
  };

  const setNotificationsEnabled = (v: boolean) => {
    setNotifRaw(v);
    try { localStorage.setItem(NOTIF_KEY, v ? "1" : "0"); } catch {}
  };

  const setTelegramChatId = (id: string) => {
    setTelegramChatIdRaw(id);
    try {
      if (id.trim()) localStorage.setItem(TG_CHAT_KEY, id.trim());
      else           localStorage.removeItem(TG_CHAT_KEY);
    } catch {}
    if (id.trim()) {
      fetch(`${BASE}/api/telegram/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: id.trim() }),
      }).catch(() => {});
    } else {
      const prev = (() => { try { return localStorage.getItem(TG_CHAT_KEY) ?? ""; } catch { return ""; } })();
      if (prev) {
        fetch(`${BASE}/api/telegram/register/${encodeURIComponent(prev)}`, { method: "DELETE" }).catch(() => {});
      }
    }
  };

  // ── Operator private key (for AutoChat) — saved to localStorage AND
  //    auto-synced to the server via POST /api/config/operator so the
  //    bot can use it. Same physical key as `privateKey` above.
  const [operatorSynced, setOperatorSynced] = useState<boolean>(false);
  const setOperatorKey = async (key: string): Promise<{ ok: boolean; pubkey?: string; error?: string }> => {
    const trimmed = key.trim();
    try {
      if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
      else         localStorage.removeItem(STORAGE_KEY);
    } catch {}
    if (!trimmed) {
      setOperatorSynced(false);
      return { ok: true };
    }
    try {
      const r = await fetch(`${BASE}/api/config/operator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey: trimmed }),
      });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; pubkey?: string; error?: string };
      if (r.ok && j.ok) {
        setOperatorSynced(true);
        return { ok: true, pubkey: j.pubkey };
      }
      setOperatorSynced(false);
      return { ok: false, error: j.error ?? `Server error ${r.status}` };
    } catch (e) {
      setOperatorSynced(false);
      return { ok: false, error: (e as Error).message };
    }
  };

  return (
    <SettingsContext.Provider value={{
      privateKey, setPrivateKey,
      operatorSynced, setOperatorKey,
      privyToken, setPrivyToken,
      maxDevCoins, setMaxDevCoins,
      notificationsEnabled, setNotificationsEnabled,
      telegramChatId, setTelegramChatId,
      myProfile, profileLoading, profileError, refreshProfile,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
