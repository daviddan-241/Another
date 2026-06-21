/**
 * Frontend push notification helpers.
 * Registers the service worker and manages PushSubscription for specific coins.
 */

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

let swRegistration: ServiceWorkerRegistration | null = null;

export async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  if (swRegistration) return swRegistration;
  try {
    swRegistration = await navigator.serviceWorker.ready;
    return swRegistration;
  } catch {
    return null;
  }
}

export async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    swRegistration = reg;
    return reg;
  } catch (err) {
    console.warn("[push] SW registration failed", err);
    return null;
  }
}

async function getVapidKey(): Promise<string> {
  const r = await fetch(`${BASE}/api/push/vapid-key`);
  const j = await r.json() as { publicKey?: string };
  if (!j.publicKey) throw new Error("No VAPID key from server");
  return j.publicKey;
}

function urlB64ToUint8Array(base64String: string): Buffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array([...raw].map(c => c.charCodeAt(0)));
  return Buffer.from(arr.buffer);
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getSwRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function subscribeToPush(
  mint: string,
  pubkey = "",
  creatorPubkey = "",
): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "Push not supported in this browser" };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, error: "Notifications blocked — enable in browser settings" };

    let reg = await getSwRegistration();
    if (!reg) reg = await registerSw();
    if (!reg) return { ok: false, error: "Service worker failed to register" };

    const vapidKey = await getVapidKey();
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapidKey) as unknown as BufferSource,
      });
    }

    const r = await fetch(`${BASE}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        mint,
        pubkey,
        creatorPubkey,
      }),
    });
    const j = await r.json() as { ok?: boolean; error?: string };
    return j.ok ? { ok: true } : { ok: false, error: j.error };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function unsubscribeFromPush(mint?: string): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  try {
    await fetch(`${BASE}/api/push/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint, mint }),
    });
    if (!mint) await sub.unsubscribe();
  } catch {}
}

export async function sendTestPush(): Promise<{ ok: boolean; error?: string }> {
  const sub = await getCurrentSubscription();
  if (!sub) return { ok: false, error: "Not subscribed yet — enable notifications first" };
  try {
    const r = await fetch(`${BASE}/api/push/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    const j = await r.json() as { ok?: boolean; error?: string };
    return j.ok ? { ok: true } : { ok: false, error: j.error };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
