const CACHE_NAME = "zen-workspace-cache-v1";
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return caches.open(CACHE_NAME).then((cache) =>
        fetch(event.request)
          .then((response) => {
            if (
              response &&
              response.status === 200 &&
              response.type === "basic" &&
              !event.request.url.includes("/__")
            ) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cachedResponse)
      );
    })
  );
});
