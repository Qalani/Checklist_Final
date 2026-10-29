import 'fake-indexeddb/auto';
import { serialize, deserialize } from 'node:v8';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { db } from '@/lib/local-db';
import { useNotes } from '@/features/notes/useNotes';
import { useZenReminders } from '@/features/reminders/useZenReminders';
import { useLists } from '@/features/lists/useLists';

let mockOnline = false;
jest.mock('@/lib/network-status', () => ({ isOnline: () => mockOnline, onStatusChange: () => () => undefined }));
jest.mock('@/lib/supabase', () => ({ supabase: { channel() {
  const channel = { on: () => channel, subscribe: () => channel, unsubscribe: jest.fn() };
  return channel;
} } }));

// jsdom lacks Node's structuredClone; fake-indexeddb needs it for stored values.
globalThis.structuredClone = ((value: unknown) => deserialize(serialize(value))) as typeof structuredClone;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let mounted: Root | undefined;

async function mount<T>(useHook: () => T): Promise<() => T> {
  let current: T;
  function Harness() { current = useHook(); return null; }
  mounted = createRoot(document.createElement('div'));
  await act(async () => { mounted!.render(createElement(Harness)); });
  return () => current!;
}

beforeEach(async () => { mockOnline = false; await db.delete(); await db.open(); });
afterEach(async () => {
  if (mounted) await act(async () => { mounted!.unmount(); });
  mounted = undefined;
  jest.restoreAllMocks();
  await db.delete();
});

it('rolls back the entire offline list import when a child queue write fails', async () => {
  const get = await mount(() => useLists('alice'));
  const add = db.sync_queue.add.bind(db.sync_queue);
  jest.spyOn(db.sync_queue, 'add').mockImplementationOnce(add).mockRejectedValueOnce(new Error('quota exceeded'));
  await act(async () => {
    await expect(get().createList({ name: 'Imported list', items: [{ content: 'First' }] })).rejects.toThrow('quota exceeded');
  });
  expect(await db.lists.count()).toBe(0);
  expect(await db.list_members.count()).toBe(0);
  expect(await db.list_items.count()).toBe(0);
  expect(await db.sync_queue.count()).toBe(0);
  expect(get().lists).toEqual([]);
});

it('keeps a note and its displayed content unchanged if update/delete cannot enter the queue', async () => {
  await db.notes.put({ id: 'note', user_id: 'alice', title: 'Original', content: 'Keep this' });
  const get = await mount(() => useNotes('alice'));
  jest.spyOn(db.sync_queue, 'add').mockRejectedValue(new Error('quota exceeded'));
  await act(async () => { await expect(get().updateNote('note', { title: 'Unsaved' })).rejects.toThrow('quota exceeded'); });
  expect((await db.notes.get('note'))?.title).toBe('Original');
  expect(get().notes[0].title).toBe('Original');
  await act(async () => { await expect(get().deleteNote('note')).rejects.toThrow('quota exceeded'); });
  expect(await db.notes.get('note')).toBeDefined();
  expect(get().notes).toHaveLength(1);
  expect(await db.sync_queue.count()).toBe(0);
});

it('does not leave an unqueued reminder after an offline create fails', async () => {
  const get = await mount(() => useZenReminders('alice'));
  jest.spyOn(db.sync_queue, 'add').mockRejectedValueOnce(new Error('quota exceeded'));
  await act(async () => {
    await expect(get().createReminder({ title: 'Appointment', remindAt: '2026-10-30T10:00:00Z' })).rejects.toThrow('quota exceeded');
  });
  expect(await db.zen_reminders.count()).toBe(0);
  expect(await db.sync_queue.count()).toBe(0);
  expect(get().reminders).toEqual([]);
});

it('queues a reconnect edit behind an earlier offline note change instead of overtaking it online', async () => {
  const get = await mount(() => useNotes('alice'));
  await act(async () => { await get().createNote({ title: 'Created offline', content: 'Draft' }); });
  const noteId = get().notes[0].id;
  mockOnline = true;
  await act(async () => { await get().updateNote(noteId, { title: 'Edited during reconnect' }); });
  const queue = await db.sync_queue.orderBy('id').toArray();
  expect(queue.map(entry => entry.operation)).toEqual(['INSERT', 'UPDATE']);
  expect(queue[1].payload.title).toBe('Edited during reconnect');
  expect((await db.notes.get(noteId))?.title).toBe('Edited during reconnect');
});
