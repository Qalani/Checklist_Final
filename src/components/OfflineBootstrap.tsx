'use client';

import { useEffect } from 'react';
import { requestPersistentStorage } from '@/lib/persistent-storage';
import { installAppLifecycleHooks } from '@/lib/capacitor-lifecycle';

/**
 * Boot-time wiring for offline-first behaviour:
 *  - asks the platform for persistent storage so IndexedDB can't be evicted
 *    when the OS reclaims memory (critical for Android swipe-quit + resume),
 *  - installs visibility / Capacitor-resume hooks that flush the sync queue
 *    as soon as the app is brought back to the foreground.
 */
export function OfflineBootstrap() {
  useEffect(() => {
    requestPersistentStorage().catch(() => {});
    installAppLifecycleHooks();
  }, []);

  return null;
}
