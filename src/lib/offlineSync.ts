/**
 * Offline sync manager.
 *
 * Responsibilities:
 *  - Expose isOnline() helper
 *  - Provide enqueueOp() to add mutations to the pending queue
 *  - Flush the queue to Supabase when the network is available
 *  - Auto-flush whenever the browser fires the "online" event
 */

import { supabase } from './supabase';
import { db, type PendingOp } from './db';

const MAX_RETRIES = 5;
let isFlushing = false;

type NetworkListener = (online: boolean) => void;
const networkListeners = new Set<NetworkListener>();

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Subscribe to network status changes.
 * Returns an unsubscribe function.
 */
export function subscribeToNetworkStatus(fn: NetworkListener): () => void {
  networkListeners.add(fn);
  return () => {
    networkListeners.delete(fn);
  };
}

// Wire up browser events once on the client side
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    networkListeners.forEach((fn) => fn(true));
    void flushPendingOps();
  });

  window.addEventListener('offline', () => {
    networkListeners.forEach((fn) => fn(false));
  });
}

/** Add a mutation to the pending ops queue. */
export async function enqueueOp(
  op: Omit<PendingOp, 'id' | 'retryCount'>,
): Promise<void> {
  await db.pendingOps.add({ ...op, retryCount: 0 });
}

/** Return the number of pending ops for a specific user. */
export async function getPendingOpsCount(userId: string): Promise<number> {
  return db.pendingOps.where('userId').equals(userId).count();
}

async function processOp(op: PendingOp): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (supabase as any).from(op.table);

    if (op.operation === 'delete') {
      const { error } = await client.delete().eq('id', op.recordId);
      if (error) throw error;
    } else if (op.operation === 'create') {
      const { error } = await client.insert(op.data);
      if (error) throw error;
    } else if (op.operation === 'update') {
      // Strip fields that must not be overwritten via an update
      const updateData = { ...op.data };
      delete updateData['id'];
      delete updateData['user_id'];
      const { error } = await client.update(updateData).eq('id', op.recordId);
      if (error) throw error;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Process all queued operations against Supabase.
 * Ops are processed oldest-first so the ordering is preserved.
 * Successfully processed ops are removed from the queue.
 * Failed ops get a retry counter; once MAX_RETRIES is reached they are dropped.
 *
 * @param userId  Optional – restricts flushing to a single user's ops.
 * @returns       Counts of flushed and failed ops.
 */
export async function flushPendingOps(
  userId?: string,
): Promise<{ flushed: number; failed: number }> {
  if (isFlushing || !isOnline()) return { flushed: 0, failed: 0 };
  isFlushing = true;

  let flushed = 0;
  let failed = 0;

  try {
    const ops: PendingOp[] = userId
      ? await db.pendingOps.where('userId').equals(userId).sortBy('createdAt')
      : await db.pendingOps.orderBy('createdAt').toArray();

    for (const op of ops) {
      const success = await processOp(op);

      if (success) {
        if (op.id !== undefined) {
          await db.pendingOps.delete(op.id);
        }
        flushed++;
      } else {
        failed++;
        if (op.id !== undefined) {
          const newRetryCount = op.retryCount + 1;
          if (newRetryCount >= MAX_RETRIES) {
            await db.pendingOps.delete(op.id);
          } else {
            await db.pendingOps.update(op.id, { retryCount: newRetryCount });
          }
        }
      }
    }
  } finally {
    isFlushing = false;
  }

  return { flushed, failed };
}
