/** @jest-environment node */
import 'fake-indexeddb/auto';
import { db } from '@/lib/local-db';
import { ChecklistManager } from '@/features/checklist/ChecklistManager';
import { useLists, fetchLists } from '@/features/lists/useLists';
import { importListFile, importTaskFile } from '@/features/imports/file-import';
import { fetchTasks } from '@/features/checklist/checklistFetch';
import { setSyncUser } from '@/lib/sync-session';
import { useCalendarEvents } from '@/features/calendar/useCalendarEvents';

jest.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, () => {}],
}));
jest.mock('@/lib/network-status', () => ({ isOnline: () => false, onStatusChange: () => () => {} }));
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'alice' } } } }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe: async () => {} }),
} }));

const file = (name: string, rows: unknown[]): File => ({ name, size: 100, text: async () => JSON.stringify(rows) } as File);

beforeEach(async () => { await db.delete(); await db.open(); setSyncUser('alice'); });
afterAll(async () => { await db.delete(); setSyncUser(null); });

it('keeps imported tasks and their account-scoped queue after closing and reopening storage', async () => {
  const manager = new ChecklistManager();
  await manager.setUser('alice');
  const result = await importTaskFile(file('tasks.json', [{ title: 'Imported while offline' }]), [], input => manager.saveTask(input, null));
  expect(result).toMatchObject({ imported: 1, skipped: 0 });
  manager.dispose();
  db.close();
  await db.open();
  const tasks = await fetchTasks('alice');
  expect(tasks.map(task => task.title)).toEqual(['Imported while offline']);
  const entries = await db.sync_queue.toArray();
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ user_id: 'alice', table_name: 'tasks', operation: 'INSERT', payload: { id: tasks[0].id, user_id: 'alice' } });
  expect(await fetchTasks('bob')).toEqual([]);
});

it('keeps imported lists, membership and items after an offline reopen', async () => {
  const { createList } = useLists('alice');
  const result = await importListFile(file('lists.json', [{ name: 'Offline shopping', items: [{ content: 'Milk' }, { content: 'Eggs', completed: true }] }]), createList);
  expect(result).toMatchObject({ imported: 1, skipped: 0 });
  db.close();
  await db.open();
  const lists = await fetchLists('alice');
  expect(lists).toHaveLength(1);
  expect(lists[0]).toMatchObject({ name: 'Offline shopping', access_role: 'owner', items: [
    { content: 'Milk', completed: false }, { content: 'Eggs', completed: true },
  ] });
  const entries = await db.sync_queue.toArray();
  expect(entries.map(entry => entry.table_name)).toEqual(['lists', 'list_items', 'list_items']);
  expect(entries.every(entry => entry.user_id === 'alice')).toBe(true);
  expect(await fetchLists('bob')).toEqual([]);
});

it('persists a parsed calendar file and updates the same event on offline reimport', async () => {
  const calendar = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:offline-import-1',
    'SUMMARY:Offline calendar import', 'DTSTART:20261029T100000Z', 'DTEND:20261029T110000Z',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const icsFile = { name: 'calendar.ics', size: calendar.length, text: async () => calendar } as File;
  const { importFromIcs } = useCalendarEvents('alice');
  expect(await importFromIcs(icsFile)).toMatchObject({ imported: 1, updated: 0 });
  db.close();
  await db.open();
  expect(await importFromIcs(icsFile)).toMatchObject({ imported: 0, updated: 1 });
  const events = await db.calendar_events.toArray();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ user_id: 'alice', title: 'Offline calendar import' });
  expect((await db.sync_queue.toArray()).map(entry => [entry.user_id, entry.operation, entry.payload.id])).toEqual([
    ['alice', 'INSERT', events[0].id], ['alice', 'UPDATE', events[0].id],
  ]);
});

it('rolls back calendar data when its durable queue entry cannot be written', async () => {
  const fail = () => { throw new Error('Storage quota exceeded'); };
  db.sync_queue.hook('creating', fail);
  try {
    await expect(useCalendarEvents('alice').createEvent({
      title: 'Must not survive a failed save', start: '2026-10-29T12:00:00Z', end: '2026-10-29T13:00:00Z',
    })).rejects.toThrow('Storage quota exceeded');
    expect(await db.calendar_events.count()).toBe(0);
    expect(await db.sync_queue.count()).toBe(0);
  } finally {
    db.sync_queue.hook('creating').unsubscribe(fail);
  }
});

it('serializes simultaneous offline calendar edits without dropping either field', async () => {
  await db.calendar_events.put({
    id: 'existing', user_id: 'alice', title: 'Before', location: 'Before', all_day: false,
    start_time: '2026-10-29T10:00:00Z', end_time: '2026-10-29T11:00:00Z',
  });
  const { updateEvent } = useCalendarEvents('alice');
  await Promise.all([
    updateEvent('existing', { title: 'New title' }),
    updateEvent('existing', { location: 'New location' }),
  ]);
  expect(await db.calendar_events.get('existing')).toMatchObject({ title: 'New title', location: 'New location' });
  expect(await db.sync_queue.count()).toBe(2);
});

it('rolls back an offline task when its queue cannot be saved', async () => {
  const manager = new ChecklistManager();
  await manager.setUser('alice');
  const fail = () => { throw new Error('Storage quota exceeded'); };
  db.sync_queue.hook('creating', fail);
  try {
    const result = await manager.saveTask({ title: 'Unsaved', priority: 'medium', category: 'Work', category_color: '#123456' }, null);
    expect(result).toMatchObject({ error: 'Storage quota exceeded' });
    expect(await db.tasks.count()).toBe(0);
    expect(await db.sync_queue.count()).toBe(0);
  } finally {
    db.sync_queue.hook('creating').unsubscribe(fail);
    manager.dispose();
  }
});

it('persists an offline category rename and its task updates together', async () => {
  await db.categories.put({ id: 'category', user_id: 'alice', name: 'Before', color: '#123456' });
  await db.tasks.put({ id: 'task', user_id: 'alice', title: 'Task', completed: false, priority: 'medium', category: 'Before', category_color: '#123456', order: 0 });
  const manager = new ChecklistManager();
  await manager.setUser('alice');
  await manager.updateCategory('category', { name: 'After', color: '#abcdef' });
  db.close(); await db.open();
  expect(await db.tasks.get('task')).toMatchObject({ category: 'After', category_color: '#abcdef' });
  expect((await db.sync_queue.toArray()).map(entry => entry.table_name)).toEqual(['categories', 'tasks']);
  manager.dispose();
});
