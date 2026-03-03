'use client';

import { AlertTriangle, Clock } from 'lucide-react';
import { useSyncStatus } from '@/lib/hooks/useSyncStatus';
import { retryEntry } from '@/lib/sync-queue';

interface SyncStatusBadgeProps {
  /** Dexie / Supabase table name, e.g. 'tasks', 'notes', 'list_items' */
  tableName: string;
  /** The row's primary-key UUID */
  id: string;
}

/**
 * Shows a compact sync-state badge on any item that has a pending or failed
 * entry in the local sync queue.  Renders nothing when the item is synced.
 *
 * - Pending: amber clock — write is queued and will be replayed when online
 * - Error:   red warning + "Retry" button — max retries exhausted
 */
export function SyncStatusBadge({ tableName, id }: SyncStatusBadgeProps) {
  const { status, entry } = useSyncStatus(tableName, id);

  if (status === 'synced') return null;

  if (status === 'pending') {
    return (
      <span
        title="Change queued — will sync when online"
        className="inline-flex items-center gap-1 rounded-md bg-warm-50 px-2 py-1 text-xs font-medium text-warm-600 shrink-0"
      >
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  }

  // status === 'error'
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span
        title="Sync failed — max retries reached"
        className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Sync error
      </span>
      {entry && (
        <button
          type="button"
          onClick={() => void retryEntry(entry)}
          aria-label="Retry sync for this item"
          className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          Retry
        </button>
      )}
    </span>
  );
}
