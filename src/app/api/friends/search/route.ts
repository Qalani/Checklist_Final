import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError, supabaseAdmin } from '@/lib/api/supabase-admin';
import type { FriendSearchResult } from '@/types';

type ProfileRecord = {
  id: string;
  email: string | null;
  raw_user_meta_data: Record<string, unknown> | null;
};

function resolveDisplayName(profile: ProfileRecord | undefined): string | null {
  if (!profile) return null;
  const metadata = profile.raw_user_meta_data ?? {};
  if (metadata && typeof metadata === 'object') {
    const fullName = (metadata as { full_name?: unknown }).full_name;
    if (typeof fullName === 'string' && fullName.trim()) {
      return fullName;
    }

    const name = (metadata as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) {
      return name;
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const { user } = await authenticateRequest(request);

    if (!supabaseAdmin) {
      throw new AuthError('Supabase is not configured on the server.', 500);
    }

    const url = new URL(request.url);
    const query = url.searchParams.get('query')?.trim() ?? '';

    if (!query) {
      return NextResponse.json({ results: [] as FriendSearchResult[] });
    }

    const [profilesResult, friendsResult, outgoingInvitesResult, incomingInvitesResult, blockedResult, blockedByResult] =
      await Promise.all([
        supabaseAdmin.rpc('friends_search_auth_users', {
          search_term: query,
          limit_count: 20,
        }),
        supabaseAdmin
          .from('friends')
          .select('friend_id')
          .eq('user_id', user.id),
        supabaseAdmin
        .from('friend_invites')
        .select('sender_id, receiver_id')
        .eq('sender_id', user.id),
        supabaseAdmin
        .from('friend_invites')
        .select('sender_id, receiver_id')
        .eq('receiver_id', user.id),
        supabaseAdmin
          .from('user_blocks')
          .select('blocked_user_id')
          .eq('user_id', user.id),
        supabaseAdmin
          .from('user_blocks')
          .select('user_id')
          .eq('blocked_user_id', user.id),
      ]);

    if (profilesResult.error) throw profilesResult.error;
    if (friendsResult.error) throw friendsResult.error;
    if (outgoingInvitesResult.error) throw outgoingInvitesResult.error;
    if (incomingInvitesResult.error) throw incomingInvitesResult.error;
    if (blockedResult.error) throw blockedResult.error;
    if (blockedByResult.error) throw blockedByResult.error;

    const profileRows = Array.isArray(profilesResult.data) ? profilesResult.data : [];

    const profiles = profileRows.filter((profile) => profile.id !== user.id);

    const friendSet = new Set<string>((friendsResult.data ?? []).map((record) => record.friend_id as string));

    const outgoingInvites = new Set<string>((outgoingInvitesResult.data ?? []).map((record) => record.receiver_id as string));
    const incomingInvites = new Set<string>((incomingInvitesResult.data ?? []).map((record) => record.sender_id as string));

    const blockedSet = new Set<string>((blockedResult.data ?? []).map((record) => record.blocked_user_id as string));
    const blockedBySet = new Set<string>((blockedByResult.data ?? []).map((record) => record.user_id as string));

    const results: FriendSearchResult[] = profiles.map((profile) => ({
      user_id: profile.id,
      email: profile.email ?? 'Unknown user',
      name: resolveDisplayName(profile),
      is_friend: friendSet.has(profile.id),
      has_pending_request: outgoingInvites.has(profile.id) || incomingInvites.has(profile.id),
      incoming_request: incomingInvites.has(profile.id),
      is_blocked: blockedSet.has(profile.id) || blockedBySet.has(profile.id),
    }));

    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Failed to search friends', error);
    return NextResponse.json({ error: 'Unable to search for friends.' }, { status: 500 });
  }
}
