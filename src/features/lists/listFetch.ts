import { supabase } from '@/lib/supabase';
import { db } from '@/lib/local-db';
import { isOnline } from '@/lib/network-status';
import type { List, ListItem } from '@/types';
import { isListItemRow, mapListItem } from './listTypes';
import type { ListMembershipRow, ListItemRow } from './listTypes';

export async function fetchLists(userId: string): Promise<List[]> {
  if (!isOnline()) {
    const memberships = await db.list_members.where('user_id').equals(userId).toArray();
    const listIds = memberships.map(m => m.list_id);
    if (listIds.length === 0) return [];

    const lists = await db.lists.where('id').anyOf(listIds).toArray();
    const allItems = await db.list_items.where('list_id').anyOf(listIds).toArray();

    const itemsByList = new Map<string, ListItem[]>();
    for (const item of allItems) {
      const existing = itemsByList.get(item.list_id) ?? [];
      existing.push(item);
      itemsByList.set(item.list_id, existing);
    }

    const roleByListId = new Map(memberships.map(m => [m.list_id, m.role]));

    return lists
      .map(list => ({
        ...list,
        owner_id: list.user_id,
        access_role: roleByListId.get(list.id) ?? 'owner',
        public_share_token: list.public_share_token ?? null,
        public_share_enabled: Boolean(list.public_share_token),
        items: (itemsByList.get(list.id) ?? []).sort((a, b) => {
          if (a.position === b.position) return (a.created_at ?? '').localeCompare(b.created_at ?? '');
          return a.position - b.position;
        }),
      }))
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  }

  const { data, error } = await supabase
    .from('list_members')
    .select(
      `
        role,
        list_id,
        list:lists(
          id,
          name,
          description,
          created_at,
          user_id,
          archived,
          public_share:list_public_shares(token)
        )
      `,
    )
    .eq('user_id', userId)
    .order('list(created_at)', { ascending: true })
    .returns<ListMembershipRow[]>();

  if (error) {
    throw new Error(error.message || 'Failed to load lists.');
  }

  const records = data ?? [];

  const lists = records
    .filter(record => record.list !== null)
    .map(record => {
      const list = record.list!;
      const shareRecord = Array.isArray(list.public_share) ? list.public_share[0] : null;
      return {
        id: list.id,
        name: list.name,
        description: list.description,
        created_at: list.created_at ?? undefined,
        user_id: list.user_id,
        owner_id: list.user_id,
        access_role: record.role,
        archived: list.archived ?? false,
        public_share_token: shareRecord?.token ?? null,
        public_share_enabled: Boolean(shareRecord?.token),
        items: [],
      } satisfies List;
    });

  const listIds = lists.map(list => list.id).filter(Boolean);
  if (listIds.length === 0) {
    return lists;
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from('list_items')
    .select('id, list_id, content, completed, position, created_at, updated_at')
    .in('list_id', listIds)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<ListItemRow[]>();

  if (itemsError) {
    throw new Error(itemsError.message || 'Failed to load list items.');
  }

  const itemsByList = new Map<string, ListItem[]>();
  for (const row of itemsData ?? []) {
    const existing = itemsByList.get(row.list_id) ?? [];
    existing.push(mapListItem(row));
    itemsByList.set(row.list_id, existing);
  }

  return lists.map(list => ({
    ...list,
    items: itemsByList.get(list.id) ?? [],
  }));
}
