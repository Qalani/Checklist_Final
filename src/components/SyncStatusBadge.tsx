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
        className="inline-flex items-center gap-1 rounded-md bg-warm-50 px-1.5 py-0.5 text-[10px] font-medium text-warm-600 shrink-0"
      >
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  }

  // status === 'error'
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <span
        title="Sync failed — max retries reached"
        className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600"
      >
        <AlertTriangle className="w-3 h-3" />
        Sync error
      </span>
      {entry && (
        <button
          type="button"
          onClick={() => void retryEntry(entry)}
          className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 transition-colors hover:bg-red-200"
          title="Re-enqueue this item for sync"
        >
          Retry
        </button>
      )}
    </span>
  );
}
