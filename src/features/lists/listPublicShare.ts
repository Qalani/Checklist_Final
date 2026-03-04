import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/local-db';
import { enqueue } from '@/lib/sync-queue';
import { isOnline } from '@/lib/network-status';
import { extractErrorMessage } from '@/utils/extract-error-message';
import type { List } from '@/types';
import type { ErrorResult, ListsState } from './listTypes';

export async function enablePublicShare(
  listId: string,
  userId: string,
  listsRef: MutableRefObject<List[]>,
  setState: Dispatch<SetStateAction<ListsState>>,
): Promise<{ token: string } | ErrorResult> {
  if (!userId) {
    return { error: 'You must be signed in to manage public sharing.' };
  }

  const existing = listsRef.current.find(list => list.id === listId);
  if (!existing) {
    return { error: 'List not found.' };
  }

  if (existing.access_role !== 'owner') {
    return { error: 'Only owners can enable public sharing.' };
  }

  try {
    const { data, error } = await supabase.rpc('enable_list_public_share', {
      list_uuid: listId,
    });

    if (error) {
      throw new Error(error.message || 'Unable to enable public sharing.');
    }

    const share = data as { token?: string | null } | null;
    const token = share?.token ?? null;

    if (!token) {
      throw new Error('Public share token was not returned.');
    }

    setState(prev => ({
      ...prev,
      lists: prev.lists.map(list =>
        list.id === listId
          ? { ...list, public_share_token: token, public_share_enabled: true }
          : list,
      ),
    }));

    return { token };
  } catch (error) {
    return { error: extractErrorMessage(error, 'Unable to enable public sharing.') };
  }
}

export async function rotatePublicShare(
  listId: string,
  userId: string,
  listsRef: MutableRefObject<List[]>,
  setState: Dispatch<SetStateAction<ListsState>>,
): Promise<{ token: string } | ErrorResult> {
  if (!userId) {
    return { error: 'You must be signed in to rotate public sharing.' };
  }

  const existing = listsRef.current.find(list => list.id === listId);
  if (!existing) {
    return { error: 'List not found.' };
  }

  if (existing.access_role !== 'owner') {
    return { error: 'Only owners can rotate public sharing.' };
  }

  if (!existing.public_share_enabled || !existing.public_share_token) {
    return { error: 'Public sharing is not enabled for this list.' };
  }

  try {
    const { data, error } = await supabase.rpc('rotate_list_public_share', {
      list_uuid: listId,
    });

    if (error) {
      throw new Error(error.message || 'Unable to refresh the share link.');
    }

    const share = data as { token?: string | null } | null;
    const token = share?.token ?? null;

    if (!token) {
      throw new Error('Public share token was not returned.');
    }

    setState(prev => ({
      ...prev,
      lists: prev.lists.map(list =>
        list.id === listId
          ? { ...list, public_share_token: token, public_share_enabled: true }
          : list,
      ),
    }));

    return { token };
  } catch (error) {
    return { error: extractErrorMessage(error, 'Unable to refresh the share link.') };
  }
}

export async function disablePublicShare(
  listId: string,
  userId: string,
  listsRef: MutableRefObject<List[]>,
  setState: Dispatch<SetStateAction<ListsState>>,
): Promise<void | ErrorResult> {
  if (!userId) {
    return { error: 'You must be signed in to disable public sharing.' };
  }

  const existing = listsRef.current.find(list => list.id === listId);
  if (!existing) {
    return { error: 'List not found.' };
  }

  if (existing.access_role !== 'owner') {
    return { error: 'Only owners can disable public sharing.' };
  }

  try {
    const { error } = await supabase.rpc('disable_list_public_share', {
      list_uuid: listId,
    });

    if (error) {
      throw new Error(error.message || 'Unable to disable public sharing.');
    }

    setState(prev => ({
      ...prev,
      lists: prev.lists.map(list =>
        list.id === listId
          ? { ...list, public_share_token: null, public_share_enabled: false }
          : list,
      ),
    }));
  } catch (error) {
    return { error: extractErrorMessage(error, 'Unable to disable public sharing.') };
  }
}

export async function archiveList(
  id: string,
  userId: string,
  listsRef: MutableRefObject<List[]>,
  setState: Dispatch<SetStateAction<ListsState>>,
): Promise<void | ErrorResult> {
  if (!userId) return { error: 'You must be signed in to archive lists.' };
  const existing = listsRef.current.find(l => l.id === id);
  if (!existing) return { error: 'List not found.' };
  if (existing.access_role !== 'owner') return { error: 'Only owners can archive a list.' };

  if (!isOnline()) {
    const updated: List = { ...existing, archived: true };
    await db.lists.put(updated);
    await enqueue({ table_name: 'lists', operation: 'UPDATE', payload: { id, archived: true } });
    setState(prev => ({ ...prev, lists: prev.lists.map(l => l.id === id ? { ...l, archived: true } : l) }));
    return;
  }
  try {
    const { error } = await supabase.from('lists').update({ archived: true }).eq('id', id);
    if (error) throw new Error(error.message || 'Unable to archive list.');
    setState(prev => ({ ...prev, lists: prev.lists.map(l => l.id === id ? { ...l, archived: true } : l) }));
  } catch (error) {
    return { error: extractErrorMessage(error, 'Unable to archive list.') };
  }
}

export async function unarchiveList(
  id: string,
  userId: string,
  listsRef: MutableRefObject<List[]>,
  setState: Dispatch<SetStateAction<ListsState>>,
): Promise<void | ErrorResult> {
  if (!userId) return { error: 'You must be signed in to unarchive lists.' };
  const existing = listsRef.current.find(l => l.id === id);
  if (!existing) return { error: 'List not found.' };
  if (existing.access_role !== 'owner') return { error: 'Only owners can unarchive a list.' };

  if (!isOnline()) {
    const updated: List = { ...existing, archived: false };
    await db.lists.put(updated);
    await enqueue({ table_name: 'lists', operation: 'UPDATE', payload: { id, archived: false } });
    setState(prev => ({ ...prev, lists: prev.lists.map(l => l.id === id ? { ...l, archived: false } : l) }));
    return;
  }
  try {
    const { error } = await supabase.from('lists').update({ archived: false }).eq('id', id);
    if (error) throw new Error(error.message || 'Unable to unarchive list.');
    setState(prev => ({ ...prev, lists: prev.lists.map(l => l.id === id ? { ...l, archived: false } : l) }));
  } catch (error) {
    return { error: extractErrorMessage(error, 'Unable to unarchive list.') };
  }
}
