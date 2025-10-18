import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError, supabaseAdmin } from '@/lib/api/supabase-admin';
import type { BlockedUser, Friend, FriendRequest } from '@/types';
import {
  ensureFriendCodeForUser,
  fetchProfileSummaries,
  type ProfileSummary,
} from './shared';

type RawFriend = {
  id: string;
  user_id: string;
  friend_id: string;
  created_at: string | null;
};

type RawFriendRequest = {
  id: string;
  requester_id: string;
  requested_id: string;
  message: string | null;
  status: FriendRequest['status'];
  created_at: string | null;
  updated_at: string | null;
  responded_at: string | null;
};

type RawBlocked = {
  id: string;
  user_id: string;
  blocked_user_id: string;
  reason: string | null;
  created_at: string | null;
};

export async function GET(request: Request) {
  try {
    const { user } = await authenticateRequest(request);

    if (!supabaseAdmin) {
      throw new AuthError('Supabase is not configured on the server.', 500);
    }

    const userId = user.id;

    const [friendsResult, requestsResult, blocksResult] = await Promise.all([
      supabaseAdmin
        .from('friends')
        .select('id, user_id, friend_id, created_at')
        .eq('user_id', userId)
        .returns<RawFriend[]>(),
      supabaseAdmin
        .from('friend_requests')
        .select('id, requester_id, requested_id, message, status, created_at, updated_at, responded_at')
        .or(`requester_id.eq.${userId},requested_id.eq.${userId}`)
        .returns<RawFriendRequest[]>(),
      supabaseAdmin
        .from('user_blocks')
        .select('id, user_id, blocked_user_id, reason, created_at')
        .eq('user_id', userId)
        .returns<RawBlocked[]>(),
    ]);

    if (friendsResult.error) {
      throw friendsResult.error;
    }

    if (requestsResult.error) {
      throw requestsResult.error;
    }

    if (blocksResult.error) {
      throw blocksResult.error;
    }

    const friends = friendsResult.data ?? [];
    const requests = requestsResult.data ?? [];
    const blocks = blocksResult.data ?? [];

    const relatedUserIds = new Set<string>();
    friends.forEach((record) => relatedUserIds.add(record.friend_id));
    requests.forEach((record) => {
      relatedUserIds.add(record.requester_id);
      relatedUserIds.add(record.requested_id);
    });
    blocks.forEach((record) => relatedUserIds.add(record.blocked_user_id));

    relatedUserIds.delete(userId);

    let profileMap = new Map<string, ProfileSummary>();

    if (relatedUserIds.size > 0) {
      const profiles = await fetchProfileSummaries(Array.from(relatedUserIds));
      profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    }

    const friendsPayload: Friend[] = friends.map((record) => {
      const profile = profileMap.get(record.friend_id);
      return {
        id: record.id,
        user_id: record.user_id,
        friend_id: record.friend_id,
        friend_email: profile?.email ?? 'Unknown user',
        friend_name: profile?.name ?? null,
        created_at: record.created_at ?? undefined,
      } satisfies Friend;
    });

    const friendRequests: FriendRequest[] = requests.map((record) => {
      const requesterProfile = profileMap.get(record.requester_id);
      const requestedProfile = profileMap.get(record.requested_id);
      return {
        id: record.id,
        requester_id: record.requester_id,
        requested_id: record.requested_id,
        requester_email: record.requester_id === userId ? user.email : requesterProfile?.email ?? null,
        requested_email: record.requested_id === userId ? user.email : requestedProfile?.email ?? null,
        status: record.status,
        message: record.message,
        created_at: record.created_at ?? undefined,
        updated_at: record.updated_at ?? undefined,
        responded_at: record.responded_at ?? undefined,
      } satisfies FriendRequest;
    });

    const incomingRequests = friendRequests.filter(
      (request) => request.requested_id === userId && request.status === 'pending',
    );
    const outgoingRequests = friendRequests.filter(
      (request) => request.requester_id === userId && request.status === 'pending',
    );

    const blockedUsers: BlockedUser[] = blocks.map((record) => {
      const profile = profileMap.get(record.blocked_user_id);
      return {
        id: record.id,
        user_id: record.user_id,
        blocked_user_id: record.blocked_user_id,
        blocked_email: profile?.email ?? null,
        blocked_name: profile?.name ?? null,
        reason: record.reason,
        created_at: record.created_at ?? undefined,
      } satisfies BlockedUser;
    });

    let friendCode = '';
    try {
      friendCode = await ensureFriendCodeForUser(userId);
    } catch (friendCodeError) {
      console.error('Failed to ensure friend code for user', userId, friendCodeError);
      try {
        const { data, error } = await supabaseAdmin
          .from('friend_codes')
          .select('code')
          .eq('user_id', userId)
          .maybeSingle<{ code: string }>();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        friendCode = data?.code ?? '';
      } catch (fallbackError) {
        console.error('Unable to recover existing friend code for user', userId, fallbackError);
      }
    }

    return NextResponse.json({
      friends: friendsPayload,
      incomingRequests,
      outgoingRequests,
      blocked: blockedUsers,
      friendCode,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Failed to load friend data', error);
    return NextResponse.json({ error: 'Unable to load friend data.' }, { status: 500 });
  }
}
