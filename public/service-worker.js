const CACHE_NAME = "zen-workspace-cache-v4";
const API_CACHE_NAME = "zen-api-cache-v1";
const ASSETS_TO_CACHE = ["/"];

// GET-only API routes served with stale-while-revalidate.
// POST/PUT/DELETE are never cached.
const SWR_API_PATHS = ["/api/tasks", "/api/categories"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
              return caches.delete(cacheName);
            }
            return undefined;
          })
        )
      )
      .then(() => self.clients.claim())
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
      icon: "/icon-192.png",
      badge: "/icon-192.png",
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
          for (const client of clients) {
            client.postMessage({ type: "ZEN_SYNC_PUSH" });
          }
        })
    );
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shouldHandleAsNavigation(request) {
  if (request.mode === "navigate") {
    return true;
  }

  const acceptHeader = request.headers.get("accept") || "";
  return acceptHeader.includes("text/html");
}

function isSWRApiRoute(url) {
  try {
    const pathname = new URL(url).pathname;
    return SWR_API_PATHS.some(
      (path) => pathname === path || pathname.startsWith(path + "/")
    );
  } catch {
    return false;
  }
}

async function cacheStaticResponse(request, response) {
  if (
    response &&
    response.status === 200 &&
    response.type === "basic" &&
    !request.url.includes("/__") &&
    !new URL(request.url).pathname.startsWith("/api/")
  ) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
}

// Stale-while-revalidate: return the cached entry immediately (if any) while
// fetching a fresh copy in the background to update the cache.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cached = await cache.match(request);

  // Always kick off a background network request to refresh the cache.
  const networkFetch = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Serve the cached entry immediately; fall back to the network response on
  // first visit (no cache yet) or when offline and no cache is available.
  return cached ?? (await networkFetch) ?? new Response("Offline", { status: 503 });
}

// ─── Fetch handler ────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  // Stale-while-revalidate for designated read-only API routes.
  if (isSWRApiRoute(request.url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (shouldHandleAsNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          await cacheStaticResponse(request, response);
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }

          const fallback = await caches.match("/");
          if (fallback) {
            return fallback;
          }

          return new Response("Offline", { status: 503 });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then(async (response) => {
          await cacheStaticResponse(request, response);
          return response;
        })
        .catch(() =>
          cachedResponse || new Response("Offline", { status: 503 })
        );
    })
  );
});
