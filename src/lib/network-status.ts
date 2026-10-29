type StatusCallback = (isOnline: boolean) => void;

const callbacks = new Set<StatusCallback>();
const PROBE_TIMEOUT_MS = 5_000;
const RECHECK_INTERVAL_MS = 15_000;

// Treat browser connection events as hints. In some WebViews and proxy/VPN
// setups navigator.onLine stays false even while requests succeed.
let online: boolean | null = null;
let monitoring = false;
let probeVersion = 0;
let activeProbe: { promise: Promise<boolean>; controller: AbortController } | null = null;
let recheckTimer: ReturnType<typeof setTimeout> | undefined;

function isNativeShell(): boolean {
  return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform?.();
}

function publishStatus(nextOnline: boolean): void {
  if (online === nextOnline) return;
  online = nextOnline;
  callbacks.forEach((callback) => callback(nextOnline));
}

function scheduleRecheck(): void {
  clearTimeout(recheckTimer);
  // Retry confirmed outages and misleading browser hints even when the
  // browser never dispatches another connection event.
  if (!online || !navigator.onLine) {
    recheckTimer = setTimeout(() => {
      void checkHttpConnectivity();
    }, RECHECK_INTERVAL_MS);
  }
}

function refreshStatus(): void {
  // A newer browser event supersedes a pending request. Its late rejection
  // must not bring the offline banner back after connectivity has recovered.
  probeVersion += 1;
  activeProbe?.controller.abort();
  activeProbe = null;
  void checkHttpConnectivity();
}

function startMonitoring(): void {
  if (monitoring || typeof window === 'undefined') return;
  monitoring = true;
  window.addEventListener('online', refreshStatus);
  window.addEventListener('offline', refreshStatus);
  window.addEventListener('focus', refreshStatus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshStatus();
  });
  void checkHttpConnectivity();
}

/**
 * Data consumers use the browser hint until the first probe completes, so
 * offline cold-start reads and writes can immediately use local storage.
 * After verification this is the same status used by the UI and sync engine.
 */
export function isOnline(): boolean {
  return online ?? (typeof navigator === 'undefined' || navigator.onLine);
}

/** Avoid displaying an offline notice until connectivity has been verified. */
export function getOnlineSnapshot(): boolean {
  return online ?? true;
}

/** Subscribe to verified connectivity changes, including background recovery. */
export function onStatusChange(callback: StatusCallback): () => void {
  callbacks.add(callback);
  startMonitoring();
  return () => {
    callbacks.delete(callback);
  };
}

/**
 * Check reachability without relying on the browser's local-network flag.
 * The service worker deliberately bypasses this endpoint; cached pages and
 * synthetic offline responses must never count as a successful network probe.
 */
export function checkHttpConnectivity(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(true);

  // Capacitor serves its static export from a local origin. Probing that
  // origin only checks the bundled files, not the internet connection.
  if (isNativeShell()) {
    publishStatus(navigator.onLine);
    scheduleRecheck();
    return Promise.resolve(navigator.onLine);
  }

  if (activeProbe) return activeProbe.promise;

  const version = ++probeVersion;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const promise = (async () => {
    try {
      await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      // Any real HTTP response proves reachability. A server error (including
      // a missing health route) is not the same as being offline.
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  })()
    .then((reachable) => {
      if (version === probeVersion) publishStatus(reachable);
      return isOnline();
    })
    .finally(() => {
      if (version === probeVersion) {
        activeProbe = null;
        scheduleRecheck();
      }
    });

  activeProbe = { promise, controller };
  return promise;
}
