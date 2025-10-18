import { supabase } from '@/lib/supabase';
import type { BlockedUser, Friend, FriendRequest, FriendSearchResult } from '@/types';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

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

type FriendRow = {
  id: string;
  user_id: string;
  friend_id: string;
  created_at: string | null;
};

type FriendRequestRow = {
  id: string;
  requester_id: string;
  requested_id: string;
  message: string | null;
  status: FriendRequest['status'];
  created_at: string | null;
  updated_at: string | null;
  responded_at: string | null;
};

type BlockedRow = {
  id: string;
  user_id: string;
  blocked_user_id: string;
  reason: string | null;
  created_at: string | null;
};

type FriendCodeRow = {
  user_id: string;
  code: string | null;
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

type ProfileSummary = {
  id: string;
  email: string | null;
  name: string | null;
};

interface FriendSummaryResponse {
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blocked: BlockedUser[];
  friendCode: string;
}

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

async function fetchFriendSummary(token: string): Promise<FriendSummaryResponse> {
  const response = await fetch('/api/friends', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error?: string }).error
      : 'Unable to load friend data.';
    throw new Error(message);
  }

  const friends = Array.isArray((payload as { friends?: unknown }).friends)
    ? ((payload as { friends: Friend[] }).friends ?? [])
    : [];
  const incomingRequests = Array.isArray((payload as { incomingRequests?: unknown }).incomingRequests)
    ? ((payload as { incomingRequests: FriendRequest[] }).incomingRequests ?? [])
    : [];
  const outgoingRequests = Array.isArray((payload as { outgoingRequests?: unknown }).outgoingRequests)
    ? ((payload as { outgoingRequests: FriendRequest[] }).outgoingRequests ?? [])
    : [];
  const blocked = Array.isArray((payload as { blocked?: unknown }).blocked)
    ? ((payload as { blocked: BlockedUser[] }).blocked ?? [])
    : [];
  const friendCode = typeof (payload as { friendCode?: unknown }).friendCode === 'string'
    ? (payload as { friendCode: string }).friendCode
    : '';

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    blocked,
    friendCode,
  } satisfies FriendSummaryResponse;
}

async function ensureFriendIdentity(token: string): Promise<string> {
  const response = await fetch('/api/friends/identity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error?: string }).error
        : 'Unable to ensure your friend code.';
    throw new Error(message);
  }

  const friendCode =
    typeof (payload as { friendCode?: unknown }).friendCode === 'string'
      ? (payload as { friendCode: string }).friendCode
      : '';

  return friendCode;
}

async function fetchProfiles(token: string, userIds: string[]): Promise<Map<string, ProfileSummary>> {
  if (!userIds.length) {
    return new Map();
  }

  const response = await fetch('/api/friends/profiles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids: userIds }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error?: string }).error
        : 'Unable to load friend profiles.';
    throw new Error(message);
  }

  const list = Array.isArray((payload as { profiles?: unknown }).profiles)
    ? ((payload as { profiles: ProfileSummary[] }).profiles ?? [])
    : [];

  return new Map(list.map((profile) => [profile.id, profile]));
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

function sortByCreatedAt<T extends { created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.created_at && b.created_at && a.created_at !== b.created_at) {
      return a.created_at.localeCompare(b.created_at);
    }
    if (a.created_at && !b.created_at) {
      return -1;
    }
    if (!a.created_at && b.created_at) {
      return 1;
    }
    return 0;
  });
}

export class FriendsManager {
  private snapshot: FriendsSnapshot = { ...INITIAL_SNAPSHOT };
  private userId: string | null = null;
  private subscribers = new Set<Subscriber>();
  private refreshPromise: Promise<void> | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private friendRecords = new Map<string, FriendRow>();
  private requestRecords = new Map<string, FriendRequestRow>();
  private blockedRecords = new Map<string, BlockedRow>();
  private profileCache = new Map<string, ProfileSummary>();
  private pendingProfileLookups = new Set<string>();
  private friendCodeValue = '';
  private currentUserEmail: string | null = null;

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
    this.friendRecords.clear();
    this.requestRecords.clear();
    this.blockedRecords.clear();
    this.profileCache.clear();
    this.pendingProfileLookups.clear();
  }

  async setUser(userId: string | null) {
    if (this.userId === userId) {
      return;
    }

    this.cleanupRealtime();
    this.refreshPromise = null;

    if (!userId) {
      this.userId = null;
      this.friendRecords.clear();
      this.requestRecords.clear();
      this.blockedRecords.clear();
      this.profileCache.clear();
      this.pendingProfileLookups.clear();
      this.friendCodeValue = '';
      this.currentUserEmail = null;
      this.snapshot = { ...INITIAL_SNAPSHOT };
      this.subscribers.forEach((subscriber) => subscriber(this.snapshot));
      return;
    }

    this.userId = userId;
    this.friendRecords.clear();
    this.requestRecords.clear();
    this.blockedRecords.clear();
    this.profileCache.clear();
    this.pendingProfileLookups.clear();
    this.friendCodeValue = '';

    await this.loadCurrentUserEmail();
    if (this.userId && this.currentUserEmail) {
      this.profileCache.set(this.userId, {
        id: this.userId,
        email: this.currentUserEmail,
        name: null,
      });
    }

    this.publishSnapshot({ status: 'loading', syncing: true, error: null, friendCode: '' });

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
      const nextStatus = this.snapshot.status === 'idle' ? 'loading' : this.snapshot.status;
      const nextError = this.snapshot.status === 'error' ? this.snapshot.error : null;
      this.publishSnapshot({ status: nextStatus, syncing: true, error: nextError });

      try {
        const currentUserId = this.userId;
        if (!currentUserId) {
          return;
        }

        const token = await getAccessToken();
        await this.loadCurrentUserEmail();

        const summary = await fetchFriendSummary(token);

        let ensuredCode = summary.friendCode;

        if (!ensuredCode) {
          try {
            ensuredCode = await ensureFriendIdentity(token);
          } catch (identityError) {
            console.error('Failed to ensure friend code for user', currentUserId, identityError);
          }
        }

        const friendRows = summary.friends.map((friend) => ({
          id: friend.id,
          user_id: friend.user_id,
          friend_id: friend.friend_id,
          created_at: friend.created_at ?? null,
        } satisfies FriendRow));

        const requestRows = [...summary.incomingRequests, ...summary.outgoingRequests].map((request) => ({
          id: request.id,
          requester_id: request.requester_id,
          requested_id: request.requested_id,
          message: request.message ?? null,
          status: request.status,
          created_at: request.created_at ?? null,
          updated_at: request.updated_at ?? null,
          responded_at: request.responded_at ?? null,
        } satisfies FriendRequestRow));

        const blockedRows = summary.blocked.map((blocked) => ({
          id: blocked.id,
          user_id: blocked.user_id,
          blocked_user_id: blocked.blocked_user_id,
          reason: blocked.reason ?? null,
          created_at: blocked.created_at ?? null,
        } satisfies BlockedRow));

        const profileEntries = new Map<string, ProfileSummary>();

        const normalizeEmail = (email: string | null | undefined) => {
          if (!email || email === 'Unknown user') {
            return null;
          }
          return email;
        };

        const normalizeName = (name: string | null | undefined) => {
          if (!name || name === 'Unknown user') {
            return null;
          }
          return name;
        };

        const upsertProfile = (id: string, email?: string | null, name?: string | null) => {
          if (!id || id === currentUserId) {
            return;
          }

          const sanitizedEmail = normalizeEmail(email ?? null);
          const sanitizedName = normalizeName(name ?? null);

          const existing = profileEntries.get(id);
          if (existing) {
            profileEntries.set(id, {
              id,
              email: sanitizedEmail ?? existing.email,
              name: sanitizedName ?? existing.name,
            });
            return;
          }

          profileEntries.set(id, {
            id,
            email: sanitizedEmail,
            name: sanitizedName,
          });
        };

        summary.friends.forEach((friend) => {
          upsertProfile(friend.friend_id, friend.friend_email ?? null, friend.friend_name ?? null);
        });

        summary.incomingRequests.forEach((request) => {
          upsertProfile(request.requester_id, request.requester_email ?? null, null);
        });

        summary.outgoingRequests.forEach((request) => {
          upsertProfile(request.requested_id, request.requested_email ?? null, null);
        });

        summary.blocked.forEach((blocked) => {
          upsertProfile(blocked.blocked_user_id, blocked.blocked_email ?? null, blocked.blocked_name ?? null);
        });

        const missingProfileIds = Array.from(profileEntries.values())
          .filter((profile) => !profile.email && !profile.name)
          .map((profile) => profile.id);

        if (missingProfileIds.length > 0) {
          try {
            const fetchedProfiles = await fetchProfiles(token, missingProfileIds);
            fetchedProfiles.forEach((profile, id) => {
              const existing = profileEntries.get(id);
              if (existing) {
                profileEntries.set(id, {
                  id,
                  email: profile.email ?? existing.email,
                  name: profile.name ?? existing.name,
                });
              } else {
                profileEntries.set(id, profile);
              }
            });
          } catch (profileError) {
            console.error('Failed to backfill friend profiles from summary', profileError);
          }
        }

        this.friendRecords = new Map(friendRows.map((record) => [record.id, record]));
        this.requestRecords = new Map(requestRows.map((record) => [record.id, record]));
        this.blockedRecords = new Map(blockedRows.map((record) => [record.id, record]));
        this.profileCache = profileEntries;
        this.pendingProfileLookups.clear();
        this.friendCodeValue = ensuredCode || summary.friendCode || this.friendCodeValue || '';

        if (this.userId && this.currentUserEmail) {
          this.profileCache.set(this.userId, {
            id: this.userId,
            email: this.currentUserEmail,
            name: null,
          });
        }

        this.publishSnapshot({ status: 'ready', syncing: false, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load friends.';
        const status = this.snapshot.status === 'idle' ? 'error' : this.snapshot.status;
        this.publishSnapshot({ syncing: false, status, error: message });
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

  inviteFriend(
    friendUserId: string,
    resourceType: 'task' | 'list',
    resourceId: string,
    role?: 'editor' | 'viewer',
  ) {
    return this.executeAction({ action: 'invite', friendUserId, resourceType, resourceId, role });
  }

  private async executeAction(action: ActionPayload): Promise<void | ActionError> {
    if (!this.userId) {
      return { error: 'You must be signed in to manage friends.' };
    }

    try {
      const token = await getAccessToken();
      this.publishSnapshot({ syncing: true });
      await postAction(token, action);
      this.publishSnapshot({ syncing: false });
    } catch (error) {
      this.publishSnapshot({ syncing: false });
      const message = error instanceof Error ? error.message : 'Unable to complete that action.';
      return { error: message };
    }
  }

  private async loadCurrentUserEmail() {
    try {
      const { data } = await supabase.auth.getUser();
      this.currentUserEmail = data.user?.email ?? null;
    } catch (error) {
      console.error('Failed to load the current user profile', error);
      this.currentUserEmail = null;
    }
  }

  private subscribeToRealtime(userId: string) {
    this.cleanupRealtime();

    const channel = supabase
      .channel(`friends:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friends', filter: `user_id=eq.${userId}` }, (payload) => {
        this.handleFriendChange(payload as RealtimePostgresChangesPayload<FriendRow>);
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `requester_id=eq.${userId}` },
        (payload) => {
          this.handleFriendRequestChange(payload as RealtimePostgresChangesPayload<FriendRequestRow>);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `requested_id=eq.${userId}` },
        (payload) => {
          this.handleFriendRequestChange(payload as RealtimePostgresChangesPayload<FriendRequestRow>);
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_blocks', filter: `user_id=eq.${userId}` }, (payload) => {
        this.handleBlockedChange(payload as RealtimePostgresChangesPayload<BlockedRow>);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_codes', filter: `user_id=eq.${userId}` }, (payload) => {
        this.handleFriendCodeChange(payload as RealtimePostgresChangesPayload<FriendCodeRow>);
      });

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

  private cleanupRealtime() {
    if (!this.realtimeChannel) {
      return;
    }

    const channel = this.realtimeChannel;
    this.realtimeChannel = null;
    void channel.unsubscribe();
  }

  private handleFriendChange(payload: RealtimePostgresChangesPayload<FriendRow>) {
    const { eventType } = payload;
    const record = (payload.new as FriendRow | null) ?? (payload.old as FriendRow | null);

    if (!record || record.user_id !== this.userId) {
      return;
    }

    if (eventType === 'DELETE') {
      this.friendRecords.delete(record.id);
      this.publishSnapshot();
      return;
    }

    this.friendRecords.set(record.id, (payload.new as FriendRow) ?? record);
    void this.ensureProfiles([record.friend_id]);
    this.publishSnapshot();
  }

  private handleFriendRequestChange(payload: RealtimePostgresChangesPayload<FriendRequestRow>) {
    const { eventType } = payload;
    const record = (payload.new as FriendRequestRow | null) ?? (payload.old as FriendRequestRow | null);

    if (!record || (record.requester_id !== this.userId && record.requested_id !== this.userId)) {
      return;
    }

    if (eventType === 'DELETE') {
      this.requestRecords.delete(record.id);
      this.publishSnapshot();
      return;
    }

    this.requestRecords.set(record.id, (payload.new as FriendRequestRow) ?? record);
    void this.ensureProfiles([record.requester_id, record.requested_id]);
    this.publishSnapshot();
  }

  private handleBlockedChange(payload: RealtimePostgresChangesPayload<BlockedRow>) {
    const { eventType } = payload;
    const record = (payload.new as BlockedRow | null) ?? (payload.old as BlockedRow | null);

    if (!record || record.user_id !== this.userId) {
      return;
    }

    if (eventType === 'DELETE') {
      this.blockedRecords.delete(record.id);
      this.publishSnapshot();
      return;
    }

    this.blockedRecords.set(record.id, (payload.new as BlockedRow) ?? record);
    void this.ensureProfiles([record.blocked_user_id]);
    this.publishSnapshot();
  }

  private handleFriendCodeChange(payload: RealtimePostgresChangesPayload<FriendCodeRow>) {
    const record = (payload.new as FriendCodeRow | null) ?? (payload.old as FriendCodeRow | null);

    if (!record || record.user_id !== this.userId) {
      return;
    }

    if (payload.eventType === 'DELETE') {
      this.friendCodeValue = '';
    } else {
      this.friendCodeValue = (payload.new as FriendCodeRow | null)?.code ?? record.code ?? '';
    }

    this.publishSnapshot();
  }

  private async ensureProfiles(userIds: string[]) {
    if (!this.userId) {
      return;
    }

    const missing = userIds
      .filter((id) => id && id !== this.userId && !this.profileCache.has(id) && !this.pendingProfileLookups.has(id));

    if (!missing.length) {
      return;
    }

    missing.forEach((id) => this.pendingProfileLookups.add(id));

    try {
      const token = await getAccessToken();
      const profiles = await fetchProfiles(token, missing);
      profiles.forEach((profile, id) => {
        this.profileCache.set(id, profile);
      });
      this.publishSnapshot();
    } catch (error) {
      console.error('Failed to fetch friend profiles', error);
    } finally {
      missing.forEach((id) => this.pendingProfileLookups.delete(id));
    }
  }

  private publishSnapshot(
    patch: Partial<Omit<FriendsSnapshot, 'friends' | 'incomingRequests' | 'outgoingRequests' | 'blocked'>> = {},
  ) {
    const base: FriendsSnapshot = { ...this.snapshot, ...patch };
    const next: FriendsSnapshot = {
      ...base,
      friendCode: this.friendCodeValue || base.friendCode || '',
      friends: this.buildFriends(),
      incomingRequests: this.buildRequests('incoming'),
      outgoingRequests: this.buildRequests('outgoing'),
      blocked: this.buildBlocked(),
    };

    this.snapshot = next;
    this.subscribers.forEach((subscriber) => subscriber(this.snapshot));
  }

  private buildFriends(): Friend[] {
    const friends = Array.from(this.friendRecords.values()).map((record) => this.decorateFriend(record));
    return sortByCreatedAt(friends);
  }

  private buildRequests(direction: 'incoming' | 'outgoing'): FriendRequest[] {
    if (!this.userId) {
      return [];
    }

    const requests = Array.from(this.requestRecords.values())
      .map((record) => this.decorateFriendRequest(record))
      .filter((request) => request.status === 'pending')
      .filter((request) =>
        direction === 'incoming' ? request.requested_id === this.userId : request.requester_id === this.userId,
      );

    return sortByCreatedAt(requests);
  }

  private buildBlocked(): BlockedUser[] {
    const blocked = Array.from(this.blockedRecords.values()).map((record) => this.decorateBlocked(record));
    return sortByCreatedAt(blocked);
  }

  private decorateFriend(record: FriendRow): Friend {
    const profile = this.profileCache.get(record.friend_id);
    return {
      id: record.id,
      user_id: record.user_id,
      friend_id: record.friend_id,
      friend_email: profile?.email ?? 'Unknown user',
      friend_name: profile?.name ?? null,
      created_at: record.created_at ?? undefined,
    } satisfies Friend;
  }

  private decorateFriendRequest(record: FriendRequestRow): FriendRequest {
    const requesterProfile = record.requester_id === this.userId ? null : this.profileCache.get(record.requester_id);
    const requestedProfile = record.requested_id === this.userId ? null : this.profileCache.get(record.requested_id);

    return {
      id: record.id,
      requester_id: record.requester_id,
      requested_id: record.requested_id,
      requester_email:
        record.requester_id === this.userId
          ? this.currentUserEmail ?? 'Unknown user'
          : requesterProfile?.email ?? 'Unknown user',
      requested_email:
        record.requested_id === this.userId
          ? this.currentUserEmail ?? 'Unknown user'
          : requestedProfile?.email ?? 'Unknown user',
      status: record.status,
      message: record.message,
      created_at: record.created_at ?? undefined,
      updated_at: record.updated_at ?? undefined,
      responded_at: record.responded_at ?? undefined,
    } satisfies FriendRequest;
  }

  private decorateBlocked(record: BlockedRow): BlockedUser {
    const profile = this.profileCache.get(record.blocked_user_id);
    return {
      id: record.id,
      user_id: record.user_id,
      blocked_user_id: record.blocked_user_id,
      blocked_email: profile?.email ?? null,
      blocked_name: profile?.name ?? null,
      reason: record.reason,
      created_at: record.created_at ?? undefined,
    } satisfies BlockedUser;
  }
}
