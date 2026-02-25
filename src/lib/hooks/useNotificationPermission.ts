'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { isCapacitorNative } from '@/lib/capacitor-auth';

export type ExtendedNotificationPermission = NotificationPermission | 'unsupported' | 'pending';

interface NotificationPermissionState {
  permission: ExtendedNotificationPermission;
  statusMessage: string | null;
  requestPermission: () => Promise<void>;
  requesting: boolean;
  isSupported: boolean;
}

function buildGuidanceMessage(permission: ExtendedNotificationPermission): string | null {
  if (permission === 'unsupported') {
    return 'Notifications are not available in this browser. You can still view reminders inside the app.';
  }

  if (permission === 'denied') {
    return 'Browser notifications are blocked. Use your browser\'s site settings (often under the lock icon) to enable them.';
  }

  if (permission === 'default') {
    return 'Enable notifications to receive reminder alerts even when this tab is closed.';
  }

  return null;
}

export function useNotificationPermission(): NotificationPermissionState {
  // On Capacitor native, push notifications are handled by the OS via FCM.
  // Report permission as granted so UI elements that gate on notification
  // availability (e.g. the reminder submit button) remain enabled.
  const isNative = typeof window !== 'undefined' && isCapacitorNative();

  const [permission, setPermission] = useState<ExtendedNotificationPermission>(
    isNative ? 'granted' : 'pending',
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const updatePermissionFromBrowser = useCallback(() => {
    if (isNative) {
      // Native push is managed separately; nothing to do here.
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    if (!('Notification' in window) || !window.Notification) {
      setPermission('unsupported');
      setStatusMessage(buildGuidanceMessage('unsupported'));
      return;
    }

    const permissionFromBrowser = window.Notification.permission;
    setPermission(permissionFromBrowser);
    setStatusMessage(buildGuidanceMessage(permissionFromBrowser));
  }, [isNative]);

  useEffect(() => {
    updatePermissionFromBrowser();
  }, [updatePermissionFromBrowser]);

  const requestPermission = useCallback(async () => {
    if (isNative) {
      // Native permission is requested by PushNotificationInitializer at startup.
      return;
    }

    if (typeof window === 'undefined' || !('Notification' in window) || !window.Notification) {
      setPermission('unsupported');
      setStatusMessage(buildGuidanceMessage('unsupported'));
      return;
    }

    setRequesting(true);

    try {
      const permissionResult = await window.Notification.requestPermission();
      setPermission(permissionResult);
      setStatusMessage(buildGuidanceMessage(permissionResult));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected issue occurred while requesting notifications.';

      setStatusMessage(
        `Unable to update notification permissions. Check browser settings and try again. (${message})`,
      );
    } finally {
      setRequesting(false);
    }
  }, []);

  const isSupported = useMemo(() => permission !== 'unsupported', [permission]);

  return {
    permission,
    statusMessage,
    requestPermission,
    requesting,
    isSupported,
  };
}
