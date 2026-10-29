// Imported scripts participate in the browser's update check. This manifest is
// generated after every production build, so an unchanged worker still gets a
// new cache when the deployed route chunks change.
importScripts("/offline-manifest.js");
const { version, assets, routes } = self.__ZEN_PRECACHE;
const CACHE_PREFIX = "zen-workspace-cache-";
const CACHE_NAME = CACHE_PREFIX + version;
const SHELL_ROUTES = new Set(routes);

self.addEventListener("install", (event) => {
  // Install is atomic: do not activate an incomplete new shell or replace a
  // working offline version when any required route/chunk cannot be fetched.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(assets)));
  // Let existing tabs finish on their current version before activating.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((name) => {
      // Remove the old authenticated API-response cache as well. User data is
      // stored by account in IndexedDB, never in the service worker cache.
      if ((name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) || name.startsWith("zen-api-cache-")) {
        return caches.delete(name);
      }
    }))).then(() => self.clients.claim())
  );
});

// ─── Push Notifications (web / PWA) ───────────────────────────────────────────
// On native Android, FCM delivers notifications via @capacitor/push-notifications.
// This handler covers the PWA / browser path where the service worker receives
// push events from a Web Push subscription.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let title = "Zen Workspace";
  let body = "You have a new reminder";

  try {
    const payload = event.data.json();
    title = payload.notification?.title ?? payload.title ?? title;
    body = payload.notification?.body ?? payload.body ?? body;
  } catch {
    body = event.data.text() || body;
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
      tag: "zen-reminder",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow("/reminders");
        }
      })
  );
});

// ─── Background Sync ──────────────────────────────────────────────────────────
// When the browser fires the 'zen-sync' tag (registered via enqueue() in
// sync-queue.ts), we cannot access Dexie or Supabase directly from the SW
// context, so we delegate back to every open page via postMessage.  The page
// listens for ZEN_SYNC_PUSH and calls pushQueue() from sync-engine.ts.
self.addEventListener("sync", (event) => {
  if (event.tag === "zen-sync") {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true, type: "window" })
        .then((clients) => {
          // A worker cannot authenticate and replay the queue itself. Keep
          // the tag pending for a later browser retry when no app page is open.
          if (clients.length === 0) throw new Error("Open Zen Workspace to sync");
          for (const client of clients) {
            client.postMessage({ type: "ZEN_SYNC_PUSH" });
          }
        })
    );
  }
});

// Only public app-shell resources belong in this cache. In particular, never
// intercept Supabase calls, auth requests, API responses, or public-share pages.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const pathname = url.pathname.replace(/\/$/, "") || "/";
  const isShell = SHELL_ROUTES.has(pathname);
  const isStatic = url.pathname.startsWith("/_next/static/") || assets.includes(url.pathname);
  if (!isShell && !isStatic) return;

  if (isShell) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        // RSC requests must not be cached under an HTML key (their headers and
        // router-tree query vary). A cached text/html response makes Next's
        // fetchServerResponse perform a full navigation to this route, which
        // is then served by this same cached shell, including all its chunks.
        return (await cache.match(pathname)) || new Response("Offline", { status: 503 });
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      // Only listed, same-origin build assets can reach this path. Do not
      // populate a shell cache with arbitrary personalized network responses.
      return fetch(request);
    })
  );
});
