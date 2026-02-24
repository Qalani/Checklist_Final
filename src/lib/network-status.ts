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
