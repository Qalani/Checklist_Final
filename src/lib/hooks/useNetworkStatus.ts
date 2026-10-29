import { useSyncExternalStore } from 'react';
import { getOnlineSnapshot, onStatusChange } from '@/lib/network-status';

interface NetworkStatus {
  isOnline: boolean;
}

const getServerSnapshot = () => true;

export function useNetworkStatus(): NetworkStatus {
  const online = useSyncExternalStore(onStatusChange, getOnlineSnapshot, getServerSnapshot);
  return { isOnline: online };
}
