/**
 * Requests durable storage from the browser/WebView so the user's offline
 * data (IndexedDB + sync queue) cannot be evicted under storage pressure.
 *
 * Without this, the browser is free to reclaim IndexedDB when the device is
 * low on space — which on Android Capacitor builds means a user who swipes
 * the app away and returns hours later could find pending writes gone.
 *
 * The API is best-effort: not all browsers support it, and some require a
 * user gesture or installed-PWA status before granting. We swallow failures
 * silently so an unsupported environment doesn't break the app boot.
 */

let requested = false;

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }

  if (requested) {
    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }

  requested = true;

  try {
    const alreadyPersisted = await navigator.storage.persisted();
    if (alreadyPersisted) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
