import { db, type SyncQueueEntry } from '@/lib/local-db';

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
  entry: Pick<SyncQueueEntry, 'table_name' | 'operation' | 'payload'>
): Promise<void> {
  await db.sync_queue.add({
    table_name: entry.table_name,
    operation: entry.operation,
    payload: entry.payload,
    queued_at: new Date().toISOString(),
    retries: 0,
  });

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
  return db.sync_queue.orderBy('queued_at').toArray();
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
