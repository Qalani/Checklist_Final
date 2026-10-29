/** @jest-environment node */
import 'fake-indexeddb/auto';
import { db } from '@/lib/local-db';
import { cacheRows, cacheDelete, getCachedTasks, mergePendingRows } from '@/lib/offline-cache';
import type { Task } from '@/types';

const task = (id: string, user_id = 'alice'): Task => ({ id, user_id, title: id, completed: false, priority: 'medium', category: 'Work', category_color: '#123456', order: 0 });

beforeEach(async () => { await db.delete(); await db.open(); });
afterAll(async () => { await db.delete(); });

test('online changes remain available after reopening IndexedDB', async () => {
  await cacheRows('tasks', [task('saved')], 'alice');
  db.close();
  await db.open();
  expect((await getCachedTasks('alice')).map(row => row.id)).toEqual(['saved']);
  await cacheDelete('tasks', 'saved');
  db.close();
  await db.open();
  expect(await getCachedTasks('alice')).toEqual([]);
});

test('a stale server read cannot overwrite a pending edit or resurrect a pending delete', async () => {
  await db.tasks.put({ ...task('edit'), title: 'Offline edit' });
  await db.sync_queue.bulkAdd([
    { user_id: 'alice', table_name: 'tasks', operation: 'UPDATE', payload: { id: 'edit', title: 'Offline edit' }, queued_at: '', retries: 0 },
    { user_id: 'alice', table_name: 'tasks', operation: 'DELETE', payload: { id: 'removed' }, queued_at: '', retries: 0 },
  ]);
  const remote = [task('edit'), task('removed')];
  await cacheRows('tasks', remote, 'alice');
  const visible = await mergePendingRows('tasks', remote, 'alice');
  expect(visible).toEqual([{ ...task('edit'), title: 'Offline edit' }]);
  expect(await db.tasks.get('removed')).toBeUndefined();
});

test('shared tasks stay isolated to the account that cached their access', async () => {
  await cacheRows('tasks', [{ ...task('shared', 'bob'), access_role: 'editor' }], 'alice');
  await cacheRows('tasks', [task('private', 'carol')], 'carol');
  expect((await getCachedTasks('alice')).map(row => row.id)).toEqual(['shared']);
  expect((await getCachedTasks('carol')).map(row => row.id)).toEqual(['private']);
});

test('deleting a list clears its cached items and memberships', async () => {
  await cacheRows('lists', [{ id: 'list', name: 'List', user_id: 'alice' }]);
  await db.list_items.put({ id: 'item', list_id: 'list', content: 'Item', completed: false, position: 0 });
  await db.list_members.put({ id: 'member', list_id: 'list', user_id: 'alice', role: 'owner' });
  await cacheDelete('lists', 'list');
  expect(await db.lists.count()).toBe(0);
  expect(await db.list_items.count()).toBe(0);
  expect(await db.list_members.count()).toBe(0);
});
