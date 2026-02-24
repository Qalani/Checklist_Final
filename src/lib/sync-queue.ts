import { db, type SyncQueueEntry } from '@/lib/local-db';

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export type { SyncQueueEntry };

/**
 * Adds a new operation to the sync queue.
 * Called whenever a write is made while offline so it survives page refreshes.
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
