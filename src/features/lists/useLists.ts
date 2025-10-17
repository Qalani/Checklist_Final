import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { List, ListMember } from '@/types';
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
  createList: (input: { name: string; description?: string }) => Promise<void | ErrorResult>;
  updateList: (id: string, input: { name: string; description?: string }) => Promise<void | ErrorResult>;
  deleteList: (id: string) => Promise<void | ErrorResult>;
  loadMembers: (listId: string) => Promise<LoadMembersSuccess | ErrorResult>;
  inviteMember: (listId: string, email: string, role: ListMemberRole) => Promise<{ member: ListMember } | ErrorResult>;
  updateMemberRole: (memberId: string, role: ListMemberRole) => Promise<{ member: ListMember } | ErrorResult>;
  removeMember: (memberId: string) => Promise<void | ErrorResult>;
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
  } | null;
}

async function fetchLists(userId: string): Promise<List[]> {
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
          user_id
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

  return records
    .filter(record => record.list !== null)
    .map(record => {
      const list = record.list!;
      return {
        id: list.id,
        name: list.name,
        description: list.description,
        created_at: list.created_at ?? undefined,
        user_id: list.user_id,
        owner_id: list.user_id,
        access_role: record.role,
      } satisfies List;
    });
}

export function useLists(userId: string | null): UseListsResult {
  const [state, setState] = useState<ListsState>(INITIAL_STATE);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const membershipChannelRef = useRef<RealtimeChannel | null>(null);
  const listsChannelRef = useRef<RealtimeChannel | null>(null);
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

  const createList = useCallback<UseListsResult['createList']>(
    async (input) => {
      if (!userId) {
        return { error: 'You must be signed in to create lists.' };
      }

      try {
        const { data, error } = await supabase
          .from('lists')
          .insert({
            name: input.name,
            description: input.description ?? null,
            user_id: userId,
          })
          .select('*')
          .single();

        if (error) {
          throw new Error(error.message || 'Unable to create list.');
        }

        if (data) {
          setState(prev => ({
            ...prev,
            lists: [
              ...prev.lists,
              {
                id: data.id,
                name: data.name,
                description: data.description,
                created_at: data.created_at ?? undefined,
                user_id: data.user_id,
                owner_id: data.user_id,
                access_role: 'owner',
              },
            ],
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

  return {
    ...state,
    createList,
    updateList,
    deleteList,
    loadMembers,
    inviteMember,
    updateMemberRole,
    removeMember,
    refresh: (force) => runRefresh(force),
  };
}
