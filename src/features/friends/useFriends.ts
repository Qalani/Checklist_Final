import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Friend } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type FriendsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface FriendsState {
  status: FriendsStatus;
  syncing: boolean;
  friends: Friend[];
  error: string | null;
}

interface ActionError {
  error: string;
}

interface AddFriendSuccess {
  friend: Friend;
}

export interface UseFriendsResult extends FriendsState {
  refresh: (force?: boolean) => Promise<void>;
  addFriend: (email: string) => Promise<AddFriendSuccess | ActionError>;
  removeFriend: (friendUserId: string) => Promise<void | ActionError>;
}

const INITIAL_STATE: FriendsState = {
  status: 'idle',
  syncing: false,
  friends: [],
  error: null,
};

type FriendsRow = {
  id: string;
  user_id: string;
  friend_id: string;
  friend_email: string;
  friend_name: string | null;
  created_at: string | null;
};

function mapRow(row: FriendsRow): Friend {
  return {
    id: row.id,
    user_id: row.user_id,
    friend_id: row.friend_id,
    friend_email: row.friend_email,
    friend_name: row.friend_name ?? undefined,
    created_at: row.created_at ?? undefined,
  } satisfies Friend;
}

function extractErrorMessage(error: unknown, fallback: string): string {
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

async function fetchFriends(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from('friends')
    .select('id, user_id, friend_id, friend_email, friend_name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .returns<FriendsRow[]>();

  if (error) {
    throw new Error(error.message || 'Unable to load friends.');
  }

  return (data ?? []).map(mapRow);
}

export function useFriends(userId: string | null): UseFriendsResult {
  const [state, setState] = useState<FriendsState>(INITIAL_STATE);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentUserRef = useRef<string | null>(null);

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
          const friends = await fetchFriends(userId);
          setState({
            status: 'ready',
            syncing: false,
            friends,
            error: null,
          });
        } catch (error) {
          const message = extractErrorMessage(error, 'Failed to load friends.');
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
      setState(INITIAL_STATE);
      currentUserRef.current = null;
      refreshPromiseRef.current = null;
      if (channelRef.current) {
        const channel = channelRef.current;
        channelRef.current = null;
        void channel.unsubscribe();
      }
      return;
    }

    if (currentUserRef.current === userId && state.status !== 'idle') {
      return;
    }

    currentUserRef.current = userId;
    void runRefresh(true);
  }, [runRefresh, state.status, userId]);

  useEffect(() => {
    if (channelRef.current) {
      const channel = channelRef.current;
      channelRef.current = null;
      void channel.unsubscribe();
    }

    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`friends:user:${userId}`)
      .on(
        'postgres_changes',
        { schema: 'public', table: 'friends', event: '*', filter: `user_id=eq.${userId}` },
        () => {
          void runRefresh(true);
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        const current = channelRef.current;
        channelRef.current = null;
        void current.unsubscribe();
      }
    };
  }, [runRefresh, userId]);

  const addFriend = useCallback<UseFriendsResult['addFriend']>(async (email) => {
    if (!userId) {
      return { error: 'You need to be signed in to add friends.' };
    }

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      return { error: 'Enter an email address to continue.' };
    }

    const { data, error } = await supabase.rpc('add_friend_by_email', {
      target_email: normalizedEmail,
    });

    if (error) {
      return { error: extractErrorMessage(error, 'Unable to add that friend.') };
    }

    if (!data) {
      void runRefresh(true);
      return { error: 'Friend added, but no details were returned. Refresh to see the update.' };
    }

    const friend = mapRow(data as FriendsRow);
    setState(prev => ({
      ...prev,
      friends: prev.friends.some(existing => existing.id === friend.id)
        ? prev.friends
        : [...prev.friends, friend].sort((a, b) => {
            const aDate = a.created_at ?? '';
            const bDate = b.created_at ?? '';
            if (aDate && bDate && aDate !== bDate) {
              return aDate.localeCompare(bDate);
            }
            return a.friend_email.localeCompare(b.friend_email);
          }),
    }));
    return { friend };
  }, [runRefresh, userId]);

  const removeFriend = useCallback<UseFriendsResult['removeFriend']>(async (friendUserId) => {
    if (!userId) {
      return { error: 'You need to be signed in to manage friends.' };
    }

    const { error } = await supabase.rpc('remove_friend', {
      target_friend_id: friendUserId,
    });

    if (error) {
      return { error: extractErrorMessage(error, 'Unable to remove that friend.') };
    }

    setState(prev => ({
      ...prev,
      friends: prev.friends.filter(friend => friend.friend_id !== friendUserId),
    }));

    return undefined;
  }, [userId]);

  return useMemo(() => ({
    ...state,
    refresh: (force?: boolean) => runRefresh(Boolean(force)),
    addFriend,
    removeFriend,
  }), [addFriend, removeFriend, runRefresh, state]);
}
