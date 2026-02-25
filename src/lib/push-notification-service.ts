/**
 * Native push notification service for Capacitor (Android).
 *
 * Uses @capacitor/push-notifications which integrates with Firebase Cloud
 * Messaging (FCM) on Android. Saves the FCM device token to Supabase so the
 * backend can deliver notifications even when the app is closed.
 *
 * Call registerForPushNotifications(userId) once the user is authenticated.
 * The FCM token is upserted into the `push_tokens` table via RLS-protected
 * Supabase insert, so only the owning user can read or write their tokens.
 */

import { isCapacitorNative } from './capacitor-auth';
import { supabase } from './supabase';

/** Prevent attaching duplicate listeners across React re-renders. */
let listenersRegistered = false;

async function savePushToken(userId: string, token: string): Promise<void> {
  await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: 'android',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' },
  );
}

/**
 * Request permission, register with FCM, persist the device token in
 * Supabase, and attach notification action handlers.
 *
 * Safe to call on every app start — duplicate registrations are no-ops.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (!isCapacitorNative()) {
    return;
  }

  // Dynamic import keeps the Capacitor plugin out of the web/SSR bundle.
  const { PushNotifications } = await import('@capacitor/push-notifications');

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') {
    return;
  }

  await PushNotifications.register();

  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  // Token issued (or refreshed) by FCM — persist it so the server can target this device.
  await PushNotifications.addListener('registration', async (token) => {
    await savePushToken(userId, token.value);
  });

  // Notification arrived while the app is open (foreground).
  // Capacitor suppresses the system notification in this case, so we log it;
  // you can extend this to show an in-app toast.
  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.info('[PushNotifications] foreground notification:', notification.title);
  });

  // User tapped a notification — navigate to the Reminders page.
  await PushNotifications.addListener('pushNotificationActionPerformed', () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/reminders';
    }
  });
}

/**
 * Remove the device token from Supabase and detach all listeners.
 * Call when the user signs out so they stop receiving notifications.
 */
export async function unregisterPushNotifications(userId: string): Promise<void> {
  if (!isCapacitorNative()) {
    return;
  }

  await supabase.from('push_tokens').delete().eq('user_id', userId);

  const { PushNotifications } = await import('@capacitor/push-notifications');
  await PushNotifications.removeAllListeners();
  listenersRegistered = false;
}
