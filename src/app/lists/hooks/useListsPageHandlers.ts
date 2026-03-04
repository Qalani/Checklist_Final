import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { List, ListMember } from '@/types';
import type { UseListsResult } from '@/features/lists/useLists';

type MemberRole = ListMember['role'];

type FormState = {
  name: string;
  description: string;
};

const INITIAL_FORM: FormState = {
  name: '',
  description: '',
};

function orderMembers(members: ListMember[]): ListMember[] {
  const rolePriority: Record<MemberRole, number> = {
    owner: 0,
    editor: 1,
    viewer: 2,
  };

  return [...members].sort((a, b) => {
    const roleComparison = (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99);
    if (roleComparison !== 0) {
      return roleComparison;
    }
    return (a.user_email ?? '').localeCompare(b.user_email ?? '');
  });
}

function resolveRole(list: List): MemberRole {
  return list.access_role ?? 'owner';
}

function isErrorResult(result: unknown): result is { error: string } {
  return Boolean(result && typeof result === 'object' && 'error' in (result as Record<string, unknown>));
}

interface UseListsPageHandlersParams {
  lists: UseListsResult['lists'];
  createList: UseListsResult['createList'];
  updateList: UseListsResult['updateList'];
  deleteList: UseListsResult['deleteList'];
  createListItem: UseListsResult['createListItem'];
  updateListItem: UseListsResult['updateListItem'];
  deleteListItem: UseListsResult['deleteListItem'];
  reorderListItems: UseListsResult['reorderListItems'];
  loadMembers: UseListsResult['loadMembers'];
  inviteMember: UseListsResult['inviteMember'];
  updateMemberRole: UseListsResult['updateMemberRole'];
  removeMember: UseListsResult['removeMember'];
  enablePublicShare: UseListsResult['enablePublicShare'];
  rotatePublicShare: UseListsResult['rotatePublicShare'];
  disablePublicShare: UseListsResult['disablePublicShare'];
  archiveList: UseListsResult['archiveList'];
  unarchiveList: UseListsResult['unarchiveList'];
  userId: string | undefined;
  formState: FormState;
  setFormState: Dispatch<SetStateAction<FormState>>;
  editingList: List | null;
  setEditingList: Dispatch<SetStateAction<List | null>>;
  setInlineEditingListId: Dispatch<SetStateAction<string | null>>;
  setShowForm: Dispatch<SetStateAction<boolean>>;
  setFormError: Dispatch<SetStateAction<string | null>>;
  setSubmitting: Dispatch<SetStateAction<boolean>>;
  submitting: boolean;
  setEditingItemsListId: Dispatch<SetStateAction<string | null>>;
  newListItems: List['items'];
  setNewListItems: Dispatch<SetStateAction<List['items']>>;
  sharingList: List | null;
  setSharingList: Dispatch<SetStateAction<List | null>>;
  setMembers: Dispatch<SetStateAction<ListMember[]>>;
  setMembersLoading: Dispatch<SetStateAction<boolean>>;
  setMemberError: Dispatch<SetStateAction<string | null>>;
  setInviteFriendId: Dispatch<SetStateAction<string>>;
  setInviteRole: Dispatch<SetStateAction<MemberRole>>;
  setMemberSubmitting: Dispatch<SetStateAction<boolean>>;
  setMemberActionId: Dispatch<SetStateAction<string | null>>;
  setShareActionError: Dispatch<SetStateAction<string | null>>;
  setShareSubmitting: Dispatch<SetStateAction<boolean>>;
  setShareLinkCopied: Dispatch<SetStateAction<boolean>>;
  setListActionMessage: Dispatch<SetStateAction<{ type: 'success' | 'error'; text: string } | null>>;
  setItemActionErrors: Dispatch<SetStateAction<Record<string, string | null>>>;
  inviteFriendId: string;
  inviteRole: MemberRole;
  availableFriends: Array<{ friend_id: string; friend_email: string; friend_name?: string | null }>;
  friends: Array<{ friend_id: string; friend_email: string; friend_name?: string | null }>;
  shareUrl: string;
  shareCopyTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function useListsPageHandlers({
  lists,
  createList,
  updateList,
  deleteList,
  createListItem,
  updateListItem,
  deleteListItem,
  reorderListItems,
  loadMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  enablePublicShare,
  rotatePublicShare,
  disablePublicShare,
  archiveList,
  unarchiveList,
  userId,
  formState,
  setFormState,
  editingList,
  setEditingList,
  setInlineEditingListId,
  setShowForm,
  setFormError,
  setSubmitting,
  submitting,
  setEditingItemsListId,
  newListItems,
  setNewListItems,
  sharingList,
  setSharingList,
  setMembers,
  setMembersLoading,
  setMemberError,
  setInviteFriendId,
  setInviteRole,
  setMemberSubmitting,
  setMemberActionId,
  setShareActionError,
  setShareSubmitting,
  setShareLinkCopied,
  setListActionMessage,
  setItemActionErrors,
  inviteFriendId,
  inviteRole,
  availableFriends,
  friends,
  shareUrl,
  shareCopyTimeoutRef,
}: UseListsPageHandlersParams) {
  const setListItemError = (listId: string, message: string | null) => {
    setItemActionErrors(prev => {
      if (prev[listId] === message) {
        return prev;
      }
      return { ...prev, [listId]: message };
    });
  };

  const handleOpenCreate = () => {
    setEditingList(null);
    setInlineEditingListId(null);
    setFormState(INITIAL_FORM);
    setEditingItemsListId(null);
    setFormError(null);
    setNewListItems([]);
    setShowForm(true);
  };

  const handleOpenEdit = (list: List) => {
    const role = resolveRole(list);
    if (!['owner', 'editor'].includes(role)) {
      setFormError('You can only edit lists that you own or have editor access to.');
      return;
    }

    setEditingList(list);
    setInlineEditingListId(list.id);
    setEditingItemsListId(list.id);
    setFormState({
      name: list.name,
      description: list.description ?? '',
    });
    setFormError(null);
    setNewListItems([]);
    setShowForm(false);
  };

  const addNewListItem = async () => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `temp-${Date.now()}-${Math.random()}`;
    setNewListItems(prev => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next.push({
        id,
        list_id: 'new',
        content: '',
        completed: false,
        position: next.length,
      });
      return next;
    });
    return id;
  };

  const updateNewListItemContent = async (itemId: string, content: string) => {
    setNewListItems(prev =>
      (Array.isArray(prev) ? prev : []).map(item =>
        item.id === itemId ? { ...item, content: content.trim() } : item,
      ),
    );
  };

  const toggleNewListItem = async (itemId: string, completed: boolean) => {
    setNewListItems(prev =>
      (Array.isArray(prev) ? prev : []).map(item => (item.id === itemId ? { ...item, completed } : item)),
    );
  };

  const deleteNewListItem = async (itemId: string) => {
    setNewListItems(prev => {
      const remaining = (Array.isArray(prev) ? prev : []).filter(item => item.id !== itemId);
      return remaining.map((item, index) => ({ ...item, position: index }));
    });
  };

  const reorderNewListItems = async (orderedIds: string[]) => {
    setNewListItems(prev => {
      const current = Array.isArray(prev) ? prev : [];
      const map = new Map(current.map(item => [item.id, item] as const));
      const ordered: NonNullable<List['items']> = [];

      for (const [index, id] of orderedIds.entries()) {
        const item = map.get(id);
        if (!item) {
          return current;
        }
        ordered.push({ ...item, position: index });
      }

      return ordered;
    });
  };

  const handleSubmit = async () => {
    if (!formState.name.trim()) {
      setFormError('Give your list a name so it is easy to recognise.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload = {
      name: formState.name.trim(),
      description: formState.description.trim(),
      items:
        editingList === null
          ? (Array.isArray(newListItems) ? newListItems : [])
              .slice()
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .map(item => ({
                content: item.content.trim(),
                completed: item.completed,
                position: item.position ?? 0,
              }))
          : undefined,
    };

    if (editingList) {
      const result = await updateList(editingList.id, payload);
      if (result && 'error' in result && result.error) {
        setFormError(result.error);
        setSubmitting(false);
        return;
      }

      setInlineEditingListId(null);
      setEditingList(null);
      setFormState(INITIAL_FORM);
      setEditingItemsListId(null);
    } else {
      const result = await createList(payload);
      if (result && 'error' in result && result.error) {
        setFormError(result.error);
        setSubmitting(false);
        return;
      }

      setShowForm(false);
      setFormState(INITIAL_FORM);
      setEditingItemsListId(null);
      setNewListItems([]);
    }

    setSubmitting(false);
  };

  const handleCancelInlineEdit = () => {
    setInlineEditingListId(null);
    setEditingList(null);
    setFormState(INITIAL_FORM);
    setFormError(null);
    setSubmitting(false);
    setEditingItemsListId(null);
  };

  const handleDelete = async (list: List) => {
    const role = resolveRole(list);
    if (role !== 'owner') {
      setFormError('Only owners can delete a list.');
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete "${list.name}"? This cannot be undone.`);
      if (!confirmed) {
        return;
      }
    }

    const result = await deleteList(list.id);
    if (result && 'error' in result && result.error) {
      setFormError(result.error);
    }
  };

  const handleArchive = async (list: List) => {
    const result = await archiveList(list.id);
    if (result && 'error' in result) {
      setListActionMessage({ type: 'error', text: result.error });
    } else {
      setListActionMessage({ type: 'success', text: `"${list.name}" archived.` });
      setTimeout(() => setListActionMessage(null), 3000);
    }
  };

  const handleUnarchive = async (list: List) => {
    const result = await unarchiveList(list.id);
    if (result && 'error' in result) {
      setListActionMessage({ type: 'error', text: result.error });
    } else {
      setListActionMessage({ type: 'success', text: `"${list.name}" restored.` });
      setTimeout(() => setListActionMessage(null), 3000);
    }
  };

  const handleCloseShare = () => {
    setSharingList(null);
    setMembers([]);
    setMemberError(null);
    setInviteFriendId('');
    setInviteRole('viewer');
    setMemberSubmitting(false);
    setMemberActionId(null);
    setShareActionError(null);
    setShareLinkCopied(false);
    setShareSubmitting(false);
    if (shareCopyTimeoutRef.current) {
      clearTimeout(shareCopyTimeoutRef.current);
      shareCopyTimeoutRef.current = null;
    }
  };

  const handleOpenShare = async (list: List) => {
    setSharingList(list);
    setMembers([]);
    setInviteFriendId('');
    setInviteRole('viewer');
    setMemberError(null);
    setShareActionError(null);
    setShareLinkCopied(false);
    setMembersLoading(true);

    const result = await loadMembers(list.id);
    if ('error' in result) {
      setMemberError(result.error);
      setMembers([]);
    } else {
      setMembers(orderMembers(result.members));
    }

    setMembersLoading(false);
  };

  const handleInvite = async () => {
    if (!sharingList) {
      return;
    }

    if (resolveRole(sharingList) !== 'owner') {
      setMemberError('Only owners can invite collaborators.');
      return;
    }

    const selectedFriend = availableFriends.find(friend => friend.friend_id === inviteFriendId);
    if (!selectedFriend) {
      setMemberError(
        friends.length === 0 ? 'Add friends before inviting them.' : 'Select a friend to invite.',
      );
      return;
    }

    setMemberSubmitting(true);
    setMemberError(null);

    const result = await inviteMember(sharingList.id, selectedFriend.friend_email, inviteRole);
    if ('error' in result) {
      setMemberError(result.error);
    } else {
      setMembers(prev => {
        const others = prev.filter(member => member.id !== result.member.id);
        return orderMembers([...others, result.member]);
      });
      setInviteFriendId('');
    }

    setMemberSubmitting(false);
  };

  const handleMemberRoleChange = async (member: ListMember, role: MemberRole) => {
    if (member.role === role) {
      return;
    }

    if (!sharingList || resolveRole(sharingList) !== 'owner') {
      setMemberError('Only owners can update member roles.');
      return;
    }

    setMemberActionId(member.id);
    setMemberError(null);

    const result = await updateMemberRole(member.id, role);
    if ('error' in result) {
      setMemberError(result.error);
    } else {
      setMembers(prev => {
        const next = prev.map(existing => (existing.id === member.id ? result.member : existing));
        return orderMembers(next);
      });
    }

    setMemberActionId(null);
  };

  const handleRemoveMember = async (member: ListMember) => {
    if (!sharingList) {
      return;
    }

    const isOwner = resolveRole(sharingList) === 'owner';
    if (!isOwner && member.user_id !== userId) {
      setMemberError('You can only remove yourself from this list.');
      return;
    }

    setMemberActionId(member.id);
    setMemberError(null);

    const result = await removeMember(member.id);
    if (result && 'error' in result && result.error) {
      setMemberError(result.error);
      setMemberActionId(null);
      return;
    }

    setMembers(prev => prev.filter(existing => existing.id !== member.id));
    setMemberActionId(null);

    if (sharingList && member.user_id === userId) {
      handleCloseShare();
    }
  };

  const handleEnablePublicShare = async () => {
    if (!sharingList) {
      return;
    }

    const listId = sharingList.id;
    setShareSubmitting(true);
    setShareActionError(null);

    const result = await enablePublicShare(listId);
    if ('error' in result) {
      setShareActionError(result.error);
    } else if (result?.token) {
      setSharingList(prev => (prev && prev.id === listId ? { ...prev, public_share_token: result.token, public_share_enabled: true } : prev));
      setShareLinkCopied(false);
    }

    setShareSubmitting(false);
  };

  const handleRotatePublicShare = async () => {
    if (!sharingList) {
      return;
    }

    const listId = sharingList.id;
    setShareSubmitting(true);
    setShareActionError(null);

    const result = await rotatePublicShare(listId);
    if ('error' in result) {
      setShareActionError(result.error);
    } else if (result?.token) {
      setSharingList(prev => (prev && prev.id === listId ? { ...prev, public_share_token: result.token, public_share_enabled: true } : prev));
      setShareLinkCopied(false);
    }

    setShareSubmitting(false);
  };

  const handleDisablePublicShare = async () => {
    if (!sharingList) {
      return;
    }

    const listId = sharingList.id;
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm('Disable public sharing? Existing share links will immediately stop working.');

    if (!confirmed) {
      return;
    }

    setShareSubmitting(true);
    setShareActionError(null);

    const result = await disablePublicShare(listId);
    if (result && 'error' in result) {
      setShareActionError(result.error);
    } else {
      setSharingList(prev => (prev && prev.id === listId ? { ...prev, public_share_token: null, public_share_enabled: false } : prev));
      setShareLinkCopied(false);
    }

    setShareSubmitting(false);
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) {
      setShareActionError('Enable public sharing to generate a link you can copy.');
      return;
    }

    setShareActionError(null);

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareLinkCopied(true);
        if (shareCopyTimeoutRef.current) {
          clearTimeout(shareCopyTimeoutRef.current);
        }
        shareCopyTimeoutRef.current = setTimeout(() => {
          setShareLinkCopied(false);
          shareCopyTimeoutRef.current = null;
        }, 2000);
        return;
      }

      throw new Error('Clipboard access is not available in this browser.');
    } catch (error) {
      setShareActionError(
        error instanceof Error
          ? `${error.message} Select the link below to copy it manually.`
          : 'Unable to copy the link automatically. Select the link below to copy it manually.',
      );
    }
  };

  const handlePreviewShareLink = () => {
    if (!shareUrl) {
      setShareActionError('Enable public sharing to preview the link.');
      return;
    }

    if (typeof window !== 'undefined') {
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCreateListItem = async (listId: string) => {
    const result = await createListItem(listId, '');
    if (!result || isErrorResult(result)) {
      setListItemError(listId, result?.error ?? 'Unable to add list item.');
      return null;
    }
    setListItemError(listId, null);
    return result.item.id;
  };

  const handleUpdateListItemContent = async (listId: string, itemId: string, content: string) => {
    const trimmed = content.trim();
    const list = lists.find(current => current.id === listId);
    const currentContent = list?.items?.find(item => item.id === itemId)?.content ?? '';
    if (currentContent === trimmed) {
      setListItemError(listId, null);
      return;
    }
    const result = await updateListItem(itemId, { content: trimmed });
    if (!result || isErrorResult(result)) {
      setListItemError(listId, result?.error ?? 'Unable to update list item.');
      return;
    }
    setListItemError(listId, null);
  };

  const handleToggleListItem = async (listId: string, itemId: string, completed: boolean) => {
    const result = await updateListItem(itemId, { completed });
    if (!result || isErrorResult(result)) {
      setListItemError(listId, result?.error ?? 'Unable to update list item.');
      return;
    }
    setListItemError(listId, null);
  };

  const handleDeleteListItem = async (listId: string, itemId: string) => {
    const result = await deleteListItem(itemId);
    if (result && isErrorResult(result)) {
      setListItemError(listId, result.error);
      return;
    }
    setListItemError(listId, null);
  };

  const handleReorderListItems = async (listId: string, orderedIds: string[]) => {
    const result = await reorderListItems(listId, orderedIds);
    if (result && isErrorResult(result)) {
      setListItemError(listId, result.error);
      return;
    }
    setListItemError(listId, null);
  };

  return {
    handleOpenCreate,
    handleOpenEdit,
    addNewListItem,
    updateNewListItemContent,
    toggleNewListItem,
    deleteNewListItem,
    reorderNewListItems,
    handleSubmit,
    handleCancelInlineEdit,
    handleDelete,
    handleArchive,
    handleUnarchive,
    handleOpenShare,
    handleCloseShare,
    handleInvite,
    handleMemberRoleChange,
    handleRemoveMember,
    handleEnablePublicShare,
    handleRotatePublicShare,
    handleDisablePublicShare,
    handleCopyShareLink,
    handlePreviewShareLink,
    handleCreateListItem,
    handleUpdateListItemContent,
    handleToggleListItem,
    handleDeleteListItem,
    handleReorderListItems,
  };
}
