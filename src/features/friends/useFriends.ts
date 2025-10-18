import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Friend, FriendRequest } from '@/types';

export type FriendsStatus = 'idle' | 'loading' | 'ready' | 'error';

type RespondAction = 'accept' | 'decline';

interface FriendsState {
  status: FriendsStatus;
  syncing: boolean;
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  error: string | null;
}

interface ActionError {
  error: string;
}

interface AddFriendSuccess {
  request: FriendRequest;
}

export interface UseFriendsResult extends FriendsState {
  refresh: (force?: boolean) => Promise<void>;
  addFriend: (email: string) => Promise<AddFriendSuccess | ActionError>;
  removeFriend: (friendUserId: string) => Promise<void | ActionError>;
  acceptRequest: (requestId: string) => Promise<void | ActionError>;
  declineRequest: (requestId: string) => Promise<void | ActionError>;
}

const INITIAL_STATE: FriendsState = {
  status: 'idle',
  syncing: false,
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
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

type FriendRequestRow = {
  id: string;
  requester_id: string;
  requester_email: string;
  requester_name: string | null;
  target_id: string;
  target_email: string;
  target_name: string | null;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string | null;
  responded_at: string | null;
};

function mapFriendRow(row: FriendsRow): Friend {
  return {
    id: row.id,
    user_id: row.user_id,
    friend_id: row.friend_id,
    friend_email: row.friend_email,
    friend_name: row.friend_name ?? undefined,
    created_at: row.created_at ?? undefined,
  } satisfies Friend;
}

function mapRequestRow(row: FriendRequestRow): FriendRequest {
  return {
    id: row.id,
    requester_id: row.requester_id,
    requester_email: row.requester_email,
    requester_name: row.requester_name ?? undefined,
    target_id: row.target_id,
    target_email: row.target_email,
    target_name: row.target_name ?? undefined,
    status: row.status,
    created_at: row.created_at ?? undefined,
    responded_at: row.responded_at ?? undefined,
  } satisfies FriendRequest;
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

async function fetchFriendsData(userId: string): Promise<{
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}> {
  const [friendsResult, requestsResult] = await Promise.all([
    supabase
      .from('friends')
      .select('id, user_id, friend_id, friend_email, friend_name, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .returns<FriendsRow[]>(),
    supabase
      .from('friend_requests')
      .select(
        'id, requester_id, requester_email, requester_name, target_id, target_email, target_name, status, created_at, responded_at',
      )
      .or(`requester_id.eq.${userId},target_id.eq.${userId}`)
      .order('created_at', { ascending: true })
      .returns<FriendRequestRow[]>(),
  ]);

  if (friendsResult.error) {
    throw new Error(friendsResult.error.message || 'Unable to load friends.');
  }

  if (requestsResult.error) {
    throw new Error(requestsResult.error.message || 'Unable to load friend requests.');
  }

  const friendRows = (friendsResult.data ?? []).map(mapFriendRow);
  const requestRows = (requestsResult.data ?? []).map(mapRequestRow);

  return {
    friends: friendRows,
    incoming: requestRows.filter(request => request.status === 'pending' && request.target_id === userId),
    outgoing: requestRows.filter(request => request.status === 'pending' && request.requester_id === userId),
  };
}

export function useFriends(userId: string | null): UseFriendsResult {
  const [state, setState] = useState<FriendsState>(INITIAL_STATE);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const friendsChannelRef = useRef<RealtimeChannel | null>(null);
  const requestsChannelRef = useRef<RealtimeChannel | null>(null);
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
          const data = await fetchFriendsData(userId);
          setState({
            status: 'ready',
            syncing: false,
            friends: data.friends,
            incomingRequests: data.incoming,
            outgoingRequests: data.outgoing,
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
      if (friendsChannelRef.current) {
        const channel = friendsChannelRef.current;
        friendsChannelRef.current = null;
        void channel.unsubscribe();
      }
      if (requestsChannelRef.current) {
        const channel = requestsChannelRef.current;
        requestsChannelRef.current = null;
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
    const unsubscribe = async () => {
      if (friendsChannelRef.current) {
        const channel = friendsChannelRef.current;
        friendsChannelRef.current = null;
        await channel.unsubscribe();
      }
      if (requestsChannelRef.current) {
        const channel = requestsChannelRef.current;
        requestsChannelRef.current = null;
        await channel.unsubscribe();
      }
    };

    void unsubscribe();

    if (!userId) {
      return;
    }

    const friendsChannel = supabase
      .channel(`friends:user:${userId}`)
      .on(
        'postgres_changes',
        { schema: 'public', table: 'friends', event: '*', filter: `user_id=eq.${userId}` },
        () => {
          void runRefresh(true);
        },
      )
      .subscribe();

    const requestsChannel = supabase
      .channel(`friend-requests:user:${userId}`)
      .on(
        'postgres_changes',
        { schema: 'public', table: 'friend_requests', event: '*', filter: `requester_id=eq.${userId}` },
        () => {
          void runRefresh(true);
        },
      )
      .on(
        'postgres_changes',
        { schema: 'public', table: 'friend_requests', event: '*', filter: `target_id=eq.${userId}` },
        () => {
          void runRefresh(true);
        },
      )
      .subscribe();

    friendsChannelRef.current = friendsChannel;
    requestsChannelRef.current = requestsChannel;

    return () => {
      friendsChannelRef.current = null;
      requestsChannelRef.current = null;
      void friendsChannel.unsubscribe();
      void requestsChannel.unsubscribe();
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
      return { error: 'Friend request sent, but no details were returned. Refresh to see the update.' };
    }

    const request = mapRequestRow(data as FriendRequestRow);
    setState(prev => ({
      ...prev,
      outgoingRequests: prev.outgoingRequests.some(existing => existing.id === request.id)
        ? prev.outgoingRequests
        : [...prev.outgoingRequests, request].sort((a, b) => {
            const aDate = a.created_at ?? '';
            const bDate = b.created_at ?? '';
            if (aDate && bDate && aDate !== bDate) {
              return aDate.localeCompare(bDate);
            }
            return a.target_email.localeCompare(b.target_email);
          }),
    }));
    return { request };
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

  const respondToRequest = useCallback(
    async (requestId: string, action: RespondAction) => {
      if (!userId) {
        return { error: 'You need to be signed in to manage friend requests.' };
      }

      const { error } = await supabase.rpc('respond_to_friend_request', {
        request_id: requestId,
        action,
      });

      if (error) {
        return { error: extractErrorMessage(error, 'Unable to update that friend request.') };
      }

      await runRefresh(true);
      return undefined;
    },
    [runRefresh, userId],
  );

  const acceptRequest = useCallback<UseFriendsResult['acceptRequest']>(
    requestId => respondToRequest(requestId, 'accept'),
    [respondToRequest],
  );

  const declineRequest = useCallback<UseFriendsResult['declineRequest']>(
    requestId => respondToRequest(requestId, 'decline'),
    [respondToRequest],
  );

  return useMemo(
    () => ({
      ...state,
      refresh: (force?: boolean) => runRefresh(Boolean(force)),
      addFriend,
      removeFriend,
      acceptRequest,
      declineRequest,
    }),
    [acceptRequest, addFriend, declineRequest, removeFriend, runRefresh, state],
  );
}
