import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { BlockedUser, Friend, FriendRequest, FriendSearchResult } from '@/types';

type FriendsStatus = 'idle' | 'loading' | 'ready' | 'error';

type ActionError = { error: string };

type FriendsResponse = {
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blocked: BlockedUser[];
  friendCode: string;
};

type ActionPayload =
  | { action: 'send_request'; targetUserId: string; message?: string | null }
  | { action: 'send_request_by_code'; friendCode: string; message?: string | null }
  | { action: 'respond_request'; requestId: string; decision: 'accepted' | 'declined' }
  | { action: 'cancel_request'; requestId: string }
  | { action: 'remove_friend'; friendUserId: string }
  | { action: 'block_user'; targetUserId: string; reason?: string | null }
  | { action: 'unblock_user'; targetUserId: string }
  | { action: 'invite'; friendUserId: string; resourceType: 'task' | 'list'; resourceId: string; role?: 'editor' | 'viewer' };

interface FriendsState {
  status: FriendsStatus;
  syncing: boolean;
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blocked: BlockedUser[];
  error: string | null;
  friendCode: string;
}

const INITIAL_STATE: FriendsState = {
  status: 'idle',
  syncing: false,
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  blocked: [],
  error: null,
  friendCode: '',
};

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('You must be signed in to perform this action.');
  }
  return token;
}

async function fetchFriends(token: string): Promise<FriendsResponse> {
  const response = await fetch('/api/friends', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error?: string }).error
      : 'Unable to load friends right now.';
    throw new Error(message);
  }

  return (payload ?? {}) as FriendsResponse;
}

async function postAction(token: string, action: ActionPayload): Promise<void> {
  const response = await fetch('/api/friends/actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(action),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error?: string }).error
      : 'Unable to complete that action.';
    throw new Error(message);
  }
}

async function searchFriends(token: string, query: string): Promise<FriendSearchResult[]> {
  const params = new URLSearchParams({ query });

  const response = await fetch(`/api/friends/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error?: string }).error
      : 'Unable to search for friends.';
    throw new Error(message);
  }

  return ((payload ?? {}) as { results?: FriendSearchResult[] }).results ?? [];
}

export interface UseFriendsResult extends FriendsState {
  refresh: (force?: boolean) => Promise<void>;
  search: (query: string) => Promise<FriendSearchResult[] | ActionError>;
  sendRequest: (targetUserId: string, message?: string | null) => Promise<void | ActionError>;
  sendRequestByCode: (friendCode: string, message?: string | null) => Promise<void | ActionError>;
  respondToRequest: (requestId: string, decision: 'accepted' | 'declined') => Promise<void | ActionError>;
  cancelRequest: (requestId: string) => Promise<void | ActionError>;
  removeFriend: (friendUserId: string) => Promise<void | ActionError>;
  blockUser: (targetUserId: string, reason?: string | null) => Promise<void | ActionError>;
  unblockUser: (targetUserId: string) => Promise<void | ActionError>;
  inviteFriend: (
    friendUserId: string,
    resourceType: 'task' | 'list',
    resourceId: string,
    role?: 'editor' | 'viewer',
  ) => Promise<void | ActionError>;
}

export function useFriends(userId: string | null): UseFriendsResult {
  const [state, setState] = useState<FriendsState>(INITIAL_STATE);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const currentUserRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    refreshPromiseRef.current = null;
    currentUserRef.current = null;
  }, []);

  const runRefresh = useCallback(
    async (force = false) => {
      if (!userId) {
        return;
      }

      if (refreshPromiseRef.current && !force) {
        return refreshPromiseRef.current;
      }

      const doRefresh = async () => {
        setState((prev) => ({
          ...prev,
          syncing: true,
          status: prev.status === 'idle' ? 'loading' : prev.status,
          error: prev.status === 'error' ? prev.error : null,
        }));

        try {
          const token = await getAccessToken();
          const data = await fetchFriends(token);
          setState({
            status: 'ready',
            syncing: false,
            friends: data.friends,
            incomingRequests: data.incomingRequests,
            outgoingRequests: data.outgoingRequests,
            blocked: data.blocked,
            error: null,
            friendCode: data.friendCode ?? '',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to load friends.';
          setState((prev) => ({
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

    if (currentUserRef.current === userId && state.status !== 'idle') {
      return;
    }

    currentUserRef.current = userId;
    void runRefresh(true);
  }, [reset, runRefresh, state.status, userId]);

  const executeAction = useCallback(
    async (action: ActionPayload): Promise<void | ActionError> => {
      if (!userId) {
        return { error: 'You must be signed in to manage friends.' };
      }

      try {
        const token = await getAccessToken();
        await postAction(token, action);
        await runRefresh(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to complete that action.';
        return { error: message };
      }
    },
    [runRefresh, userId],
  );

  const search = useCallback(
    async (query: string): Promise<FriendSearchResult[] | ActionError> => {
      if (!userId) {
        return { error: 'You must be signed in to search for friends.' };
      }

      const trimmed = query.trim();
      if (!trimmed) {
        return [];
      }

      try {
        const token = await getAccessToken();
        return await searchFriends(token, trimmed);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to search for friends.';
        return { error: message };
      }
    },
    [userId],
  );

  return {
    ...state,
    refresh: (force?: boolean) => runRefresh(Boolean(force)),
    search,
    sendRequest: (targetUserId, message) =>
      executeAction({ action: 'send_request', targetUserId, message: message ?? null }),
    sendRequestByCode: (friendCode, message) => {
      const normalized = friendCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!normalized) {
        return Promise.resolve({ error: 'Enter a friend code to continue.' });
      }
      return executeAction({ action: 'send_request_by_code', friendCode: normalized, message: message ?? null });
    },
    respondToRequest: (requestId, decision) =>
      executeAction({ action: 'respond_request', requestId, decision }),
    cancelRequest: (requestId) => executeAction({ action: 'cancel_request', requestId }),
    removeFriend: (friendUserId) => executeAction({ action: 'remove_friend', friendUserId }),
    blockUser: (targetUserId, reason) =>
      executeAction({ action: 'block_user', targetUserId, reason: reason ?? null }),
    unblockUser: (targetUserId) => executeAction({ action: 'unblock_user', targetUserId }),
    inviteFriend: (friendUserId, resourceType, resourceId, role) =>
      executeAction({ action: 'invite', friendUserId, resourceType, resourceId, role }),
  };
}
