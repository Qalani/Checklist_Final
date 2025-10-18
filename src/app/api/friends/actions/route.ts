import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError, supabaseAdmin } from '@/lib/api/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';

type ActionPayload =
  | { action: 'send_request'; targetUserId?: unknown; message?: unknown }
  | { action: 'send_request_by_code'; friendCode?: unknown; message?: unknown }
  | { action: 'respond_request'; requestId?: unknown; decision?: unknown }
  | { action: 'cancel_request'; requestId?: unknown }
  | { action: 'remove_friend'; friendUserId?: unknown }
  | { action: 'block_user'; targetUserId?: unknown; reason?: unknown }
  | { action: 'unblock_user'; targetUserId?: unknown }
  | { action: 'invite'; friendUserId?: unknown; resourceType?: unknown; resourceId?: unknown; role?: unknown };

type FriendRequestRecord = {
  id: string;
  requester_id: string;
  requested_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
};

type TaskRecord = {
  id: string;
  user_id: string;
};

type ListMembershipRecord = {
  role: string;
};

type ProfileRecord = {
  id: string;
  email: string | null;
};

type FriendCodeRecord = {
  user_id: string;
  code: string;
};

class ActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function ensureNotBlocked(client: SupabaseClient, userId: string, targetUserId: string) {
  const [blockedResult, blockedByResult] = await Promise.all([
    client.from('user_blocks').select('id').eq('user_id', userId).eq('blocked_user_id', targetUserId).maybeSingle(),
    client.from('user_blocks').select('id').eq('user_id', targetUserId).eq('blocked_user_id', userId).maybeSingle(),
  ]);

  if (blockedResult?.error) throw blockedResult.error;
  if (blockedByResult?.error) throw blockedByResult.error;

  if (blockedResult?.data) {
    throw new ActionError('You have blocked this user. Unblock them before sending a request.');
  }

  if (blockedByResult?.data) {
    throw new ActionError('This user has blocked you. You cannot send a request.');
  }
}

async function ensureFriendship(client: SupabaseClient, userId: string, friendUserId: string) {
  const { data, error } = await client
    .from('friends')
    .select('id')
    .eq('user_id', userId)
    .eq('friend_id', friendUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new ActionError('This person is not in your friends list.', 404);
  }
}

async function getFriendEmail(client: SupabaseClient, friendUserId: string) {
  const { data, error } = await client
    .schema('auth')
    .from('users')
    .select('id, email')
    .eq('id', friendUserId)
    .maybeSingle<ProfileRecord>();

  if (error) throw error;
  if (!data?.email) {
    throw new ActionError('Unable to find that user.', 404);
  }

  return data.email;
}

function normalizeFriendCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function resolveMessage(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 250);
}

async function sendFriendRequestToUser(
  client: SupabaseClient,
  userId: string,
  targetUserId: string,
  message: string | null,
) {
  if (!targetUserId) {
    throw new ActionError('A target user is required.');
  }

  if (targetUserId === userId) {
    throw new ActionError('You cannot add yourself as a friend.');
  }

  await ensureNotBlocked(client, userId, targetUserId);

  const friendLookup = await client
    .from('friends')
    .select('id')
    .eq('user_id', userId)
    .eq('friend_id', targetUserId)
    .maybeSingle();

  if (friendLookup?.error) throw friendLookup.error;
  if (friendLookup?.data) {
    throw new ActionError('You are already friends.');
  }

  const existingRequest = await client
    .from('friend_requests')
    .select('id, requester_id, requested_id, status')
    .or(
      `and(requester_id.eq.${userId},requested_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},requested_id.eq.${userId})`,
    )
    .limit(1)
    .maybeSingle<FriendRequestRecord>();

  if (existingRequest?.error && existingRequest.error.code !== 'PGRST116') {
    throw existingRequest.error;
  }

  if (existingRequest?.data && existingRequest.data.status === 'pending') {
    if (existingRequest.data.requested_id === userId) {
      throw new ActionError('This user has already sent you a request. Check your invitations.');
    }

    throw new ActionError('You already have a pending request with this user.');
  }

  const { error } = await client
    .from('friend_requests')
    .insert({
      requester_id: userId,
      requested_id: targetUserId,
      message,
      status: 'pending',
    });

  if (error) {
    throw error;
  }
}

async function handleSendRequest(client: SupabaseClient, userId: string, payload: ActionPayload) {
  if (payload.action !== 'send_request') return;
  const targetUserId = typeof payload.targetUserId === 'string' ? payload.targetUserId : '';
  const message = resolveMessage(payload.message);
  await sendFriendRequestToUser(client, userId, targetUserId, message);
}

async function findUserIdByCode(client: SupabaseClient, friendCode: string) {
  const normalized = normalizeFriendCode(friendCode);

  if (!normalized) {
    throw new ActionError('A valid friend code is required.');
  }

  const { data, error } = await client
    .from('friend_codes')
    .select('user_id, code')
    .eq('code', normalized)
    .maybeSingle<FriendCodeRecord>();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new ActionError('That friend code was not found.', 404);
  }

  return data.user_id;
}

async function handleSendRequestByCode(client: SupabaseClient, userId: string, payload: ActionPayload) {
  if (payload.action !== 'send_request_by_code') return;
  const friendCode = typeof payload.friendCode === 'string' ? payload.friendCode : '';

  if (!friendCode.trim()) {
    throw new ActionError('Enter a friend code to continue.');
  }

  const targetUserId = await findUserIdByCode(client, friendCode);
  const message = resolveMessage(payload.message);
  await sendFriendRequestToUser(client, userId, targetUserId, message);
}

async function handleRespondRequest(client: SupabaseClient, userId: string, payload: ActionPayload) {
  if (payload.action !== 'respond_request') return;
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
  const decision = typeof payload.decision === 'string' ? payload.decision : '';

  if (!requestId || !['accepted', 'declined'].includes(decision)) {
    throw new ActionError('A valid decision is required.');
  }

  const requestLookup = await client
    .from('friend_requests')
    .select('id, requester_id, requested_id, status')
    .eq('id', requestId)
    .maybeSingle<FriendRequestRecord>();

  if (requestLookup?.error) throw requestLookup.error;
  const requestRecord = requestLookup?.data;

  if (!requestRecord) {
    throw new ActionError('Friend request not found.', 404);
  }

  if (requestRecord.requested_id !== userId) {
    throw new ActionError('Only the recipient can respond to this request.', 403);
  }

  if (requestRecord.status !== 'pending') {
    throw new ActionError('This request has already been processed.');
  }

  if (decision === 'accepted') {
    await ensureNotBlocked(client, userId, requestRecord.requester_id);
  }

  const { error } = await client
    .from('friend_requests')
    .update({ status: decision })
    .eq('id', requestId);

  if (error) {
    throw error;
  }

  if (decision === 'accepted') {
    const insertResult = await client
      .from('friends')
      .upsert(
        [
          { user_id: userId, friend_id: requestRecord.requester_id },
          { user_id: requestRecord.requester_id, friend_id: userId },
        ],
        { onConflict: 'user_id,friend_id' },
      );

    if (insertResult?.error) {
      throw insertResult.error;
    }
  }
}

async function handleCancelRequest(client: SupabaseClient, userId: string, payload: ActionPayload) {
  if (payload.action !== 'cancel_request') return;
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';

  if (!requestId) {
    throw new ActionError('A request id is required.');
  }

  const requestLookup = await client
    .from('friend_requests')
    .select('id, requester_id, status')
    .eq('id', requestId)
    .maybeSingle<FriendRequestRecord>();

  if (requestLookup?.error) throw requestLookup.error;

  if (!requestLookup?.data || requestLookup.data.requester_id !== userId) {
    throw new ActionError('You can only cancel requests you sent.', 403);
  }

  if (requestLookup.data.status !== 'pending') {
    throw new ActionError('This request has already been processed.');
  }

  const { error } = await client
    .from('friend_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId);

  if (error) {
    throw error;
  }
}

async function handleRemoveFriend(client: SupabaseClient, userId: string, payload: ActionPayload) {
  if (payload.action !== 'remove_friend') return;
  const friendUserId = typeof payload.friendUserId === 'string' ? payload.friendUserId : '';

  if (!friendUserId) {
    throw new ActionError('A friend id is required.');
  }

  const { error } = await client
    .from('friends')
    .delete()
    .or(`and(user_id.eq.${userId},friend_id.eq.${friendUserId}),and(user_id.eq.${friendUserId},friend_id.eq.${userId}))`);

  if (error) {
    throw error;
  }
}

async function handleBlockUser(client: SupabaseClient, userId: string, payload: ActionPayload) {
  if (payload.action !== 'block_user') return;
  const targetUserId = typeof payload.targetUserId === 'string' ? payload.targetUserId : '';

  if (!targetUserId) {
    throw new ActionError('A user id to block is required.');
  }

  if (targetUserId === userId) {
    throw new ActionError('You cannot block yourself.');
  }

  const reason =
    typeof payload.reason === 'string' && payload.reason.trim().length > 0
      ? payload.reason.trim().slice(0, 250)
      : null;

  const { error } = await client
    .from('user_blocks')
    .upsert(
      { user_id: userId, blocked_user_id: targetUserId, reason },
      { onConflict: 'user_id,blocked_user_id' },
    );

  if (error) {
    throw error;
  }

  await client
    .from('friends')
    .delete()
    .or(`and(user_id.eq.${userId},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${userId}))`);

  await client
    .from('friend_requests')
    .update({ status: 'cancelled' })
    .or(`and(requester_id.eq.${userId},requested_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},requested_id.eq.${userId}))`)
    .eq('status', 'pending');
}

async function handleUnblockUser(client: SupabaseClient, userId: string, payload: ActionPayload) {
  if (payload.action !== 'unblock_user') return;
  const targetUserId = typeof payload.targetUserId === 'string' ? payload.targetUserId : '';

  if (!targetUserId) {
    throw new ActionError('A user id to unblock is required.');
  }

  const { error } = await client
    .from('user_blocks')
    .delete()
    .eq('user_id', userId)
    .eq('blocked_user_id', targetUserId);

  if (error) {
    throw error;
  }
}

async function handleInvite(client: SupabaseClient, userId: string, payload: ActionPayload) {
  if (payload.action !== 'invite') return;
  const friendUserId = typeof payload.friendUserId === 'string' ? payload.friendUserId : '';
  const resourceType = payload.resourceType === 'task' || payload.resourceType === 'list' ? payload.resourceType : '';
  const resourceId = typeof payload.resourceId === 'string' ? payload.resourceId : '';
  const role = payload.role === 'viewer' ? 'viewer' : 'editor';

  if (!friendUserId || !resourceType || !resourceId) {
    throw new ActionError('Incomplete collaboration payload.');
  }

  await ensureFriendship(client, userId, friendUserId);

  if (resourceType === 'list') {
    const friendEmail = await getFriendEmail(client, friendUserId);

    const ownerLookup = await client
      .from('list_members')
      .select('role')
      .eq('list_id', resourceId)
      .eq('user_id', userId)
      .maybeSingle<ListMembershipRecord>();

    if (ownerLookup?.error) throw ownerLookup.error;
    if (!ownerLookup?.data || ownerLookup.data.role !== 'owner') {
      throw new ActionError('Only list owners can share lists.', 403);
    }

    const { error } = await client.rpc('invite_list_member', {
      list_uuid: resourceId,
      invitee_email: friendEmail,
      desired_role: role,
    });

    if (error) {
      throw error;
    }

    return;
  }

  const taskLookup = await client
    .from('tasks')
    .select('id, user_id')
    .eq('id', resourceId)
    .maybeSingle<TaskRecord>();

  if (taskLookup?.error) throw taskLookup.error;

  if (!taskLookup?.data || taskLookup.data.user_id !== userId) {
    throw new ActionError('Only the task owner can invite collaborators.', 403);
  }

  const { error } = await client
    .from('task_collaborators')
    .upsert(
      { task_id: resourceId, user_id: friendUserId, role },
      { onConflict: 'task_id,user_id' },
    );

  if (error) {
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await authenticateRequest(request);

    if (!supabaseAdmin) {
      throw new AuthError('Supabase is not configured on the server.', 500);
    }

    const client = supabaseAdmin;

    let body: ActionPayload;
    try {
      body = (await request.json()) as ActionPayload;
    } catch {
      throw new ActionError('Invalid JSON body.');
    }

    if (!body || typeof body !== 'object' || !('action' in body)) {
      throw new ActionError('A valid action is required.');
    }

    switch (body.action) {
      case 'send_request':
        await handleSendRequest(client, user.id, body);
        break;
      case 'send_request_by_code':
        await handleSendRequestByCode(client, user.id, body);
        break;
      case 'respond_request':
        await handleRespondRequest(client, user.id, body);
        break;
      case 'cancel_request':
        await handleCancelRequest(client, user.id, body);
        break;
      case 'remove_friend':
        await handleRemoveFriend(client, user.id, body);
        break;
      case 'block_user':
        await handleBlockUser(client, user.id, body);
        break;
      case 'unblock_user':
        await handleUnblockUser(client, user.id, body);
        break;
      case 'invite':
        await handleInvite(client, user.id, body);
        break;
      default:
        throw new ActionError('Unsupported action.');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof ActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Failed to process friend action', error);
    return NextResponse.json({ error: 'Unable to process the request.' }, { status: 500 });
  }
}
