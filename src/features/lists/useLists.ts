import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { List } from '@/types';

export type ListsStatus = 'idle' | 'loading' | 'ready' | 'error';

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

export interface UseListsResult extends ListsState {
  createList: (input: { name: string; description?: string }) => Promise<{ error?: string } | void>;
  updateList: (id: string, input: { name: string; description?: string }) => Promise<{ error?: string } | void>;
  deleteList: (id: string) => Promise<{ error?: string } | void>;
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

async function fetchLists(userId: string): Promise<List[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to load lists.');
  }

  return data ?? [];
}

export function useLists(userId: string | null): UseListsResult {
  const [state, setState] = useState<ListsState>(INITIAL_STATE);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    currentUserIdRef.current = null;
  }, []);

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

  const createList = useCallback<UseListsResult['createList']>(
    async (input) => {
      if (!userId) {
        return { error: 'You must be signed in to create lists.' };
      }

      try {
        const { error } = await supabase.from('lists').insert({
          name: input.name,
          description: input.description ?? null,
          user_id: userId,
        });

        if (error) {
          throw new Error(error.message || 'Unable to create list.');
        }

        await runRefresh(true);
      } catch (error) {
        return { error: extractErrorMessage(error, 'Unable to create list.') };
      }
    },
    [runRefresh, userId],
  );

  const updateList = useCallback<UseListsResult['updateList']>(
    async (id, input) => {
      if (!userId) {
        return { error: 'You must be signed in to update lists.' };
      }

      try {
        const { error } = await supabase
          .from('lists')
          .update({
            name: input.name,
            description: input.description ?? null,
          })
          .eq('id', id)
          .eq('user_id', userId);

        if (error) {
          throw new Error(error.message || 'Unable to update list.');
        }

        setState(prev => ({
          ...prev,
          lists: prev.lists.map(list =>
            list.id === id ? { ...list, name: input.name, description: input.description ?? null } : list,
          ),
        }));
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

      try {
        const { error } = await supabase
          .from('lists')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);

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

  return {
    ...state,
    createList,
    updateList,
    deleteList,
    refresh: (force) => runRefresh(force),
  };
}
