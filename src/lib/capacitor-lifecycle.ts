import { isCapacitorNative } from '@/lib/capacitor-auth';
import { pushQueue } from '@/lib/sync-engine';
import { isOnline } from '@/lib/network-status';

/**
 * When the native Android shell is resumed (after being backgrounded or
 * swiped away and re-launched), kick the sync queue so any writes the user
 * made offline are flushed as soon as connectivity is back.
 *
 * Without this, queue replay only happens on the browser `online` event,
 * which doesn't fire if the app was killed while offline and re-opened
 * already online — the queue would just sit there until the next write.
 *
 * Web/PWA users get the same effect via `visibilitychange`.
 */

let installed = false;

export function installAppLifecycleHooks(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const triggerSync = () => {
    if (isOnline()) {
      pushQueue().catch((err) => {
        console.warn('lifecycle: push on resume failed', err);
      });
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      triggerSync();
    }
  });

  window.addEventListener('focus', triggerSync);

  if (isCapacitorNative()) {
    import('@capacitor/app')
      .then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) triggerSync();
        });
        App.addListener('resume', () => triggerSync());
      })
      .catch(() => {
        // Capacitor not actually available — fall back to visibility events.
      });
  }
}
