/**
 * Native OAuth flow for Capacitor (Android / iOS).
 *
 * Inside the Capacitor WebView `signInWithOAuth` would navigate the WebView to
 * an external Supabase/Google URL. Capacitor hands that off to the **system
 * browser**, which can never navigate back to `https://localhost` — so the user
 * ends up stranded on the website.
 *
 * The fix:
 *  1. Call `signInWithOAuth` with `skipBrowserRedirect: true` to obtain the
 *     auth URL without navigating.
 *  2. Set `redirectTo` to the app's custom URL scheme
 *     (`com.zenworkspace.app://auth-callback`), which is registered as a
 *     deep-link intent-filter in AndroidManifest.xml.
 *  3. Open the auth URL in a Chrome Custom Tab via `@capacitor/browser`.
 *  4. When Supabase finishes the OAuth exchange it redirects to the custom
 *     scheme URL. Android routes that intent back to the app.
 *  5. `@capacitor/app` fires `appUrlOpen` — we extract the session tokens from
 *     the URL fragment and call `supabase.auth.setSession()`.
 */

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/lib/supabase';

/** Custom-scheme callback registered in AndroidManifest.xml */
const CALLBACK_URL = 'com.zenworkspace.app://auth-callback';

/**
 * Returns `true` when the code is running inside a Capacitor native shell.
 */
export function isCapacitorNative(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.()
  );
}

/**
 * Kick off Google OAuth via a Chrome Custom Tab and return once the session has
 * been written to the Supabase client.  Rejects on any failure.
 */
export async function signInWithGoogleNative(): Promise<void> {
  // 1. Get the OAuth URL without navigating
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: CALLBACK_URL,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    throw error ?? new Error('No OAuth URL returned from Supabase');
  }

  // 2. Wait for the deep-link callback
  const sessionFromDeepLink = new Promise<void>((resolve, reject) => {
    // Safety timeout — if the user cancels or something goes wrong, we don't
    // hang forever.
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('OAuth callback timed out'));
    }, 5 * 60 * 1000);

    let listenerHandle: { remove: () => Promise<void> } | null = null;

    function cleanup() {
      clearTimeout(timeout);
      listenerHandle?.remove();
    }

    // Listen for the custom-scheme deep link
    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith('com.zenworkspace.app://auth-callback')) return;

      cleanup();
      // Close the Chrome Custom Tab
      try { await Browser.close(); } catch { /* already closed */ }

      try {
        // Tokens are in the URL fragment: #access_token=...&refresh_token=...
        const hashParams = new URLSearchParams(url.split('#')[1] ?? '');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (!accessToken || !refreshToken) {
          // Might be an error callback — check for error description
          const errorDesc = hashParams.get('error_description');
          reject(new Error(errorDesc ?? 'Missing tokens in OAuth callback'));
          return;
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          reject(sessionError);
        } else {
          resolve();
        }
      } catch (err) {
        reject(err);
      }
    }).then(handle => { listenerHandle = handle; });
  });

  // 3. Open the auth URL in a Chrome Custom Tab
  await Browser.open({ url: data.url, windowName: '_self' });

  // 4. Wait for the callback to complete
  return sessionFromDeepLink;
}
