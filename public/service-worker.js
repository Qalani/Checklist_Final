const CACHE_NAME = "zen-workspace-cache-v2";
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

async function cacheResponse(request, response) {
  if (
    response &&
    response.status === 200 &&
    response.type === "basic" &&
    !request.url.includes("/__")
  ) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (shouldHandleAsNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          await cacheResponse(request, response);
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }
          return caches.match("/");
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
          await cacheResponse(request, response);
          return response;
        })
        .catch(() => cachedResponse);
    })
  );
});
