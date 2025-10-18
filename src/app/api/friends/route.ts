import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError, supabaseAdmin } from '@/lib/api/supabase-admin';
import type { BlockedUser, Friend, FriendInvite } from '@/types';
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

type RawFriendInvite = {
  id: string;
  sender_id: string;
  receiver_id: string;
  request_code: string;
  created_at: string | null;
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

    const [friendsResult, invitesResult, blocksResult] = await Promise.all([
      supabaseAdmin
        .from('friends')
        .select('id, user_id, friend_id, created_at')
        .eq('user_id', userId)
        .returns<RawFriend[]>(),
      supabaseAdmin
        .from('friend_invites')
        .select('id, sender_id, receiver_id, request_code, created_at')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .returns<RawFriendInvite[]>(),
      supabaseAdmin
        .from('user_blocks')
        .select('id, user_id, blocked_user_id, reason, created_at')
        .eq('user_id', userId)
        .returns<RawBlocked[]>(),
    ]);

    if (friendsResult.error) {
      throw friendsResult.error;
    }

    if (invitesResult.error) {
      throw invitesResult.error;
    }

    if (blocksResult.error) {
      throw blocksResult.error;
    }

    const friends = friendsResult.data ?? [];
    const invites = invitesResult.data ?? [];
    const blocks = blocksResult.data ?? [];

    const relatedUserIds = new Set<string>();
    friends.forEach((record) => relatedUserIds.add(record.friend_id));
    invites.forEach((record) => {
      relatedUserIds.add(record.sender_id);
      relatedUserIds.add(record.receiver_id);
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

    const friendInvites: FriendInvite[] = invites.map((record) => {
      const senderProfile = profileMap.get(record.sender_id);
      const receiverProfile = profileMap.get(record.receiver_id);
      return {
        id: record.id,
        sender_id: record.sender_id,
        receiver_id: record.receiver_id,
        sender_email: record.sender_id === userId ? user.email : senderProfile?.email ?? null,
        receiver_email: record.receiver_id === userId ? user.email : receiverProfile?.email ?? null,
        request_code: record.request_code,
        created_at: record.created_at ?? undefined,
      } satisfies FriendInvite;
    });

    const incomingInvites = friendInvites.filter((invite) => invite.receiver_id === userId);
    const outgoingInvites = friendInvites.filter((invite) => invite.sender_id === userId);

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
      incomingInvites,
      outgoingInvites,
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
