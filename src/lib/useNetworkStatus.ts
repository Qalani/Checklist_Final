'use client';

import { useEffect, useState } from 'react';
import { subscribeToNetworkStatus } from './offlineSync';

/**
 * Returns whether the browser currently has network connectivity.
 * Subscribes to online/offline events and re-renders on change.
 */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    return subscribeToNetworkStatus(setOnline);
  }, []);

  return online;
}
