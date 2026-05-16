import { useEffect, useState } from 'react';
import { isOnline, onStatusChange, checkHttpConnectivity } from '@/lib/network-status';

interface NetworkStatus {
  isOnline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  // On SSR (no navigator) assume online so the banner isn't pre-rendered.
  // On the client, hydrate from navigator.onLine immediately so the offline
  // banner shows on first paint when the app cold-starts without a connection.
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });

  useEffect(() => {
    let cancelled = false;

    // When navigator says offline, verify with a real HTTP probe before
    // believing it — navigator.onLine can report false even with working
    // internet in certain environments (containers, proxies, some Linux setups).
    async function updateStatus(navOnline: boolean) {
      if (navOnline) {
        if (!cancelled) setOnline(true);
      } else {
        const httpOk = await checkHttpConnectivity();
        if (!cancelled) setOnline(httpOk);
      }
    }

    // Check actual status on mount
    updateStatus(isOnline());

    const unsubscribe = onStatusChange(updateStatus);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { isOnline: online };
}
