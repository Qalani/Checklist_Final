import { useEffect, useState } from 'react';
import { isOnline, onStatusChange, checkHttpConnectivity } from '@/lib/network-status';

interface NetworkStatus {
  isOnline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  // Default to true (assume online) to avoid a flash of the offline banner
  // during SSR / hydration before we've had a chance to probe.
  const [online, setOnline] = useState<boolean>(true);

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
