import Dexie from 'dexie';
import { db, type SyncQueueEntry } from '@/lib/local-db';
import { supabase } from '@/lib/supabase';
import { getSyncUser } from '@/lib/sync-session';

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export type { SyncQueueEntry };

/**
 * Adds a new operation to the sync queue.
 * Called whenever a write is made while offline so it survives page refreshes.
 *
 * After writing to the queue we attempt to register a Background Sync tag so
 * the browser can wake the page and replay the queue even if the user closed
 * the tab while offline and reopens it once connectivity is restored.
 * Background Sync is not universally supported (e.g. Safari); the existing
 * online-event fallback in sync-engine.ts remains the safety net.
 */
export async function enqueue(
  entry: Pick<SyncQueueEntry, 'table_name' | 'operation' | 'payload'> & { user_id?: string }
): Promise<void> {
  const userId = entry.user_id ?? getSyncUser() ?? (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) throw new Error('Sign in before saving changes for sync.');

  const transaction = Dexie.currentTransaction;
  await db.sync_queue.add({
    user_id: userId,
    table_name: entry.table_name,
    operation: entry.operation,
    payload: entry.payload,
    queued_at: new Date().toISOString(),
    retries: 0,
  });

  // Queue replay must start after the enclosing local-write transaction commits.
  // Starting it inside the transaction can deadlock against its own DB reads.
  const schedule = () => {
    if (typeof window !== 'undefined') {
      setTimeout(() => window.dispatchEvent(new Event('zen-sync-request')), 0);
    }
  };
  if (transaction) transaction.on('complete', schedule);
  else schedule();

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => {
        // The Background Sync API is not in the base SW type; cast narrowly.
        const syncManager = (reg as ServiceWorkerRegistration & {
          sync?: { register(tag: string): Promise<void> };
        }).sync;
        return syncManager?.register('zen-sync');
      })
      .catch(() => {
        // Best-effort — not all browsers support Background Sync.
      });
  }
}

/**
 * Returns all pending sync queue entries ordered by the time they were queued.
 */
export async function getAll(): Promise<SyncQueueEntry[]> {
  return db.sync_queue.orderBy('id').toArray();
}

/**
 * Removes a successfully synced entry from the queue.
 */
export async function remove(id: number): Promise<void> {
  await db.sync_queue.delete(id);
}

/**
 * Increments the retry counter for an entry after a failed sync attempt.
 */
export async function incrementRetry(id: number): Promise<void> {
  await db.sync_queue
    .where('id')
    .equals(id)
    .modify((entry) => {
      entry.retries += 1;
    });
}

/**
 * Re-enqueues a previously failed sync entry with a fresh retry counter.
 * Call this when the user clicks "Retry" on an item in error state.
 */
export async function retryEntry(entry: SyncQueueEntry): Promise<void> {
  // Reset in place: moving a failed INSERT behind its UPDATE/DELETE would
  // break dependency order and could resurrect deleted records.
  await db.sync_queue.update(entry.id!, { retries: 0 });
}
