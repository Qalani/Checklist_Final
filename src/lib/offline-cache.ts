import type { Table } from 'dexie';
import { db } from '@/lib/local-db';
import type { SyncableTable } from '@/lib/sync-engine';
import type { Task } from '@/types';
import { isOnline } from '@/lib/network-status';

function tableFor(name: SyncableTable): Table<any, string> {
  return db[name] as Table<any, string>;
}

/** Keep server responses durable without overwriting a queued local edit/delete. */
export async function cacheRows(
  name: SyncableTable,
  rows: readonly object[],
  userId?: string,
): Promise<void> {
  try {
    const table = tableFor(name);
    await db.transaction('rw', [table, db.sync_queue, db.cache_scopes], async () => {
      const pending = await db.sync_queue.where('table_name').equals(name).toArray();
      const pendingIds = new Set(pending.map(entry => entry.payload.id));
      const records = rows as Record<string, unknown>[];
      const safeRows = records.filter(row => typeof row.id === 'string' && !pendingIds.has(row.id));
      if (safeRows.length) await table.bulkPut(safeRows);
      if (userId) {
        const key = `${userId}:${name}`;
        const previous = await db.cache_scopes.get(key);
        const row_ids = [...new Set([...(previous?.row_ids ?? []), ...records.map(row => row.id as string)])];
        await db.cache_scopes.put({ key, user_id: userId, table_name: name, row_ids });
      }
    });
  } catch (error) {
    // An acknowledged server write must not be presented as failed if this
    // browser denies local storage. Offline writes themselves still fail loudly.
    console.warn('Unable to update offline cache', error);
  }
}

/** Remove confirmed remote deletions, preserving any more recent queued changes. */
export async function cacheDelete(name: SyncableTable, id: string): Promise<void> {
  try {
    const tables = name === 'lists'
      ? [tableFor(name), db.list_items, db.list_members, db.sync_queue]
      : [tableFor(name), db.sync_queue];
    await db.transaction('rw', tables, async () => {
      const pending = await db.sync_queue.toArray();
      if (pending.some(entry => entry.table_name === name && entry.payload.id === id)) return;
      await tableFor(name).delete(id);
      if (name === 'lists') {
        for (const childName of ['list_items', 'list_members'] as const) {
          const children = await db[childName].where('list_id').equals(id).toArray();
          const protectedIds = new Set(pending.filter(entry => entry.table_name === childName).map(entry => entry.payload.id));
          await db[childName].bulkDelete(children.filter(row => !protectedIds.has(row.id)).map(row => row.id));
        }
      }
    });
  } catch (error) {
    console.warn('Unable to remove offline cache entry', error);
  }
}

/** Server reads must continue to show pending changes until replay succeeds. */
export async function mergePendingRows<T extends { id: string }>(
  name: SyncableTable, rows: T[], userId?: string,
): Promise<T[]> {
  try {
    const entries = (await db.sync_queue.where('table_name').equals(name).toArray())
      .filter(entry => !userId || entry.user_id === userId || (!entry.user_id && entry.payload.user_id === userId));
    const merged = new Map(rows.map(row => [row.id, row]));
    for (const entry of entries) {
      const id = entry.payload.id as string;
      if (entry.operation === 'DELETE') merged.delete(id);
      else {
        const local = await tableFor(name).get(id);
        if (local) merged.set(id, local as T);
      }
    }
    return [...merged.values()];
  } catch {
    return rows;
  }
}

/** Cached shared tasks are available only to the account that fetched them. */
export async function getCachedTasks(userId: string): Promise<Task[]> {
  const owned = await db.tasks.where('user_id').equals(userId).toArray();
  const scope = await db.cache_scopes.get(`${userId}:tasks`);
  const shared = scope?.row_ids.length ? await db.tasks.bulkGet(scope.row_ids) : [];
  const rows = [...owned, ...shared.filter((row): row is Task => !!row)];
  return [...new Map(rows.map(row => [row.id, row])).values()];
}

/** Keep edits made during reconnection behind this account's durable backlog. */
export async function shouldQueueWrite(userId: string): Promise<boolean> {
  if (!isOnline()) return true;
  try {
    const entries = await db.sync_queue.toArray();
    return entries.some(entry => entry.user_id === userId || (!entry.user_id && entry.payload.user_id === userId));
  } catch {
    return false;
  }
}
