import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/local-db';
import { enqueue } from '@/lib/sync-queue';
import { isOnline } from '@/lib/network-status';
import { extractErrorMessage } from '@/utils/extract-error-message';
import type { List, ListItem, ListMember } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ListsStatus, ListsState, UseListsResult, ErrorResult, ListItemRow } from './listTypes';
import { isListItemRow, mapListItem } from './listTypes';
import { fetchLists } from './listFetch';
import { loadMembers, inviteMember, updateMemberRole, removeMember } from './listMembership';
import { enablePublicShare, rotatePublicShare, disablePublicShare, archiveList, unarchiveList } from './listPublicShare';

export type { ListsStatus, UseListsResult };
export { fetchLists } from './listFetch';

const INITIAL_STATE: ListsState = {
  status: 'idle',
  syncing: false,
  lists: [],
  error: null,
};

export function useLists(userId: string | null): UseListsResult {
  const [state, setState] = useState<ListsState>(INITIAL_STATE);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const membershipChannelRef = useRef<RealtimeChannel | null>(null);
  const listsChannelRef = useRef<RealtimeChannel | null>(null);
  const itemsChannelRef = useRef<RealtimeChannel | null>(null);
  const listsRef = useRef<List[]>(INITIAL_STATE.lists);

  useEffect(() => {
    listsRef.current = state.lists;
  }, [state.lists]);

  const cleanupChannel = useCallback((channelRef: MutableRefObject<RealtimeChannel | null>) => {
    if (channelRef.current) {
      const channel = channelRef.current;
      channelRef.current = null;
      void channel.unsubscribe();
    }
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    currentUserIdRef.current = null;
    cleanupChannel(membershipChannelRef);
    cleanupChannel(listsChannelRef);
    cleanupChannel(itemsChannelRef);
  }, [cleanupChannel]);

  const runRefresh = useCallback(
    async (force = false) => {
      if (!userId) return;
      if (refreshPromiseRef.current && !force) {
        return refreshPromiseRef.current;
      }

      const doRefresh = async () => {
        setState(prev => ({
          ...prev,
          syncing: true,
          status: prev.status === 'idle' ? 'loading' : prev.status,
          error: prev.status === 'error' ? prev.error : null,
        }));

        try {
          const lists = await fetchLists(userId);
          setState({
            status: 'ready',
            syncing: false,
            lists,
            error: null,
          });
        } catch (error) {
          const message = extractErrorMessage(error, 'Failed to load your lists.');
          setState(prev => ({
            ...prev,
            syncing: false,
            status: prev.status === 'idle' ? 'error' : prev.status,
            error: message,
          }));
        }
      };

      refreshPromiseRef.current = doRefresh().finally(() => {
        refreshPromiseRef.current = null;
      });

      return refreshPromiseRef.current;
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }

    if (currentUserIdRef.current === userId && state.status !== 'idle') {
      return;
    }

    currentUserIdRef.current = userId;
    void runRefresh(true);
  }, [reset, runRefresh, state.status, userId]);

  useEffect(() => {
    cleanupChannel(membershipChannelRef);

    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`lists-memberships:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_members', filter: `user_id=eq.${userId}` }, () => {
        void runRefresh(true);
      });

    membershipChannelRef.current = channel;

    channel.subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Supabase realtime channel error for list memberships');
      }

      if (status === 'CLOSED' && membershipChannelRef.current === channel) {
        membershipChannelRef.current = null;
      }
    });

    return () => {
      if (membershipChannelRef.current === channel) {
        membershipChannelRef.current = null;
      }
      void channel.unsubscribe();
    };
  }, [cleanupChannel, runRefresh, userId]);

  useEffect(() => {
    cleanupChannel(listsChannelRef);

    if (!userId || !state.lists.length) {
      return;
    }

    const ids = state.lists.map(list => list.id).filter(Boolean);
    if (!ids.length) {
      return;
    }

    const filter = `id=in.(${ids.map(id => `'${id}'`).join(',')})`;

    const channel = supabase
      .channel(`lists-changes:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter }, () => {
        void runRefresh(true);
      });

    listsChannelRef.current = channel;

    channel.subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Supabase realtime channel error for lists');
      }

      if (status === 'CLOSED' && listsChannelRef.current === channel) {
        listsChannelRef.current = null;
      }
    });

    return () => {
      if (listsChannelRef.current === channel) {
        listsChannelRef.current = null;
      }
      void channel.unsubscribe();
    };
  }, [cleanupChannel, runRefresh, state.lists, userId]);

  useEffect(() => {
    cleanupChannel(itemsChannelRef);

    if (!userId || !state.lists.length) {
      return;
    }

    const ids = state.lists.map(list => list.id).filter(Boolean);
    if (!ids.length) {
      return;
    }

    const filter = `list_id=in.(${ids.map(id => `'${id}'`).join(',')})`;

    const channel = supabase
      .channel(`list-items:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter }, payload => {
        const row = (payload.new ?? payload.old) as ListItemRow | null;
        if (!row) {
          return;
        }

        setState(prev => {
          const updatedLists = prev.lists.map(list => {
            if (list.id !== row.list_id) {
              return list;
            }

            const currentItems = Array.isArray(list.items) ? [...list.items] : [];

            if (payload.eventType === 'DELETE') {
              return {
                ...list,
                items: currentItems.filter(item => item.id !== row.id),
              };
            }

            const mapped = mapListItem(payload.new as ListItemRow);
            const existingIndex = currentItems.findIndex(item => item.id === mapped.id);

            if (existingIndex >= 0) {
              currentItems[existingIndex] = mapped;
            } else {
              currentItems.push(mapped);
            }

            currentItems.sort((a, b) => {
              if (a.position === b.position) {
                return (a.created_at ?? '').localeCompare(b.created_at ?? '');
              }
              return a.position - b.position;
            });

            return {
              ...list,
              items: currentItems,
            };
          });

          return {
            ...prev,
            lists: updatedLists,
          };
        });
      });

    itemsChannelRef.current = channel;

    channel.subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Supabase realtime channel error for list items');
      }

      if (status === 'CLOSED' && itemsChannelRef.current === channel) {
        itemsChannelRef.current = null;
      }
    });

    return () => {
      if (itemsChannelRef.current === channel) {
        itemsChannelRef.current = null;
      }
      void channel.unsubscribe();
    };
  }, [cleanupChannel, state.lists, userId]);

  const createList = useCallback<UseListsResult['createList']>(
    async (input) => {
      if (!userId) {
        return { error: 'You must be signed in to create lists.' };
      }

      const initialItems = Array.isArray(input.items)
        ? input.items
            .map((item, index) => ({
              content: (item?.content ?? '').trim(),
              completed: Boolean(item?.completed),
              position:
                typeof item?.position === 'number' && Number.isFinite(item.position)
                  ? item.position
                  : index,
            }))
            .sort((a, b) => a.position - b.position)
            .map((item, index) => ({ ...item, position: index }))
        : [];

      if (!isOnline()) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const newList: List = {
          id,
          name: input.name,
          description: input.description ?? null,
          created_at: now,
          user_id: userId,
          owner_id: userId,
          access_role: 'owner',
          public_share_token: null,
          public_share_enabled: false,
          items: [],
        };
        await db.lists.put(newList);
        await db.list_members.put({ id: crypto.randomUUID(), list_id: id, user_id: userId, role: 'owner', created_at: now });
        await enqueue({ table_name: 'lists', operation: 'INSERT', payload: { id, name: input.name, description: input.description ?? null, user_id: userId, created_at: now } });

        if (initialItems.length > 0) {
          const mappedItems: ListItem[] = [];
          for (const item of initialItems) {
            const itemId = crypto.randomUUID();
            const newItem: ListItem = { id: itemId, list_id: id, content: item.content, completed: item.completed, position: item.position, created_at: now };
            await db.list_items.put(newItem);
            await enqueue({ table_name: 'list_items', operation: 'INSERT', payload: newItem as Record<string, unknown> });
            mappedItems.push(newItem);
          }
          newList.items = mappedItems.sort((a, b) => a.position - b.position);
        }

        setState(prev => ({
          ...prev,
          lists: [...prev.lists, newList],
          status: prev.status === 'idle' ? 'ready' : prev.status,
        }));
        return;
      }

      let createdListId: string | null = null;

      try {
        const timestampInput = input.createdAt;
        let createdAt: string | null = null;

        if (timestampInput instanceof Date) {
          const parsed = new Date(timestampInput.getTime());
          if (!Number.isNaN(parsed.getTime())) {
            createdAt = parsed.toISOString();
          }
        } else if (typeof timestampInput === 'string' && timestampInput.trim().length > 0) {
          const parsed = new Date(timestampInput);
          if (!Number.isNaN(parsed.getTime())) {
            createdAt = parsed.toISOString();
          }
        }

        const record: { name: string; description: string | null; user_id: string; created_at?: string } = {
          name: input.name,
          description: input.description ?? null,
          user_id: userId,
        };

        if (createdAt) {
          record.created_at = createdAt;
        }

        const { data, error } = await supabase
          .from('lists')
          .insert(record)
          .select('*')
          .single();

        if (error) {
          throw new Error(error.message || 'Unable to create list.');
        }

        if (data) {
          const newList: List = {
            id: data.id,
            name: data.name,
            description: data.description,
            created_at: data.created_at ?? undefined,
            user_id: data.user_id,
            owner_id: data.user_id,
            access_role: 'owner',
            public_share_token: null,
            public_share_enabled: false,
            items: [],
          };

          createdListId = data.id;

          if (initialItems.length > 0) {
            const { data: itemsData, error: itemsError } = await supabase
              .from('list_items')
              .insert(
                initialItems.map(item => ({
                  list_id: data.id,
                  content: item.content,
                  completed: item.completed ?? false,
                  position: item.position,
                })),
              )
              .select('id, list_id, content, completed, position, created_at, updated_at');

            if (itemsError) {
              await supabase.from('lists').delete().eq('id', data.id);
              createdListId = null;
              throw new Error(itemsError.message || 'Unable to add list items.');
            }

            const mappedItems: ListItem[] = [];

            for (const row of itemsData ?? []) {
              if (!isListItemRow(row)) {
                await supabase.from('lists').delete().eq('id', data.id);
                createdListId = null;
                throw new Error('List items were not returned after creation.');
              }
              mappedItems.push(mapListItem(row));
            }

            newList.items = mappedItems.sort((a, b) => a.position - b.position);
          }

          setState(prev => ({
            ...prev,
            lists: [...prev.lists, newList],
            status: prev.status === 'idle' ? 'ready' : prev.status,
          }));
        }
      } catch (error) {
        if (createdListId) {
          try {
            await supabase.from('lists').delete().eq('id', createdListId);
          } catch {
            // Best-effort cleanup; ignore failures
          }
        }
        return { error: extractErrorMessage(error, 'Unable to create list.') };
      }
    },
    [userId],
  );

  const updateList = useCallback<UseListsResult['updateList']>(
    async (id, input) => {
      if (!userId) {
        return { error: 'You must be signed in to update lists.' };
      }

      const existing = listsRef.current.find(list => list.id === id);
      if (!existing) {
        return { error: 'List not found.' };
      }

      if (existing.access_role && !['owner', 'editor'].includes(existing.access_role)) {
        return { error: 'You do not have permission to update this list.' };
      }

      if (!isOnline()) {
        const updated: List = { ...existing, name: input.name, description: input.description ?? null };
        await db.lists.put(updated);
        await enqueue({ table_name: 'lists', operation: 'UPDATE', payload: { id, name: input.name, description: input.description ?? null } });
        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === id ? { ...list, name: input.name, description: input.description ?? null } : list,
          ),
        }));
        return;
      }

      try {
        const { data, error } = await supabase
          .from('lists')
          .update({
            name: input.name,
            description: input.description ?? null,
          })
          .eq('id', id)
          .select('*')
          .single();

        if (error) {
          throw new Error(error.message || 'Unable to update list.');
        }

        if (data) {
          setState(prev => ({
            ...prev,
            lists: prev.lists.map(list =>
              list.id === id
                ? {
                    ...list,
                    name: data.name,
                    description: data.description,
                    created_at: data.created_at ?? list.created_at,
                    items: Array.isArray(list.items) ? [...list.items] : [],
                  }
                : list,
            ),
          }));
        }
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to update list.') };
      }
    },
    [userId],
  );

  const deleteList = useCallback<UseListsResult['deleteList']>(
    async (id) => {
      if (!userId) {
        return { error: 'You must be signed in to delete lists.' };
      }

      const existing = listsRef.current.find(list => list.id === id);
      if (!existing) {
        return { error: 'List not found.' };
      }

      if (existing.access_role !== 'owner') {
        return { error: 'Only owners can delete a list.' };
      }

      if (!isOnline()) {
        await db.lists.delete(id);
        await enqueue({ table_name: 'lists', operation: 'DELETE', payload: { id } });
        setState(prev => ({ ...prev, lists: prev.lists.filter(list => list.id !== id) }));
        return;
      }

      try {
        const { error } = await supabase
          .from('lists')
          .delete()
          .eq('id', id);

        if (error) {
          throw new Error(error.message || 'Unable to delete list.');
        }

        setState(prev => ({
          ...prev,
          lists: prev.lists.filter(list => list.id !== id),
        }));
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to delete list.') };
      }
    },
    [userId],
  );

  const createListItem = useCallback<UseListsResult['createListItem']>(
    async (listId, content = '') => {
      if (!userId) {
        return { error: 'You must be signed in to add list items.' };
      }

      const targetList = listsRef.current.find(list => list.id === listId);
      if (!targetList) {
        return { error: 'List not found.' };
      }

      const role = targetList.access_role ?? 'owner';
      if (!['owner', 'editor'].includes(role)) {
        return { error: 'You do not have permission to add items to this list.' };
      }

      if (!isOnline()) {
        const itemId = crypto.randomUUID();
        const now = new Date().toISOString();
        const existingItems = Array.isArray(targetList.items) ? targetList.items : [];
        const nextPosition = existingItems.reduce((max, i) => Math.max(max, i.position), -1) + 1;
        const item: ListItem = { id: itemId, list_id: listId, content, completed: false, position: nextPosition, created_at: now };
        await db.list_items.put(item);
        await enqueue({ table_name: 'list_items', operation: 'INSERT', payload: item as Record<string, unknown> });
        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === listId
              ? { ...list, items: [...(list.items ?? []), item].sort((a, b) => a.position - b.position) }
              : list,
          ),
        }));
        return { item };
      }

      try {
        const { data, error } = await supabase.rpc('create_list_item', {
          target_list_id: listId,
          item_content: content,
        });

        if (error) {
          throw new Error(error.message || 'Unable to add list item.');
        }

        const newRow = Array.isArray(data) ? data[0] : data;

        if (!isListItemRow(newRow)) {
          throw new Error('List item was not returned after creation.');
        }

        const item = mapListItem(newRow);

        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === listId
              ? {
                  ...list,
                  items: [...(list.items ?? []), item].sort((a, b) => a.position - b.position),
                }
              : list,
          ),
        }));

        return { item };
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to add list item.') };
      }
    },
    [userId],
  );

  const updateListItem = useCallback<UseListsResult['updateListItem']>(
    async (itemId, updates) => {
      if (!userId) {
        return { error: 'You must be signed in to update list items.' };
      }

      const targetList = listsRef.current.find(list => Array.isArray(list.items) && list.items.some(item => item.id === itemId));
      if (!targetList) {
        return { error: 'List item not found.' };
      }

      const role = targetList.access_role ?? 'owner';
      if (!['owner', 'editor'].includes(role)) {
        return { error: 'You do not have permission to update this list item.' };
      }

      const payload: Partial<ListItemRow> = {};
      if (typeof updates.content === 'string') {
        payload.content = updates.content;
      }
      if (typeof updates.completed === 'boolean') {
        payload.completed = updates.completed;
      }

      if (!Object.keys(payload).length) {
        const existing = targetList.items?.find(item => item.id === itemId);
        if (existing) {
          return { item: existing };
        }
        return { error: 'Nothing to update.' };
      }

      // Always apply an optimistic local update immediately so the UI reflects
      // the change regardless of network state.
      const existingItem = targetList.items?.find(item => item.id === itemId);
      if (!existingItem) return { error: 'List item not found.' };
      const now = new Date().toISOString();
      const optimisticItem: ListItem = { ...existingItem, ...payload, updated_at: now } as ListItem;
      await db.list_items.put(optimisticItem);
      setState(prev => ({
        ...prev,
        lists: prev.lists.map(list =>
          list.id === optimisticItem.list_id
            ? { ...list, items: (list.items ?? []).map(i => (i.id === itemId ? optimisticItem : i)) }
            : list,
        ),
      }));

      if (!isOnline()) {
        await enqueue({ table_name: 'list_items', operation: 'UPDATE', payload: optimisticItem as Record<string, unknown> });
        return { item: optimisticItem };
      }

      try {
        const { data, error } = await supabase
          .from('list_items')
          .update(payload)
          .eq('id', itemId)
          .select('id, list_id, content, completed, position, created_at, updated_at')
          .single();

        if (error) {
          throw new Error(error.message || 'Unable to update list item.');
        }

        const row = data as ListItemRow | null;
        if (!row) {
          throw new Error('List item was not returned after update.');
        }

        const item = mapListItem(row);

        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === item.list_id
              ? {
                  ...list,
                  items: (list.items ?? []).map(existing => (existing.id === item.id ? item : existing)),
                }
              : list,
          ),
        }));

        return { item };
      } catch (error) {
        // Server request failed — queue the optimistic change for background sync
        // so it persists when connectivity is restored.
        await enqueue({ table_name: 'list_items', operation: 'UPDATE', payload: optimisticItem as Record<string, unknown> });
        return { item: optimisticItem };
      }
    },
    [userId],
  );

  const deleteListItem = useCallback<UseListsResult['deleteListItem']>(
    async (itemId) => {
      if (!userId) {
        return { error: 'You must be signed in to delete list items.' };
      }

      const targetList = listsRef.current.find(list => Array.isArray(list.items) && list.items.some(item => item.id === itemId));
      if (!targetList) {
        return { error: 'List item not found.' };
      }

      const role = targetList.access_role ?? 'owner';
      if (!['owner', 'editor'].includes(role)) {
        return { error: 'You do not have permission to delete this list item.' };
      }

      if (!isOnline()) {
        await db.list_items.delete(itemId);
        await enqueue({ table_name: 'list_items', operation: 'DELETE', payload: { id: itemId } });
        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === targetList.id
              ? { ...list, items: (list.items ?? []).filter(item => item.id !== itemId) }
              : list,
          ),
        }));
        return;
      }

      try {
        const { error } = await supabase
          .from('list_items')
          .delete()
          .eq('id', itemId);

        if (error) {
          throw new Error(error.message || 'Unable to delete list item.');
        }

        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === targetList.id
              ? {
                  ...list,
                  items: (list.items ?? []).filter(item => item.id !== itemId),
                }
              : list,
          ),
        }));
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to delete list item.') };
      }
    },
    [userId],
  );

  const reorderListItems = useCallback<UseListsResult['reorderListItems']>(
    async (listId, orderedIds) => {
      if (!userId) {
        return { error: 'You must be signed in to reorder list items.' };
      }

      const targetList = listsRef.current.find(list => list.id === listId);
      if (!targetList) {
        return { error: 'List not found.' };
      }

      const role = targetList.access_role ?? 'owner';
      if (!['owner', 'editor'].includes(role)) {
        return { error: 'You do not have permission to reorder this list.' };
      }

      const existingItems = Array.isArray(targetList.items) ? targetList.items : [];
      const orderMap = new Map(existingItems.map(item => [item.id, item] as const));
      const nextItems: ListItem[] = [];

      for (let index = 0; index < orderedIds.length; index += 1) {
        const id = orderedIds[index];
        const item = orderMap.get(id);
        if (!item) {
          return { error: 'List items changed. Refresh and try again.' };
        }
        nextItems.push({ ...item, position: index } as ListItem);
      }

      if (!isOnline()) {
        for (const item of nextItems) {
          await db.list_items.put(item);
          await enqueue({ table_name: 'list_items', operation: 'UPDATE', payload: { id: item.id, position: item.position } });
        }
        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list => (list.id === listId ? { ...list, items: nextItems } : list)),
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        lists: prev.lists.map(list =>
          list.id === listId
            ? {
                ...list,
                items: nextItems,
              }
            : list,
        ),
      }));

      try {
        const { error } = await supabase.rpc('reorder_list_items', {
          target_list_id: listId,
          ordered_ids: orderedIds,
        });

        if (error) {
          throw new Error(error.message || 'Unable to reorder list items.');
        }
      } catch (error) {
        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === listId
              ? {
                  ...list,
                  items: existingItems,
                }
              : list,
          ),
        }));
        return { error: extractErrorMessage(error, 'Unable to reorder list items.') };
      }
    },
    [userId],
  );

  return {
    ...state,
    createList,
    updateList,
    deleteList,
    createListItem,
    updateListItem,
    deleteListItem,
    reorderListItems,
    loadMembers: (listId) => loadMembers(listId),
    inviteMember: (listId, email, role) => inviteMember(listId, email, role),
    updateMemberRole: (memberId, role) => updateMemberRole(memberId, role),
    removeMember: (memberId) => removeMember(memberId),
    enablePublicShare: (listId) => enablePublicShare(listId, userId ?? '', listsRef, setState),
    rotatePublicShare: (listId) => rotatePublicShare(listId, userId ?? '', listsRef, setState),
    disablePublicShare: (listId) => disablePublicShare(listId, userId ?? '', listsRef, setState),
    archiveList: (id) => archiveList(id, userId ?? '', listsRef, setState),
    unarchiveList: (id) => unarchiveList(id, userId ?? '', listsRef, setState),
    refresh: (force) => runRefresh(force),
  };
}
