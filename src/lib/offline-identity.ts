import type { User } from '@supabase/supabase-js';

const PROFILE_KEY = 'zen-offline-user';
const SIGNED_OUT_KEY = 'zen-offline-signed-out';

/** A previously signed-in profile selects the on-device cache while offline.
 * It carries no tokens and never grants permission to a server request. */
export function readOfflineUser(): User | null {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as User | null;
    if (!profile || typeof profile.id !== 'string' || isLocallySignedOut(profile.id)) return null;
    return profile;
  } catch { return null; }
}

export function isLocallySignedOut(userId: string): boolean {
  try { return localStorage.getItem(SIGNED_OUT_KEY) === userId; } catch { return false; }
}

export function rememberOfflineUser(user: User, signedIn = false): boolean {
  try {
    if (signedIn) localStorage.removeItem(SIGNED_OUT_KEY);
    else if (isLocallySignedOut(user.id)) return false;
    const profile: User = {
      id: user.id, email: user.email, created_at: user.created_at,
      aud: user.aud, app_metadata: {}, user_metadata: {},
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch { /* Storage can be denied; online auth still works. */ }
  return true;
}

export function forgetOfflineUser(userId?: string): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
    if (userId) localStorage.setItem(SIGNED_OUT_KEY, userId);
  } catch { /* Best effort on platforms without local storage. */ }
}
