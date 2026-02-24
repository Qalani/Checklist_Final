'use client';

import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import { db } from '@/lib/local-db';

/**
 * Global sync / offline status indicator mounted in the root layout.
 *
 * States it cycles through:
 * 1. Nothing rendered — online, queue empty, no recent flush
 * 2. Top banner      — offline (with pending count if > 0)
 * 3. Bottom-right    — online, queue draining ("Syncing N changes…")
 * 4. Bottom-right    — queue just flushed to 0 ("Synced ✓"), auto-dismisses
 *    after 3 seconds
 */
export function OfflineIndicator() {
  const { isOnline } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [showSynced, setShowSynced] = useState(false);
  const prevCountRef = useRef<number | null>(null);

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

  // Nothing to show — everything synced, no flash pending
  if (isOnline && pendingCount === 0 && !showSynced) return null;

  // "Synced" toast — queue just flushed while online
  if (showSynced && pendingCount === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-sage-200 bg-surface px-4 py-2.5 text-sm font-medium text-sage-700 shadow-lift"
      >
        <CheckCircle2 className="h-4 w-4" />
        Synced
      </div>
    );
  }

  // Online but queue still draining — show syncing indicator bottom-right
  if (isOnline && pendingCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-zen-200 bg-surface px-4 py-2.5 text-sm font-medium text-zen-600 shadow-lift"
      >
        <RefreshCw className="h-4 w-4 animate-spin" />
        Syncing {pendingCount} change{pendingCount === 1 ? '' : 's'}&hellip;
      </div>
    );
  }

  // Offline banner — spans the full top of the viewport
  return (
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
  );
}
