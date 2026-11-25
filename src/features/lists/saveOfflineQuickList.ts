import { db } from '@/lib/local-db';
import { enqueue } from '@/lib/sync-queue';
import type { List, ListItem } from '@/types';

type QuickListRecord = Pick<List, 'id' | 'name' | 'description' | 'category_mode'> & {
  user_id: string;
  created_at: string;
};

/** Persist the list, its owner membership, items, and their pending writes atomically. */
export async function saveOfflineQuickList(listRecord: QuickListRecord, items: ListItem[]): Promise<void> {
  const localItems = items.map((item, position) => ({
    ...item,
    list_id: listRecord.id,
    content: item.content.trim(),
    position,
  }));
  await db.transaction('rw', [db.lists, db.list_members, db.list_items, db.sync_queue], async () => {
    await db.lists.put({ ...listRecord, owner_id: listRecord.user_id, access_role: 'owner', public_share_token: null, public_share_enabled: false, items: localItems });
    // The server creates this membership when the queued list insert is replayed.
    await db.list_members.put({ id: crypto.randomUUID(), list_id: listRecord.id, user_id: listRecord.user_id, role: 'owner', created_at: listRecord.created_at });
    await enqueue({ user_id: listRecord.user_id, table_name: 'lists', operation: 'INSERT', payload: { ...listRecord } });
    for (const item of localItems) {
      await db.list_items.put(item);
      await enqueue({ user_id: listRecord.user_id, table_name: 'list_items', operation: 'INSERT', payload: { ...item } });
    }
  });
}
