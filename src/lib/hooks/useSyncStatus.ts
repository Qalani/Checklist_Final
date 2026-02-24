'use client';

import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db, type SyncQueueEntry } from '@/lib/local-db';

// Keep in sync with MAX_RETRIES in sync-engine.ts
const MAX_RETRIES = 3;

export type ItemSyncStatus = 'synced' | 'pending' | 'error';

/**
 * Derives the sync status for a single Dexie row by watching the sync_queue
 * table.  Subscribes to live updates so the UI reflects changes immediately
 * as entries are added, retried, or removed by pushQueue().
 *
 * - 'synced'  — no queue entry exists for this row
 * - 'pending' — an entry is queued and has not yet exhausted retries
 * - 'error'   — an entry exists but retries >= MAX_RETRIES (stuck)
 */
export function useSyncStatus(
  tableName: string,
  id: string,
): { status: ItemSyncStatus; entry: SyncQueueEntry | undefined } {
  const [status, setStatus] = useState<ItemSyncStatus>('synced');
  const [entry, setEntry] = useState<SyncQueueEntry | undefined>(undefined);

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.sync_queue.where('table_name').equals(tableName).toArray()
    ).subscribe((entries) => {
      const found = entries.find(
        (e) => (e.payload as { id?: string }).id === id
      );

      if (!found) {
        setStatus('synced');
        setEntry(undefined);
      } else if (found.retries >= MAX_RETRIES) {
        setStatus('error');
        setEntry(found);
      } else {
        setStatus('pending');
        setEntry(found);
      }
    });

    return () => subscription.unsubscribe();
  }, [tableName, id]);

  return { status, entry };
}
