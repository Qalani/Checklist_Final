import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { pullLatest, type SyncableTable } from '@/lib/sync-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncStatus = 'seeding' | 'ready' | 'error';

interface AuthSession {
  user: User | null;
  authChecked: boolean;
  syncStatus: SyncStatus;
  signOut: () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_TABLES: SyncableTable[] = [
  'tasks',
  'categories',
  'notes',
  'lists',
  'list_items',
  'list_members',
  'zen_reminders',
  'calendar_events',
];

// A timestamp safely before any real user data so the first pull gets everything
const EPOCH = '1970-01-01T00:00:00.000Z';

// ─── localStorage helpers ─────────────────────────────────────────────────────

function seededKey(userId: string): string {
  return `zen-sync-seeded-${userId}`;
}

function lastSyncKey(userId: string): string {
  return `zen-sync-last-${userId}`;
}

// ─── Seed logic ───────────────────────────────────────────────────────────────

// Prevent concurrent seed runs for the same user (e.g. if getSession and
// onAuthStateChange both fire before the first seed completes).
const seedInProgress = new Set<string>();

/**
 * Pulls all tables for `userId` from Supabase into the local Dexie store.
 *
 * Full seed  — first call on a given device; `since` = epoch (gets everything).
 * Incremental — subsequent calls; `since` = timestamp of the last successful sync.
 *
 * The seeded flag and last-sync timestamp are persisted in localStorage so
 * the strategy survives page refreshes.
 */
async function seedLocalDb(userId: string): Promise<void> {
  if (seedInProgress.has(userId)) return;
  seedInProgress.add(userId);

  try {
    // localStorage may be unavailable in private-browsing or sandboxed contexts;
    // fall back to a full seed from epoch so the app still works.
    let isSeeded = false;
    let since = EPOCH;
    try {
      isSeeded = localStorage.getItem(seededKey(userId)) === 'true';
      since = isSeeded ? (localStorage.getItem(lastSyncKey(userId)) ?? EPOCH) : EPOCH;
    } catch {
      // Proceed with full seed from epoch
    }

    for (const table of ALL_TABLES) {
      await pullLatest(table, userId, since);
    }

    // Mark this device as fully seeded and record the sync timestamp.
    // Silently skip if localStorage is unavailable — the app remains functional
    // but will re-seed from the server on the next page load.
    try {
      localStorage.setItem(seededKey(userId), 'true');
      localStorage.setItem(lastSyncKey(userId), new Date().toISOString());
    } catch {
      // Intentionally ignored
    }
  } finally {
    seedInProgress.delete(userId);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuthSession(): AuthSession {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('seeding');

  useEffect(() => {
    let isMounted = true;

    /**
     * Shared handler for both getSession() and onAuthStateChange callbacks.
     * Sets auth state immediately, then seeds the local DB in the background.
     */
    async function handleUser(newUser: User | null): Promise<void> {
      if (!isMounted) return;
      setUser(newUser);
      setAuthChecked(true);

      if (!newUser) {
        // No session — nothing to seed
        setSyncStatus('ready');
        return;
      }

      setSyncStatus('seeding');
      try {
        await seedLocalDb(newUser.id);
        if (isMounted) setSyncStatus('ready');
      } catch (err) {
        console.error('useAuthSession: local DB seed failed', err);
        if (isMounted) setSyncStatus('error');
      }
    }

    let subscription: { unsubscribe: () => void } = { unsubscribe: () => {} };

    try {
      supabase.auth
        .getSession()
        .then(({ data }) => handleUser(data.session?.user ?? null))
        .catch((error) => {
          if (!isMounted) return;
          console.error('Error fetching auth session', error);
          setAuthChecked(true);
          setSyncStatus('error');
        });
    } catch (error) {
      // Supabase may not be configured (e.g. dev/test environments); treat as
      // unauthenticated so demo mode and auth-gated pages render correctly.
      if (isMounted) {
        console.error('Error fetching auth session', error);
        setAuthChecked(true);
        setSyncStatus('error');
      }
    }

    try {
      const result = supabase.auth.onAuthStateChange((_event, session) => {
        handleUser(session?.user ?? null).catch(console.error);
      });
      subscription = result.data.subscription;
    } catch {
      // Ignore — auth state change subscriptions require a configured Supabase
      // client; the app remains functional without real-time auth updates.
    }

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSyncStatus('ready');
  }, []);

  return { user, authChecked, syncStatus, signOut };
}
