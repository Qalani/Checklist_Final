import type { Table } from 'dexie';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/local-db';
import { getAll, remove, incrementRetry } from '@/lib/sync-queue';
import { onStatusChange } from '@/lib/network-status';

const MAX_RETRIES = 3;

export type SyncableTable =
  | 'tasks'
  | 'categories'
  | 'notes'
  | 'lists'
  | 'list_items'
  | 'list_members'
  | 'zen_reminders'
  | 'calendar_events';

// Which timestamp column is used for incremental pulls on each table.
// Tables without updated_at fall back to created_at.
const TIMESTAMP_FIELD: Record<SyncableTable, 'updated_at' | 'created_at'> = {
  tasks: 'updated_at',
  categories: 'created_at',
  notes: 'updated_at',
  lists: 'created_at',
  list_items: 'updated_at',
  list_members: 'created_at',
  zen_reminders: 'updated_at',
  calendar_events: 'updated_at',
};

// Tables that expose a top-level user_id column.
// Adding this filter improves query efficiency on top of RLS.
const USER_SCOPED = new Set<SyncableTable>([
  'tasks',
  'categories',
  'notes',
  'lists',
  'list_members',
  'zen_reminders',
  'calendar_events',
]);

// Generic Dexie table accessor — typed as any so the union of eight
// distinct Table<T> generics doesn't produce incompatible-call errors.
function getDexieTable(name: SyncableTable): Table<any, string> {
  const map = {
    tasks: db.tasks,
    categories: db.categories,
    notes: db.notes,
    lists: db.lists,
    list_items: db.list_items,
    list_members: db.list_members,
    zen_reminders: db.zen_reminders,
    calendar_events: db.calendar_events,
  };
  return map[name] as unknown as Table<any, string>;
}

// ─── Conflict resolution ──────────────────────────────────────────────────────

/**
 * Last-write-wins conflict resolution using updated_at.
 * When updated_at is absent on either side the remote record wins,
 * which is the safe default for append-only tables (categories, lists, etc.).
 */
export function resolveConflict<T extends { updated_at?: string }>(
  local: T,
  remote: T,
): T {
  const localMs = local.updated_at ? new Date(local.updated_at).getTime() : 0;
  const remoteMs = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
  return remoteMs >= localMs ? remote : local;
}

// ─── Pull ─────────────────────────────────────────────────────────────────────

/**
 * Fetches rows from `table` that changed after `since` and upserts them
 * into the local Dexie store with last-write-wins conflict resolution.
 *
 * @param table   Supabase / Dexie table name
 * @param userId  Authenticated user's UUID (used as a direct column filter
 *                on tables that have user_id, in addition to RLS)
 * @param since   ISO-8601 timestamp; only rows newer than this are fetched
 */
export async function pullLatest(
  table: SyncableTable,
  userId: string,
  since: string,
): Promise<void> {
  const tsField = TIMESTAMP_FIELD[table];

  // supabase is created without a Database generic so .from() accepts any string
  let query = (supabase.from(table) as any).select('*').gt(tsField, since);

  if (USER_SCOPED.has(table)) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await (query as Promise<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>);
  if (error) throw new Error(`pullLatest(${table}): ${error.message}`);
  if (!data || data.length === 0) return;

  const dexieTable = getDexieTable(table);

  const ids = data.map((r) => r.id as string);
  const locals = await dexieTable.bulkGet(ids);
  const localMap = new Map<string, Record<string, unknown>>(
    locals
      .filter((l): l is Record<string, unknown> => l !== undefined)
      .map((l) => [l.id as string, l]),
  );

  for (const remote of data) {
    const local = localMap.get(remote.id as string);
    const resolved = local
      ? resolveConflict(
          local as { updated_at?: string },
          remote as { updated_at?: string },
        )
      : remote;
    await dexieTable.put(resolved);
  }
}

// ─── Push ─────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replays all pending sync_queue entries against Supabase in insertion order.
 *
 * - Succeeded entries are deleted from the queue.
 * - Failed entries have their retry counter incremented and the loop waits
 *   with exponential backoff before continuing (2 s → 4 s → 8 s).
 * - Entries that have reached MAX_RETRIES are skipped and left in the queue
 *   for manual inspection / future recovery.
 */
export async function pushQueue(): Promise<void> {
  const entries = await getAll();

  for (const entry of entries) {
    if (entry.retries >= MAX_RETRIES) {
      await remove(entry.id!);
      continue;
    }

    try {
      const { table_name, operation, payload } = entry;

      if (operation === 'INSERT' || operation === 'UPDATE') {
        const { error } = await (supabase.from(table_name) as any).upsert(payload);
        if (error) throw error;
      } else if (operation === 'DELETE') {
        const { error } = await (supabase.from(table_name) as any)
          .delete()
          .eq('id', (payload as { id: string }).id);
        if (error) throw error;
      }

      await remove(entry.id!);
    } catch (err) {
      console.warn(`sync-engine: push failed for queue entry ${entry.id}`, err);
      await incrementRetry(entry.id!);
      // Exponential backoff: 2 s on first retry, 4 s on second, 8 s on third
      await sleep(Math.pow(2, entry.retries + 1) * 1000);
    }
  }
}

// ─── Auto-push on reconnect ───────────────────────────────────────────────────

// Register once at module load; fires pushQueue whenever the browser goes
// from offline → online (e.g. user regains connectivity).
if (typeof window !== 'undefined') {
  onStatusChange((online) => {
    if (online) pushQueue().catch(console.error);
  });

  // Handle the ZEN_SYNC_PUSH message posted by the service worker's Background
  // Sync handler.  The SW cannot access Dexie/Supabase directly so it delegates
  // queue replay back to the page via postMessage.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === 'ZEN_SYNC_PUSH') {
        pushQueue().catch(console.error);
      }
    });
  }
}
