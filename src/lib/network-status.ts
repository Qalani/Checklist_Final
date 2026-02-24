type StatusCallback = (isOnline: boolean) => void;

const callbacks = new Set<StatusCallback>();

function getOnlineStatus(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

function notifyAll(): void {
  const status = getOnlineStatus();
  callbacks.forEach((cb) => cb(status));
}

// Register browser event listeners once at module load (client-side only)
if (typeof window !== 'undefined') {
  window.addEventListener('online', notifyAll);
  window.addEventListener('offline', notifyAll);
}

/**
 * Returns the current online status.
 * Safe to call on both server and client.
 */
export function isOnline(): boolean {
  return getOnlineStatus();
}

/**
 * Registers a callback that fires whenever online/offline status changes.
 * Returns an unsubscribe function.
 * Usable outside React (e.g. inside the sync engine).
 */
export function onStatusChange(cb: StatusCallback): () => void {
  callbacks.add(cb);
  return () => {
    callbacks.delete(cb);
  };
}

/**
 * Verifies actual internet reachability with a lightweight HTTP probe.
 * navigator.onLine only checks local network connectivity and can return
 * false even when the device has working internet (e.g. in containers,
 * behind certain proxies, or on some Linux setups). This function
 * confirms connectivity by hitting our own health endpoint.
 */
export async function checkHttpConnectivity(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  try {
    const res = await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
