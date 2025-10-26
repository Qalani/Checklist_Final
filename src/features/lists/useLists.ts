import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { List, ListItem, ListMember } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type ListsStatus = 'idle' | 'loading' | 'ready' | 'error';

type ListMemberRole = ListMember['role'];

interface ListsState {
  status: ListsStatus;
  syncing: boolean;
  lists: List[];
  error: string | null;
}

const INITIAL_STATE: ListsState = {
  status: 'idle',
  syncing: false,
  lists: [],
  error: null,
};

interface LoadMembersSuccess {
  members: ListMember[];
}

interface ErrorResult {
  error: string;
}

export interface UseListsResult extends ListsState {
  createList: (
    input: { name: string; description?: string; createdAt?: string | Date },
  ) => Promise<void | ErrorResult>;
  updateList: (id: string, input: { name: string; description?: string }) => Promise<void | ErrorResult>;
  deleteList: (id: string) => Promise<void | ErrorResult>;
  createListItem: (listId: string, content?: string) => Promise<{ item: ListItem } | ErrorResult>;
  updateListItem: (
    itemId: string,
    updates: { content?: string; completed?: boolean },
  ) => Promise<{ item: ListItem } | ErrorResult>;
  deleteListItem: (itemId: string) => Promise<void | ErrorResult>;
  reorderListItems: (listId: string, orderedIds: string[]) => Promise<void | ErrorResult>;
  loadMembers: (listId: string) => Promise<LoadMembersSuccess | ErrorResult>;
  inviteMember: (listId: string, email: string, role: ListMemberRole) => Promise<{ member: ListMember } | ErrorResult>;
  updateMemberRole: (memberId: string, role: ListMemberRole) => Promise<{ member: ListMember } | ErrorResult>;
  removeMember: (memberId: string) => Promise<void | ErrorResult>;
  enablePublicShare: (listId: string) => Promise<{ token: string } | ErrorResult>;
  rotatePublicShare: (listId: string) => Promise<{ token: string } | ErrorResult>;
  disablePublicShare: (listId: string) => Promise<void | ErrorResult>;
  refresh: (force?: boolean) => Promise<void>;
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'object' && 'message' in (error as Record<string, unknown>)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
}

interface ListMembershipRow {
  role: ListMemberRole;
  list_id: string;
  list: {
    id: string;
    name: string;
    description: string | null;
    created_at: string | null;
    user_id: string;
    public_share: { token: string }[] | null;
  } | null;
}

interface ListItemRow {
  id: string;
  list_id: string;
  content: string;
  completed: boolean;
  position: number;
  created_at: string | null;
  updated_at: string | null;
}

function mapListItem(row: ListItemRow): ListItem {
  return {
    id: row.id,
    list_id: row.list_id,
    content: row.content,
    completed: row.completed,
    position: row.position,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
  } satisfies ListItem;
}

export async function fetchLists(userId: string): Promise<List[]> {
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

          setState(prev => ({
            ...prev,
            lists: [...prev.lists, newList],
            status: prev.status === 'idle' ? 'ready' : prev.status,
          }));
        }
      } catch (error) {
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

      const existingItems = Array.isArray(targetList.items) ? targetList.items : [];
      const nextPosition = existingItems.reduce((max, item) => Math.max(max, item.position ?? 0), -1) + 1;

      try {
        const { data, error } = await supabase
          .from('list_items')
          .insert({
            list_id: listId,
            content,
            position: nextPosition,
          })
          .select('id, list_id, content, completed, position, created_at, updated_at')
          .single();

        if (error) {
          throw new Error(error.message || 'Unable to add list item.');
        }

        const row = data as ListItemRow | null;
        if (!row) {
          throw new Error('List item was not returned after creation.');
        }

        const item = mapListItem(row);

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
        return { error: extractErrorMessage(error, 'Unable to update list item.') };
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
        nextItems.push({ ...item, position: index });
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

  const loadMembers = useCallback<UseListsResult['loadMembers']>(
    async (listId) => {
      try {
        const { data, error } = await supabase
          .from('list_members')
          .select('id, list_id, user_id, user_email, role, created_at')
          .eq('list_id', listId)
          .order('role', { ascending: true })
          .order('created_at', { ascending: true });

        if (error) {
          throw new Error(error.message || 'Unable to load members.');
        }

        return { members: (data ?? []) as ListMember[] };
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to load members.') };
      }
    },
    [],
  );

  const inviteMember = useCallback<UseListsResult['inviteMember']>(
    async (listId, email, role) => {
      if (!email.trim()) {
        return { error: 'Enter an email address to invite.' };
      }

      try {
        const { data, error } = await supabase.rpc('invite_list_member', {
          list_uuid: listId,
          invitee_email: email.trim(),
          desired_role: role,
        });

        if (error) {
          throw new Error(error.message || 'Unable to invite collaborator.');
        }

        const member = data as ListMember | null;
        if (!member) {
          throw new Error('Invite did not return the new member.');
        }

        return { member };
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to invite collaborator.') };
      }
    },
    [],
  );

  const updateMemberRole = useCallback<UseListsResult['updateMemberRole']>(
    async (memberId, role) => {
      try {
        const { data, error } = await supabase
          .from('list_members')
          .update({ role })
          .eq('id', memberId)
          .select('*')
          .single();

        if (error) {
          throw new Error(error.message || 'Unable to update member.');
        }

        return { member: data as ListMember };
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to update member.') };
      }
    },
    [],
  );

  const removeMember = useCallback<UseListsResult['removeMember']>(
    async (memberId) => {
      try {
        const { error } = await supabase
          .from('list_members')
          .delete()
          .eq('id', memberId);

        if (error) {
          throw new Error(error.message || 'Unable to remove member.');
        }
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to remove member.') };
      }
    },
    [],
  );

  const enablePublicShare = useCallback<UseListsResult['enablePublicShare']>(
    async (listId) => {
      if (!userId) {
        return { error: 'You must be signed in to manage public sharing.' };
      }

      const existing = listsRef.current.find(list => list.id === listId);
      if (!existing) {
        return { error: 'List not found.' };
      }

      if (existing.access_role !== 'owner') {
        return { error: 'Only owners can enable public sharing.' };
      }

      try {
        const { data, error } = await supabase.rpc('enable_list_public_share', {
          list_uuid: listId,
        });

        if (error) {
          throw new Error(error.message || 'Unable to enable public sharing.');
        }

        const share = data as { token?: string | null } | null;
        const token = share?.token ?? null;

        if (!token) {
          throw new Error('Public share token was not returned.');
        }

        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === listId
              ? { ...list, public_share_token: token, public_share_enabled: true }
              : list,
          ),
        }));

        return { token };
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to enable public sharing.') };
      }
    },
    [userId],
  );

  const rotatePublicShare = useCallback<UseListsResult['rotatePublicShare']>(
    async (listId) => {
      if (!userId) {
        return { error: 'You must be signed in to rotate public sharing.' };
      }

      const existing = listsRef.current.find(list => list.id === listId);
      if (!existing) {
        return { error: 'List not found.' };
      }

      if (existing.access_role !== 'owner') {
        return { error: 'Only owners can rotate public sharing.' };
      }

      if (!existing.public_share_enabled || !existing.public_share_token) {
        return { error: 'Public sharing is not enabled for this list.' };
      }

      try {
        const { data, error } = await supabase.rpc('rotate_list_public_share', {
          list_uuid: listId,
        });

        if (error) {
          throw new Error(error.message || 'Unable to refresh the share link.');
        }

        const share = data as { token?: string | null } | null;
        const token = share?.token ?? null;

        if (!token) {
          throw new Error('Public share token was not returned.');
        }

        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === listId
              ? { ...list, public_share_token: token, public_share_enabled: true }
              : list,
          ),
        }));

        return { token };
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to refresh the share link.') };
      }
    },
    [userId],
  );

  const disablePublicShare = useCallback<UseListsResult['disablePublicShare']>(
    async (listId) => {
      if (!userId) {
        return { error: 'You must be signed in to disable public sharing.' };
      }

      const existing = listsRef.current.find(list => list.id === listId);
      if (!existing) {
        return { error: 'List not found.' };
      }

      if (existing.access_role !== 'owner') {
        return { error: 'Only owners can disable public sharing.' };
      }

      try {
        const { error } = await supabase.rpc('disable_list_public_share', {
          list_uuid: listId,
        });

        if (error) {
          throw new Error(error.message || 'Unable to disable public sharing.');
        }

        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === listId
              ? { ...list, public_share_token: null, public_share_enabled: false }
              : list,
          ),
        }));
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to disable public sharing.') };
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
    loadMembers,
    inviteMember,
    updateMemberRole,
    removeMember,
    enablePublicShare,
    rotatePublicShare,
    disablePublicShare,
    refresh: (force) => runRefresh(force),
  };
}
