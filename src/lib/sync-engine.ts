import type { Table } from 'dexie';
import { supabase } from '@/lib/supabase';
import { db, type SyncQueueEntry } from '@/lib/local-db';
import { getAll, remove, incrementRetry } from '@/lib/sync-queue';
import { isOnline, onStatusChange } from '@/lib/network-status';
import { setSyncUser } from '@/lib/sync-session';
import { isLocallySignedOut } from '@/lib/offline-identity';

export type SyncableTable = 'tasks' | 'categories' | 'notes' | 'lists' | 'list_items' | 'list_members' | 'zen_reminders' | 'calendar_events';
export const SYNC_TABLES: SyncableTable[] = ['tasks', 'categories', 'notes', 'lists', 'list_members', 'list_items', 'zen_reminders', 'calendar_events'];
const PAGE_SIZE = 500;
const OWNED_TABLES = new Set<SyncableTable>(['categories', 'notes', 'zen_reminders', 'calendar_events']);

function localTable(name: SyncableTable): Table<Record<string, unknown>, string> {
  return db[name] as unknown as Table<Record<string, unknown>, string>;
}

// Only database columns may leave the device. View models additionally contain
// access_role, owner_id, nested items, public share state and other UI fields.
const COLUMNS: Record<SyncableTable, string[]> = {
  tasks: ['id', 'title', 'description', 'completed', 'priority', 'category', 'category_color', 'order', 'created_at', 'updated_at', 'user_id', 'due_date', 'reminder_minutes_before', 'reminder_recurrence', 'reminder_next_trigger_at', 'reminder_last_trigger_at', 'reminder_snoozed_until', 'reminder_timezone', 'task_recurrence', 'task_recurrence_interval', 'task_recurrence_anchor_day'],
  categories: ['id', 'name', 'color', 'user_id', 'created_at'],
  notes: ['id', 'user_id', 'title', 'content', 'summary', 'word_count', 'created_at', 'updated_at'],
  lists: ['id', 'name', 'description', 'created_at', 'user_id', 'archived'],
  list_items: ['id', 'list_id', 'content', 'completed', 'position', 'created_at', 'updated_at'],
  list_members: ['id', 'list_id', 'user_id', 'user_email', 'role', 'created_at'],
  zen_reminders: ['id', 'user_id', 'title', 'description', 'remind_at', 'timezone', 'created_at', 'updated_at'],
  calendar_events: ['id', 'user_id', 'title', 'description', 'location', 'start_time', 'end_time', 'all_day', 'import_source', 'import_uid', 'created_at', 'updated_at'],
};

export function sanitizePayload(table: SyncableTable, payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(COLUMNS[table].filter(key => payload[key] !== undefined).map(key => [key, payload[key]]));
}

export function resolveConflict<T extends Record<string, unknown>>(local: T, remote: T): T {
  const localMs = typeof local.updated_at === 'string' ? new Date(local.updated_at).getTime() : 0;
  const remoteMs = typeof remote.updated_at === 'string' ? new Date(remote.updated_at).getTime() : 0;
  return remoteMs >= localMs ? remote : local;
}

/** Full authoritative snapshots handle deletions, permission revocation and
 * edits to tables without updated_at. Pagination prevents silent truncation. */
export async function pullLatest(table: SyncableTable, userId: string, _since?: string): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = table === 'tasks'
      ? supabase.rpc('get_tasks_with_access')
      : supabase.from(table).select('*');
    if (OWNED_TABLES.has(table)) query = query.eq('user_id', userId);
    const { data, error } = await query.order('id').range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`pullLatest(${table}): ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    if (await authenticatedUser() !== userId) throw new Error('Account changed during sync.');
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (await authenticatedUser() !== userId) throw new Error('Account changed during sync.');
  const target = localTable(table);
  const scopeKey = `${userId}:${table}`;
  const previous = await db.cache_scopes.get(scopeKey);
  const remoteIds = new Set(rows.map(row => row.id as string));
  // On upgraded devices, include owned rows predating cache scopes. Never
  // delete another account's cached rows when reconciling this account.
  await db.transaction('rw', target, db.cache_scopes, db.sync_queue, async () => {
    const queue = await db.sync_queue.where('table_name').equals(table).toArray();
    const pending = new Set(queue.map(entry => entry.payload.id).filter((id): id is string => typeof id === 'string'));
    const legacyOwned = (await target.toArray()).filter(row => row.user_id === userId).map(row => row.id as string);
    const stale = [...new Set([...(previous?.row_ids ?? []), ...legacyOwned])].filter(id => !remoteIds.has(id) && !pending.has(id));
    if (stale.length) await target.bulkDelete(stale);
    for (const remote of rows) {
      if (!pending.has(remote.id as string)) await target.put(remote);
    }
    await db.cache_scopes.put({ key: scopeKey, user_id: userId, table_name: table, row_ids: [...remoteIds] });
  });
}

async function authenticatedUser(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const id = data.session?.user.id;
  return id && !isLocallySignedOut(id) ? id : null;
}

function entryBelongsTo(entry: SyncQueueEntry, userId: string): boolean {
  // Legacy entries lacking an actor are only recoverable automatically when
  // ownership is explicit. Guessing from the current account risks sending
  // another account's edits; unknown entries remain intact for recovery.
  return entry.user_id ? entry.user_id === userId : entry.operation === 'INSERT' && entry.payload.user_id === userId;
}

let activePush: Promise<void> | null = null;
let pushRequested = false;
let syncRequested = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

async function remapCalendarImport(entry: SyncQueueEntry, payload: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
  if (entry.operation !== 'INSERT' || !payload.import_uid || !payload.import_source) return payload;
  const { data, error } = await supabase.from('calendar_events').select('id')
    .eq('user_id', userId).eq('import_source', payload.import_source).eq('import_uid', payload.import_uid).maybeSingle();
  if (error) throw error;
  if (!data || data.id === payload.id) return payload;
  const oldId = payload.id as string;
  await db.transaction('rw', db.calendar_events, db.sync_queue, async () => {
    const local = await db.calendar_events.get(oldId);
    if (local) {
      await db.calendar_events.delete(oldId);
      await db.calendar_events.put({ ...local, id: data.id });
    }
    await db.sync_queue.where('table_name').equals('calendar_events').modify(queued => {
      if (entryBelongsTo(queued, userId) && queued.payload.id === oldId) queued.payload = { ...queued.payload, id: data.id };
    });
  });
  return { ...payload, id: data.id };
}

/** Replay in insertion order, stopping on failure so dependent edits cannot
 * overtake their insert. Retained entries retry on future connectivity/resume
 * events and with bounded backoff, including entries past the old retry cap. */
export async function pushQueue(): Promise<void> {
  if (activePush) { pushRequested = true; return activePush; }
  const replay = async () => {
    const userId = await authenticatedUser();
    if (!userId || !isOnline()) return;
    setSyncUser(userId);
    const entries = await getAll();
    for (const original of entries) {
      // Re-read because a preceding calendar import may have remapped this id.
      const entry = await db.sync_queue.get(original.id!);
      if (!entry || !entryBelongsTo(entry, userId)) continue;
      try {
        // Account changes can happen while a slow request is in flight.
        if (await authenticatedUser() !== userId) return;
        const table = entry.table_name as SyncableTable;
        if (!SYNC_TABLES.includes(table)) throw new Error('Unsupported sync table');
        let payload = sanitizePayload(table, entry.payload);
        if (typeof payload.id !== 'string') throw new Error('Missing sync record id');
        if (table === 'calendar_events') payload = await remapCalendarImport(entry, payload, userId);
        if (await authenticatedUser() !== userId) return;
        let result;
        if (entry.operation === 'INSERT') {
          // Stable UUIDs make a retry safe if the previous response was lost.
          // Imported events intentionally update the existing import identity.
          const imported = table === 'calendar_events' && Boolean(payload.import_uid && payload.import_source);
          result = await supabase.from(table).upsert(payload, { onConflict: 'id', ignoreDuplicates: !imported }).select('*');
        } else if (entry.operation === 'UPDATE') {
          const { id, user_id: _owner, created_at: _created, ...changes } = payload;
          result = await supabase.from(table).update(changes).eq('id', id).select('*');
          if (!result.error && !result.data?.length) throw new Error('Record was deleted or edit permission was removed.');
        } else {
          result = await supabase.from(table).delete().eq('id', payload.id);
        }
        if (result.error) throw result.error;
        await remove(entry.id!);
        // Pull after all queued operations, rather than replacing a newer local
        // edit with a response from an earlier operation on the same row.
      } catch (error) {
        console.warn(`sync-engine: retained queue entry ${entry.id}`, error);
        await incrementRetry(entry.id!);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          if (isOnline()) void syncAll().catch(console.error);
        }, Math.min(60_000, 2 ** Math.min(entry.retries + 1, 5) * 1000));
        break;
      }
    }
  };
  // The same database may be open in several tabs. Web Locks serialize queue
  // replay across them; the in-process guard remains the fallback in WebViews.
  activePush = (async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request('zen-workspace-sync', async () => { await replay(); });
    } else await replay();
  })().finally(() => {
    activePush = null;
    if (pushRequested) { pushRequested = false; requestSync(); }
  });
  return activePush;
}

let activeSync: Promise<void> | null = null;
let activeSyncUser: string | undefined;
export async function syncAll(userId?: string): Promise<void> {
  if (activeSync) {
    if (userId && activeSyncUser !== userId) {
      try { await activeSync; } catch { /* New account still needs its own sync. */ }
      return syncAll(userId);
    }
    return activeSync;
  }
  syncRequested = false;
  activeSyncUser = userId;
  activeSync = (async () => {
    if (!isOnline()) return;
    const actor = await authenticatedUser();
    if (!actor || (userId && actor !== userId)) return;
    activeSyncUser = actor;
    setSyncUser(actor);
    await pushQueue();
    for (const table of SYNC_TABLES) {
      if (await authenticatedUser() !== actor) return;
      await pullLatest(table, actor);
    }
    // Optional services should not prevent the core local database being ready.
    await Promise.allSettled([
      import('@/features/friends/useFriends').then(({ fetchFriendsData }) => fetchFriendsData(actor)),
      import('@/features/dashboard/persistence').then(({ flushDashboardLayout }) => flushDashboardLayout(actor)),
    ]);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('zen-sync-complete'));
  })().finally(() => {
    activeSync = null; activeSyncUser = undefined;
    if (syncRequested && isOnline()) {
      syncRequested = false;
      void syncAll().catch(console.error);
    }
  });
  return activeSync;
}

export function requestSync(): void {
  syncRequested = true;
  if (activePush) pushRequested = true;
  if (!activeSync && isOnline()) void syncAll().catch(console.error);
}

if (typeof window !== 'undefined') {
  window.addEventListener('zen-sync-request', requestSync);
  onStatusChange(online => { if (online) void syncAll().catch(console.error); });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'ZEN_SYNC_PUSH') void syncAll().catch(console.error);
    });
  }
}
