import { supabase } from '@/lib/supabase';
import type { BlockedUser, Friend, FriendRequest, FriendSearchResult } from '@/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type FriendsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FriendsSnapshot {
  status: FriendsStatus;
  syncing: boolean;
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blocked: BlockedUser[];
  friendCode: string;
  error: string | null;
}

export type ActionError = { error: string };

type Subscriber = (snapshot: FriendsSnapshot) => void;

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
  | {
      action: 'invite';
      friendUserId: string;
      resourceType: 'task' | 'list';
      resourceId: string;
      role?: 'editor' | 'viewer';
    };

const INITIAL_SNAPSHOT: FriendsSnapshot = {
  status: 'idle',
  syncing: false,
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  blocked: [],
  friendCode: '',
  error: null,
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

export class FriendsManager {
  private snapshot: FriendsSnapshot = INITIAL_SNAPSHOT;
  private userId: string | null = null;
  private subscribers = new Set<Subscriber>();
  private refreshPromise: Promise<void> | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private realtimeRefreshInFlight = false;
  private realtimeRefreshQueued = false;

  subscribe(subscriber: Subscriber) {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  getSnapshot(): FriendsSnapshot {
    return this.snapshot;
  }

  dispose() {
    this.cleanupRealtime();
    this.subscribers.clear();
  }

  async setUser(userId: string | null) {
    if (this.userId === userId) {
      return;
    }

    this.cleanupRealtime();
    this.refreshPromise = null;
    this.realtimeRefreshInFlight = false;
    this.realtimeRefreshQueued = false;

    if (!userId) {
      this.userId = null;
      this.setSnapshot(INITIAL_SNAPSHOT);
      return;
    }

    this.userId = userId;
    this.setSnapshot({
      status: 'loading',
      syncing: true,
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      blocked: [],
      friendCode: '',
      error: null,
    });

    await this.refresh(true);
    this.subscribeToRealtime(userId);
  }

  async refresh(force = false) {
    if (!this.userId) {
      return;
    }

    if (this.refreshPromise && !force) {
      await this.refreshPromise;
      return;
    }

    const run = async () => {
      this.setSnapshot((prev) => ({
        ...prev,
        syncing: true,
        status: prev.status === 'idle' ? 'loading' : prev.status,
        error: prev.status === 'error' ? prev.error : null,
      }));

      try {
        const token = await getAccessToken();
        const data = await fetchFriends(token);
        this.setSnapshot({
          status: 'ready',
          syncing: false,
          friends: data.friends,
          incomingRequests: data.incomingRequests,
          outgoingRequests: data.outgoingRequests,
          blocked: data.blocked,
          friendCode: data.friendCode ?? '',
          error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load friends.';
        this.setSnapshot((prev) => ({
          ...prev,
          syncing: false,
          status: prev.status === 'idle' ? 'error' : prev.status,
          error: message,
        }));
      }
    };

    const promise = run();
    this.refreshPromise = promise;

    try {
      await promise;
    } finally {
      if (this.refreshPromise === promise) {
        this.refreshPromise = null;
      }
    }
  }

  async search(query: string): Promise<FriendSearchResult[] | ActionError> {
    if (!this.userId) {
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
  }

  sendRequest(targetUserId: string, message?: string | null) {
    return this.executeAction({ action: 'send_request', targetUserId, message: message ?? null });
  }

  sendRequestByCode(friendCode: string, message?: string | null) {
    const normalized = friendCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!normalized) {
      return Promise.resolve({ error: 'Enter a friend code to continue.' });
    }
    return this.executeAction({ action: 'send_request_by_code', friendCode: normalized, message: message ?? null });
  }

  respondToRequest(requestId: string, decision: 'accepted' | 'declined') {
    return this.executeAction({ action: 'respond_request', requestId, decision });
  }

  cancelRequest(requestId: string) {
    return this.executeAction({ action: 'cancel_request', requestId });
  }

  removeFriend(friendUserId: string) {
    return this.executeAction({ action: 'remove_friend', friendUserId });
  }

  blockUser(targetUserId: string, reason?: string | null) {
    return this.executeAction({ action: 'block_user', targetUserId, reason: reason ?? null });
  }

  unblockUser(targetUserId: string) {
    return this.executeAction({ action: 'unblock_user', targetUserId });
  }

  inviteFriend(friendUserId: string, resourceType: 'task' | 'list', resourceId: string, role?: 'editor' | 'viewer') {
    return this.executeAction({ action: 'invite', friendUserId, resourceType, resourceId, role });
  }

  private async executeAction(action: ActionPayload): Promise<void | ActionError> {
    if (!this.userId) {
      return { error: 'You must be signed in to manage friends.' };
    }

    try {
      const token = await getAccessToken();
      await postAction(token, action);
      await this.refresh(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to complete that action.';
      return { error: message };
    }
  }

  private subscribeToRealtime(userId: string) {
    const channel = supabase
      .channel(`friends:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends', filter: `user_id=eq.${userId}` }, () => {
        this.queueRealtimeRefresh();
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `requester_id=eq.${userId}` },
        () => {
          this.queueRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `requested_id=eq.${userId}` },
        () => {
          this.queueRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_blocks', filter: `user_id=eq.${userId}` },
        () => {
          this.queueRealtimeRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_codes', filter: `user_id=eq.${userId}` },
        () => {
          this.queueRealtimeRefresh();
        },
      );

    this.realtimeChannel = channel;

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Supabase realtime channel error for friends');
      }

      if (status === 'CLOSED' && this.realtimeChannel === channel) {
        this.realtimeChannel = null;
      }
    });
  }

  private queueRealtimeRefresh() {
    if (!this.userId) {
      return;
    }

    if (this.realtimeRefreshInFlight) {
      this.realtimeRefreshQueued = true;
      return;
    }

    this.realtimeRefreshInFlight = true;
    void this.refresh(true).finally(() => {
      this.realtimeRefreshInFlight = false;
      if (this.realtimeRefreshQueued) {
        this.realtimeRefreshQueued = false;
        this.queueRealtimeRefresh();
      }
    });
  }

  private cleanupRealtime() {
    if (!this.realtimeChannel) {
      return;
    }

    const channel = this.realtimeChannel;
    this.realtimeChannel = null;
    void channel.unsubscribe();
  }

  private setSnapshot(
    patch: FriendsSnapshot | ((snapshot: FriendsSnapshot) => FriendsSnapshot),
  ) {
    if (typeof patch === 'function') {
      this.snapshot = (patch as (snapshot: FriendsSnapshot) => FriendsSnapshot)(this.snapshot);
    } else {
      this.snapshot = { ...this.snapshot, ...patch };
    }

    this.subscribers.forEach((subscriber) => subscriber(this.snapshot));
  }
}
