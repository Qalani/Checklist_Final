'use client';

import { useEffect, useRef, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle } from 'lucide-react';
import { subscribeToNetworkStatus, flushPendingOps, getPendingOpsCount } from '@/lib/offlineSync';
import { useAuthSession } from '@/lib/hooks/useAuthSession';

type SyncState = 'online' | 'offline' | 'syncing' | 'synced';

export function OfflineIndicator() {
  const { user } = useAuthSession();
  const [syncState, setSyncState] = useState<SyncState>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll pending ops count every 10 s when online
  useEffect(() => {
    if (!user?.id) return;

    const check = async () => {
      try {
        const count = await getPendingOpsCount(user.id);
        setPendingCount(count);
      } catch {
        // Ignore
      }
    };

    void check();
    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    const initiallyOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    setSyncState(initiallyOnline ? 'online' : 'offline');

    const unsub = subscribeToNetworkStatus(async (online) => {
      if (!online) {
        setSyncState('offline');
        if (hideTimer.current) {
          clearTimeout(hideTimer.current);
          hideTimer.current = null;
        }
        return;
      }

      // Back online – flush pending ops
      setSyncState('syncing');
      try {
        const { flushed } = await flushPendingOps(user?.id);
        if (flushed > 0) {
          const count = user?.id ? await getPendingOpsCount(user.id) : 0;
          setPendingCount(count);
        }
      } catch {
        // Ignore flush errors
      }
      setSyncState('synced');

      hideTimer.current = setTimeout(() => {
        setSyncState('online');
        hideTimer.current = null;
      }, 3000);
    });

    return () => {
      unsub();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [user?.id]);

  if (syncState === 'online') return null;

  const config = {
    offline: {
      icon: <WifiOff className="w-4 h-4 flex-shrink-0" />,
      text: pendingCount > 0
        ? `Offline — ${pendingCount} change${pendingCount !== 1 ? 's' : ''} pending sync`
        : 'Offline — changes saved locally',
      classes: 'bg-amber-600/90 text-white',
    },
    syncing: {
      icon: <RefreshCw className="w-4 h-4 flex-shrink-0 animate-spin" />,
      text: 'Syncing changes…',
      classes: 'bg-blue-600/90 text-white',
    },
    synced: {
      icon: <CheckCircle className="w-4 h-4 flex-shrink-0" />,
      text: 'All changes synced',
      classes: 'bg-green-600/90 text-white',
    },
  } as const;

  const { icon, text, classes } = config[syncState as keyof typeof config];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-medium transition-all duration-300 ${classes}`}
    >
      {icon}
      <span>{text}</span>
    </div>
  );
}
