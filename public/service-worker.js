// Bumped to v4 to force rollout of the offline-first data layer
const CACHE_NAME = "zen-workspace-cache-v4";
const ASSETS_TO_CACHE = ["/"];

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
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
            return undefined;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

function shouldHandleAsNavigation(request) {
  if (request.mode === "navigate") {
    return true;
  }

  const acceptHeader = request.headers.get("accept") || "";
  return acceptHeader.includes("text/html");
}

function isCacheable(request, response) {
  if (!response || response.status !== 200 || response.type !== "basic") {
    return false;
  }
  const url = new URL(request.url);
  // Never cache API routes, Next.js internals, or third-party requests
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/__") ||
    url.origin !== self.location.origin
  ) {
    return false;
  }
  return true;
}

async function cacheResponse(request, response) {
  if (isCacheable(request, response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  // Let third-party requests (e.g. Supabase) pass through unmodified
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation: network-first so users always get the latest shell
  if (shouldHandleAsNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          await cacheResponse(request, response);
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;

          const fallback = await caches.match("/");
          if (fallback) return fallback;

          return new Response("Offline", { status: 503 });
        })
    );
    return;
  }

  // Static assets: stale-while-revalidate for fast loads with background refresh
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then(async (response) => {
          await cacheResponse(request, response);
          return response;
        })
        .catch(() => cachedResponse || new Response("Offline", { status: 503 }));

      // Return cached copy immediately; update cache in background
      return cachedResponse || networkFetch;
    })
  );
});
