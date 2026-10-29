import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { syncAll } from '@/lib/sync-engine';
import { setSyncUser } from '@/lib/sync-session';
import { checkHttpConnectivity, isOnline, onStatusChange } from '@/lib/network-status';
import { forgetOfflineUser, readOfflineUser, rememberOfflineUser } from '@/lib/offline-identity';

export type SyncStatus = 'seeding' | 'ready' | 'error';
interface AuthSession {
  user: User | null;
  authChecked: boolean;
  syncStatus: SyncStatus;
  signOut: () => Promise<void>;
}

export function useAuthSession(): AuthSession {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('seeding');

  useEffect(() => {
    let mounted = true;
    const showUser = (next: User | null) => {
      if (!mounted) return;
      setSyncUser(next?.id ?? null);
      setUser(next);
      setAuthChecked(true);
    };
    const restoreOffline = () => {
      if (!mounted || isOnline()) return;
      showUser(readOfflineUser());
      setSyncStatus('ready');
    };
    async function handleUser(next: User | null, signedIn = false): Promise<void> {
      if (!mounted) return;
      if (next && !rememberOfflineUser(next, signedIn)) next = null;
      if (!next && !isOnline()) {
        restoreOffline();
        return;
      }
      if (!next) forgetOfflineUser();
      showUser(next);
      if (!next || !isOnline()) { setSyncStatus('ready'); return; }
      setSyncStatus('seeding');
      try {
        await syncAll(next.id);
        if (mounted) setSyncStatus('ready');
      } catch (error) {
        console.error('useAuthSession: sync failed', error);
        if (mounted) setSyncStatus(isOnline() ? 'error' : 'ready');
      }
    }
    const refreshAuth = () => {
      // Do not wait for an expired token's network refresh before exposing the
      // existing local cache in airplane mode. Supabase must refresh before sync.
      restoreOffline();
      void supabase.auth.getSession()
        .then(({ data }) => handleUser(data.session?.user ?? null))
        .catch(error => {
          if (!mounted) return;
          if (!isOnline()) restoreOffline();
          else { forgetOfflineUser(); console.error('Error fetching auth session', error); showUser(null); setSyncStatus('error'); }
        });
    };

    refreshAuth();
    void checkHttpConnectivity().then(reachable => { if (!reachable) restoreOffline(); });
    const unsubscribeNetwork = onStatusChange(online => { if (online) refreshAuth(); else restoreOffline(); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase holds an internal auth lock while callbacks run.
      setTimeout(() => {
        if (event === 'SIGNED_OUT') forgetOfflineUser();
        void handleUser(session?.user ?? null, event === 'SIGNED_IN').catch(console.error);
      }, 0);
    });
    const onLogout = () => { showUser(null); setSyncStatus('ready'); };
    window.addEventListener('zen-local-signout', onLogout);
    return () => {
      mounted = false;
      unsubscribeNetwork();
      subscription.unsubscribe();
      window.removeEventListener('zen-local-signout', onLogout);
    };
  }, []);

  const signOut = useCallback(async () => {
    // Clear the local selector immediately, even if revocation cannot reach the
    // server. Keep queued data bound to its actor for a future explicit sign-in.
    forgetOfflineUser(user?.id);
    setSyncUser(null);
    setUser(null);
    setSyncStatus('ready');
    window.dispatchEvent(new Event('zen-local-signout'));
    await supabase.auth.signOut({ scope: 'local' });
  }, [user?.id]);

  return { user, authChecked, syncStatus, signOut };
}
