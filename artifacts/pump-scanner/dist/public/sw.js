/* PumpRadar Service Worker — handles push notifications */
const CACHE_NAME = "pumpradar-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "PumpRadar",
      body: event.data ? event.data.text() : "New message",
    };
  }

  const title   = data.title  || "PumpRadar";
  const isDevMsg = !!(data.data && data.data.isDevMessage);
  const options = {
    body:              data.body  || "New activity",
    icon:              "/icon-192.png",
    badge:             "/icon-192.png",
    tag:               data.tag  || "pumpradar",
    data:              data.data  || {},
    vibrate:           isDevMsg ? [200, 100, 200, 100, 200] : [100, 50, 100],
    requireInteraction: isDevMsg,  // dev replies stay until tapped
    silent:            false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const mint      = notifData.mint;
  const url       = notifData.url || (mint ? `/chat/${mint}` : "/");

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If any tab already has the right chat open, focus it
        for (const client of clientList) {
          if (client.url.includes(mint || "chat") && "focus" in client) {
            return client.focus();
          }
        }
        // If any tab of the app is open, navigate it to the chat
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            void client.navigate(url);
            return client.focus();
          }
        }
        // Otherwise open a new tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
