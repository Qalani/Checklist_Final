'use client';

import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { AlertTriangle, CheckCircle2, RefreshCw, WifiOff, X } from 'lucide-react';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import { db } from '@/lib/local-db';

// Keep in sync with MAX_RETRIES in sync-engine.ts / useSyncStatus.ts
const MAX_RETRIES = 3;

/**
 * Global sync / offline status indicator mounted in the root layout.
 *
 * States it cycles through:
 * 1. Nothing rendered — online, queue empty, no recent flush
 * 2. Top banner      — offline (with pending count if > 0)
 * 3. Bottom-right    — online, queue draining ("Syncing N changes…")
 * 4. Bottom-right    — queue just flushed to 0 ("Synced ✓"), auto-dismisses
 *    after 3 seconds
 * 5. Bottom-left     — one or more items stuck at max retries (sync error toast)
 */
export function OfflineIndicator() {
  const { isOnline } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [showSynced, setShowSynced] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const prevCountRef = useRef<number | null>(null);
  const prevErrorCountRef = useRef<number | null>(null);

  // Live-query the sync_queue count so the badge updates in real-time as
  // enqueue() and pushQueue() add / remove entries.
  useEffect(() => {
    const subscription = liveQuery(() => db.sync_queue.count()).subscribe(
      (count) => {
        setPendingCount(count);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // Live-query items that have exhausted retries — these need user attention.
  useEffect(() => {
    const subscription = liveQuery(() =>
      db.sync_queue.filter(e => e.retries >= MAX_RETRIES).count()
    ).subscribe((count) => {
      setErrorCount(count);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Detect the moment the queue drains to zero while the app is online and
  // briefly show a "Synced" confirmation.
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = pendingCount;

    if (isOnline && prev !== null && prev > 0 && pendingCount === 0) {
      setShowSynced(true);
      const timer = setTimeout(() => setShowSynced(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [pendingCount, isOnline]);

  // Re-show the error toast whenever the error count increases.
  useEffect(() => {
    const prev = prevErrorCountRef.current;
    prevErrorCountRef.current = errorCount;
    if (prev !== null && errorCount > prev) {
      setErrorDismissed(false);
    }
  }, [errorCount]);

  const showErrorToast = errorCount > 0 && !errorDismissed;

  // Nothing to show — everything synced, no flash pending, no errors
  if (isOnline && pendingCount === 0 && !showSynced && !showErrorToast) return null;

  return (
    <>
      {/* Sync error toast — bottom-left, stays until dismissed */}
      {showErrorToast && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-xl border border-red-200 bg-surface px-4 py-3 text-sm font-medium text-red-700 shadow-lift"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <span>
            {errorCount} item{errorCount === 1 ? '' : 's'} failed to sync — open the item and tap Retry
          </span>
          <button
            type="button"
            onClick={() => setErrorDismissed(true)}
            aria-label="Dismiss sync error notification"
            className="ml-1 rounded-md p-0.5 text-red-400 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* "Synced" toast — queue just flushed while online */}
      {showSynced && pendingCount === 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-sage-200 bg-surface px-4 py-2.5 text-sm font-medium text-sage-700 shadow-lift"
        >
          <CheckCircle2 className="h-4 w-4" />
          Synced
        </div>
      )}

      {/* Online but queue still draining — show syncing indicator bottom-right */}
      {isOnline && pendingCount > 0 && !showSynced && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-zen-200 bg-surface px-4 py-2.5 text-sm font-medium text-zen-600 shadow-lift"
        >
          <RefreshCw className="h-4 w-4 animate-spin" />
          Syncing {pendingCount} change{pendingCount === 1 ? '' : 's'}&hellip;
        </div>
      )}

      {/* Offline banner — spans the full top of the viewport */}
      {!isOnline && (
        <div
          role="status"
          aria-live="assertive"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warm-500 px-4 py-2 text-sm font-medium text-white shadow-md"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>You&rsquo;re offline</span>
          {pendingCount > 0 && (
            <span className="opacity-80">
              &nbsp;&middot;&nbsp;{pendingCount} change{pendingCount === 1 ? '' : 's'} pending sync
            </span>
          )}
        </div>
      )}
    </>
  );
}
