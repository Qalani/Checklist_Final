'use client';

/**
 * Mounts once in the root layout after authentication is confirmed.
 * Registers the device with FCM and persists the token to Supabase.
 * Renders nothing — purely a side-effect component.
 */

import { useEffect } from 'react';

import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { registerForPushNotifications } from '@/lib/push-notification-service';

export function PushNotificationInitializer() {
  const { user, authChecked } = useAuthSession();

  useEffect(() => {
    if (!authChecked || !user) {
      return;
    }
    void registerForPushNotifications(user.id);
  }, [authChecked, user]);

  return null;
}
