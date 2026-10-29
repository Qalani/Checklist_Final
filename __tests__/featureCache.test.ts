import type { Task } from '@/types';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

let mockOnline = true;
const mockRemote: Record<string, object[]> = {};
const mockRows: Record<string, Map<string, Record<string, unknown>>> = {};
const mockCacheRows = jest.fn(async (table: string, rows: Record<string, unknown>[]) => {
  mockRows[table] ??= new Map();
  for (const row of rows) mockRows[table].set(row.id as string, row);
});
const mockSharedTasks = jest.fn();
const mockCacheDelete = jest.fn(async (table: string, id: string) => { mockRows[table]?.delete(id); });

jest.mock('@/lib/network-status', () => ({ isOnline: () => mockOnline, onStatusChange: () => () => undefined }));
jest.mock('@/lib/sync-queue', () => ({ enqueue: jest.fn() }));
jest.mock('@/lib/offline-cache', () => ({
  cacheRows: (...args: [string, Record<string, unknown>[]]) => mockCacheRows(...args),
  cacheDelete: (...args: [string, string]) => mockCacheDelete(...args),
  mergePendingRows: (_table: string, rows: object[]) => Promise.resolve(rows),
  getCachedTasks: (...args: unknown[]) => mockSharedTasks(...args),
  shouldQueueWrite: async () => !mockOnline,
}));
jest.mock('@/lib/local-db', () => ({
  db: Object.fromEntries(['tasks', 'notes', 'zen_reminders', 'lists', 'list_items', 'list_members', 'calendar_events'].map(table => [table, {
    where(field: string) {
      return {
        equals(value: string) {
          return { toArray: async () => [...(mockRows[table]?.values() ?? [])].filter(row => row[field] === value) };
        },
        anyOf(values: string[]) {
          return { toArray: async () => [...(mockRows[table]?.values() ?? [])].filter(row => values.includes(row[field] as string)) };
        },
      };
    },
  }])),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel() {
      const channel = { on: () => channel, subscribe: () => channel, unsubscribe: jest.fn() };
      return channel;
    },
    from(table: string) {
      const query = {
        select: () => query,
        insert: () => query,
        update: () => query,
        delete: () => query,
        single: () => Promise.resolve({ data: mockRemote[table]?.[0] ?? null, error: null }),
        eq: () => query,
        in: () => query,
        order: () => query,
        returns: () => query,
        then(resolve: (result: unknown) => unknown) {
          return Promise.resolve({ data: mockRemote[table] ?? [], error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));

import { fetchNotes, useNotes } from '@/features/notes/useNotes';
import { fetchZenReminders } from '@/features/reminders/useZenReminders';
import { fetchLists } from '@/features/lists/listFetch';
import { fetchCalendarPayloadOffline } from '@/features/calendar/useCalendarData';

beforeEach(() => {
  mockOnline = true;
  for (const key of Object.keys(mockRemote)) delete mockRemote[key];
  for (const key of Object.keys(mockRows)) delete mockRows[key];
  jest.clearAllMocks();
});

it('keeps online note reads available after going offline, scoped to the signed-in account', async () => {
  mockRemote.notes = [{ id: 'note', user_id: 'me', title: 'Latest server title', content: 'Saved online', updated_at: '2026-10-29T12:00:00Z' }];
  const online = await fetchNotes('me');
  mockOnline = false;
  expect(await fetchNotes('me')).toEqual(online);
  expect(await fetchNotes('other')).toEqual([]);
});

it('keeps online reminders available for an offline reopen', async () => {
  mockRemote.zen_reminders = [{ id: 'reminder', user_id: 'me', title: 'Appointment', remind_at: '2026-10-30T12:00:00Z' }];
  const online = await fetchZenReminders('me');
  mockOnline = false;
  expect(await fetchZenReminders('me')).toEqual(online);
});

it('retains a shared list membership and its items for offline reads', async () => {
  mockRemote.list_members = [{ id: 'membership', user_id: 'me', list_id: 'list', role: 'viewer', list: {
    id: 'list', name: 'Shared groceries', description: null, user_id: 'friend', created_at: '2026-10-29T12:00:00Z', archived: false, public_share: [],
  } }];
  mockRemote.list_items = [{ id: 'item', list_id: 'list', content: 'Milk', completed: false, position: 0, created_at: null, updated_at: null }];
  const online = await fetchLists('me');
  mockOnline = false;
  expect(await fetchLists('me')).toEqual(online);
  expect(await fetchLists('unrelated')).toEqual([]);
});

it('includes cached shared tasks in the offline calendar without treating them as owned', async () => {
  mockSharedTasks.mockResolvedValue([
    { id: 'shared', user_id: 'friend', title: 'Review', access_role: 'viewer', due_date: '2026-10-29T12:00:00Z' } as Task,
    { id: 'owned', user_id: 'me', title: 'Personal task', due_date: '2026-10-29T13:00:00Z' } as Task,
  ]);
  const result = await fetchCalendarPayloadOffline('me', '2026-10-29T00:00:00Z', '2026-10-30T00:00:00Z', 'shared');
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({ entityId: 'shared', scope: 'shared', metadata: { canEdit: false, accessRole: 'viewer' } });
});

it('does not resurrect a note deleted online when the notes screen is reopened offline', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mockRemote.notes = [{ id: 'note', user_id: 'me', title: 'Delete me', content: '', updated_at: '2026-10-29T12:00:00Z' }];
  let result: ReturnType<typeof useNotes>;
  function Harness() { result = useNotes('me'); return null; }
  const element = document.createElement('div');
  const root = createRoot(element);
  await act(async () => { root.render(createElement(Harness)); });
  expect(result!.notes).toHaveLength(1);
  await act(async () => { await result!.deleteNote('note'); });
  mockOnline = false;
  expect(await fetchNotes('me')).toEqual([]);
  await act(async () => { root.unmount(); });
});
