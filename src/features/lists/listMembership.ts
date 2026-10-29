import { supabase } from '@/lib/supabase';
import { db } from '@/lib/local-db';
import { cacheRows, cacheDelete } from '@/lib/offline-cache';
import { getSyncUser } from '@/lib/sync-session';
import { isOnline } from '@/lib/network-status';
import { extractErrorMessage } from '@/utils/extract-error-message';
import type { ListMember } from '@/types';
import type { LoadMembersSuccess, ErrorResult, ListMemberRole } from './listTypes';

const OFFLINE_ERROR = 'You’re offline. Reconnect to manage list members.';

export async function loadMembers(listId: string): Promise<LoadMembersSuccess | ErrorResult> {
  if (!isOnline()) {
    // Best-effort offline read so the sharing dialog can render what the
    // device already knows. Mutations still require connectivity.
    try {
      const userId = getSyncUser();
      if (!userId) return { error: 'Sign in before viewing saved list members.' };
      const [list, scope, cached] = await Promise.all([
        db.lists.get(listId),
        db.cache_scopes.get(`${userId}:lists`),
        db.list_members.where('list_id').equals(listId).toArray(),
      ]);
      if (list?.user_id !== userId && !scope?.row_ids.includes(listId) && !cached.some(member => member.user_id === userId)) {
        return { error: 'This list is not available offline for this account.' };
      }
      return { members: cached as ListMember[] };
    } catch {
      return { members: [] };
    }
  }

  try {
    const { data, error } = await supabase
      .from('list_members')
      .select('id, list_id, user_id, user_email, role, created_at')
      .eq('list_id', listId)
      .order('role', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message || 'Unable to load members.');
    }

    await cacheRows('list_members', (data ?? []) as Record<string, unknown>[]);
    return { members: (data ?? []) as ListMember[] };
  } catch (error) {
    return { error: extractErrorMessage(error, 'Unable to load members.') };
  }
}

export async function inviteMember(
  listId: string,
  email: string,
  role: ListMemberRole,
): Promise<{ member: ListMember } | ErrorResult> {
  if (!email.trim()) {
    return { error: 'Enter an email address to invite.' };
  }

  if (!isOnline()) {
    return { error: OFFLINE_ERROR };
  }

  try {
    const { data, error } = await supabase.rpc('invite_list_member', {
      list_uuid: listId,
      invitee_email: email.trim(),
      desired_role: role,
    });

    if (error) {
      throw new Error(error.message || 'Unable to invite collaborator.');
    }

    const member = data as ListMember | null;
    if (!member) {
      throw new Error('Invite did not return the new member.');
    }

    await cacheRows('list_members', [member as unknown as Record<string, unknown>]);
    return { member };
  } catch (error) {
    return { error: extractErrorMessage(error, 'Unable to invite collaborator.') };
  }
}

export async function updateMemberRole(
  memberId: string,
  role: ListMemberRole,
): Promise<{ member: ListMember } | ErrorResult> {
  if (!isOnline()) {
    return { error: OFFLINE_ERROR };
  }
  try {
    const { data, error } = await supabase
      .from('list_members')
      .update({ role })
      .eq('id', memberId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message || 'Unable to update member.');
    }

    await cacheRows('list_members', [data as Record<string, unknown>]);
    return { member: data as ListMember };
  } catch (error) {
    return { error: extractErrorMessage(error, 'Unable to update member.') };
  }
}

export async function removeMember(memberId: string): Promise<void | ErrorResult> {
  if (!isOnline()) {
    return { error: OFFLINE_ERROR };
  }
  try {
    const { error } = await supabase
      .from('list_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      throw new Error(error.message || 'Unable to remove member.');
    }
    await cacheDelete('list_members', memberId);
  } catch (error) {
    return { error: extractErrorMessage(error, 'Unable to remove member.') };
  }
}
