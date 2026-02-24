import { useEffect, useState } from 'react';
import { isOnline, onStatusChange } from '@/lib/network-status';

interface NetworkStatus {
  isOnline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState<boolean>(isOnline);

  useEffect(() => {
    // Sync with actual status on mount (guards against SSR mismatch)
    setOnline(isOnline());

    const unsubscribe = onStatusChange(setOnline);
    return unsubscribe;
  }, []);

  return { isOnline: online };
}
