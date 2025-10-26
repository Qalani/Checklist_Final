'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  List as ListIcon,
  Plus,
  Pencil,
  Trash2,
  CheckSquare,
  Share2,
  UserPlus,
  Shield,
  Users,
  Loader2,
  X,
  UserMinus,
  Copy,
  Check,
  RefreshCcw,
  Globe2,
  Link as LinkIcon,
  ArrowUpRight,
} from 'lucide-react';
import ParallaxBackground from '@/components/ParallaxBackground';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import RichTextTextarea from '@/components/RichTextTextarea';
import MarkdownDisplay from '@/components/MarkdownDisplay';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useLists } from '@/features/lists/useLists';
import type { List, ListMember } from '@/types';
import { useRouter } from 'next/navigation';
import ZenPageHeader from '@/components/ZenPageHeader';
import AccountSummary from '@/components/AccountSummary';
import { useFriends } from '@/features/friends/useFriends';
import ListItemsBoard from '@/components/ListItemsBoard';

type FormState = {
  name: string;
  description: string;
};

const INITIAL_FORM: FormState = {
  name: '',
  description: '',
};

type MemberRole = ListMember['role'];

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const EDITABLE_ROLES: MemberRole[] = ['viewer', 'editor'];

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

function LoadingScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sage-200 border-t-sage-600" />
      </div>
    </div>
  );
}

export default function ListsPage() {
  const router = useRouter();
  const { user, authChecked, signOut } = useAuthSession();
  const {
    lists,
    status,
    syncing,
    error,
    createList,
    updateList,
    deleteList,
    createListItem,
    updateListItem,
    deleteListItem,
    reorderListItems,
    refresh,
    loadMembers,
    inviteMember,
    updateMemberRole,
    removeMember,
    enablePublicShare,
    rotatePublicShare,
    disablePublicShare,
  } = useLists(user?.id ?? null);
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [inlineEditingListId, setInlineEditingListId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sharingList, setSharingList] = useState<List | null>(null);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [inviteFriendId, setInviteFriendId] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('viewer');
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [shareActionError, setShareActionError] = useState<string | null>(null);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [shareOrigin, setShareOrigin] = useState('');
  const shareCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [itemActionErrors, setItemActionErrors] = useState<Record<string, string | null>>({});
  const [editingItemsListId, setEditingItemsListId] = useState<string | null>(null);

  const { friends } = useFriends(user?.id ?? null);

  const availableFriends = useMemo(() => {
    const memberEmails = new Set(
      members
        .map(member => member.user_email?.toLowerCase())
        .filter((email): email is string => Boolean(email && email.trim())),
    );

    return friends.filter(friend => !memberEmails.has(friend.friend_email.toLowerCase()));
  }, [friends, members]);

  const shareUrl = useMemo(() => {
    if (!sharingList?.public_share_token || !shareOrigin) {
      return '';
    }

    return `${shareOrigin}/lists/share/${sharingList.public_share_token}`;
  }, [shareOrigin, sharingList?.public_share_token]);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  useEffect(() => {
    if (!showForm && inlineEditingListId === null) {
      setFormState(INITIAL_FORM);
      setEditingList(null);
      setFormError(null);
      setEditingItemsListId(null);
    }
  }, [inlineEditingListId, showForm]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareOrigin(window.location.origin);
    }

    return () => {
      if (shareCopyTimeoutRef.current) {
        clearTimeout(shareCopyTimeoutRef.current);
        shareCopyTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!sharingList) {
      return;
    }

    const latest = lists.find(list => list.id === sharingList.id);
    if (latest && latest !== sharingList) {
      setSharingList(latest);
    }
  }, [lists, sharingList]);

  const resolveRole = (list: List): MemberRole => list.access_role ?? 'owner';

  const isErrorResult = (result: unknown): result is { error: string } => {
    return Boolean(result && typeof result === 'object' && 'error' in (result as Record<string, unknown>));
  };

  const setListItemError = (listId: string, message: string | null) => {
    setItemActionErrors(prev => {
      if (prev[listId] === message) {
        return prev;
      }
      return { ...prev, [listId]: message };
    });
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

  const sortedLists = useMemo(() => {
    return [...lists].sort((a, b) => {
      if (a.created_at && b.created_at) {
        return a.created_at.localeCompare(b.created_at);
      }
      if (a.created_at) return -1;
      if (b.created_at) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [lists]);

  const handleOpenCreate = () => {
    setEditingList(null);
    setInlineEditingListId(null);
    setFormState(INITIAL_FORM);
    setEditingItemsListId(null);
    setFormError(null);
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
    setShowForm(false);
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
    if (!isOwner && member.user_id !== user?.id) {
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

    if (sharingList && member.user_id === user?.id) {
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

  if (!authChecked || !user) {
    return <LoadingScreen />;
  }

  const sharingRole = sharingList ? resolveRole(sharingList) : null;
  const canManageMembers = sharingRole === 'owner';
  const shareIsActive = Boolean(sharingList?.public_share_enabled && sharingList.public_share_token);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-sage-50 to-warm-50">
      <ParallaxBackground />
      <div className="relative z-10 min-h-screen flex flex-col">
        <ZenPageHeader
          title="Zen Lists"
          subtitle="Design composed rituals and playbooks"
          icon={ListIcon}
          backHref="/"
          actions={
            <>
              <ThemeSwitcher />
              <AccountSummary email={user.email} syncing={syncing} onSignOut={signOut} />
            </>
          }
        />

        <main className="flex-1">
          <section className="max-w-7xl mx-auto px-4 py-10 space-y-8 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 items-start">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold text-zen-900">Shape polished collections that stay in sync.</h2>
                <p className="text-zen-600 max-w-2xl">
                  Lists help you orchestrate context—from client check-ins to quarterly rituals—without the clutter. Build elegant reference points and keep every detail harmonised.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-2 rounded-xl bg-zen-600 px-4 py-2 text-sm font-medium text-white shadow-soft transition-colors hover:bg-zen-700"
                  >
                    <Plus className="w-4 h-4" />
                    New list
                  </button>
                  <button
                    type="button"
                    onClick={() => refresh(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zen-200 bg-surface/80 text-sm font-medium text-zen-600 hover:text-zen-800 hover:border-zen-300 transition-colors"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="rounded-3xl bg-surface/80 border border-zen-200 shadow-soft p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 flex items-center justify-center text-white shadow-medium">
                    <ListIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm text-zen-500">Lists created</p>
                    <p className="text-2xl font-semibold text-zen-900">{syncing && status === 'loading' ? '—' : lists.length}</p>
                  </div>
                </div>
                <p className="text-sm text-zen-600">
                  {lists.length === 0
                    ? 'Start with a template that suits your moment—travel, wellness, study, or routines.'
                    : 'Tap a list to refine it. Use lists for recurring rituals, shared chores, or inspiration boards.'}
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <AnimatePresence>
              {showForm && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-3xl bg-surface/90 border border-zen-200 shadow-soft p-6 space-y-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-zen-900">
                        {editingList ? 'Update list' : 'Create a new list'}
                      </h3>
                      <p className="text-sm text-zen-600">
                        Name your list and describe its intention to stay inspired.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="text-sm text-zen-500 hover:text-zen-700"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zen-700">List name</label>
                      <input
                        type="text"
                        value={formState.name}
                        onChange={event => setFormState(prev => ({ ...prev, name: event.target.value }))}
                        placeholder="Sunday reset, Travel checklist, Reading list..."
                        className="w-full rounded-xl border border-zen-200 bg-surface/80 px-4 py-2.5 text-sm text-zen-900 shadow-soft focus:border-sage-400 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zen-700">Description</label>
                      <RichTextTextarea
                        value={formState.description}
                        onChange={value => setFormState(prev => ({ ...prev, description: value }))}
                        placeholder="Add a gentle reminder of what this list helps you with."
                        rows={4}
                      />
                    </div>
                  </div>

                  {formError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {formError}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-4 py-2 rounded-xl border border-zen-200 text-sm font-medium text-zen-600 hover:text-zen-800 hover:border-zen-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Saving…' : editingList ? 'Save changes' : 'Create list'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {status === 'loading' && lists.length === 0 ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-40 rounded-3xl bg-surface/70 border border-zen-200 shadow-soft animate-pulse"
                  />
                ))
              ) : sortedLists.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3 rounded-3xl border border-dashed border-zen-200 bg-surface/50 p-12 text-center space-y-4">
                  <ListIcon className="w-12 h-12 mx-auto text-sage-400" />
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-zen-900">No lists yet</h3>
                    <p className="text-zen-600 max-w-xl mx-auto">
                      Start with a single idea. Whether it&apos;s a weekend reset, packing guide, or gratitude list, we&apos;ll keep it safe and beautifully arranged.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create your first list
                  </button>
                </div>
              ) : (
                sortedLists.map(list => {
                  const role = resolveRole(list);
                  const canEditList = role === 'owner' || role === 'editor';
                  const canDeleteList = role === 'owner';
                  const isEditingList = editingItemsListId === list.id;
                  const isInlineEditing = inlineEditingListId === list.id;
                  const cardClassName = `rounded-3xl border shadow-soft p-6 flex flex-col gap-4 ${
                    isInlineEditing ? 'bg-surface border-sage-200 ring-1 ring-sage-100' : 'bg-surface/80 border-zen-200'
                  }`;
                  const metadata = (
                    <div className="flex items-center gap-2 text-xs text-zen-400">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sage-50 text-sage-600 border border-sage-100">
                        <Users className="w-3 h-3" />
                        {ROLE_LABELS[role]}
                      </span>
                      <span>
                        {list.created_at
                          ? new Date(list.created_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'Recently created'}
                      </span>
                    </div>
                  );

                  return (
                    <motion.div
                      key={list.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className={cardClassName}
                    >
                      {isInlineEditing ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleSubmit();
                          }}
                          className="flex flex-col gap-4"
                        >
                          <div className="grid gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-zen-700">List name</label>
                              <input
                                type="text"
                                value={formState.name}
                                onChange={event => setFormState(prev => ({ ...prev, name: event.target.value }))}
                                placeholder="Sunday reset, Travel checklist, Reading list..."
                                className="w-full rounded-xl border border-sage-300 bg-surface px-4 py-2.5 text-sm text-zen-900 shadow-soft focus:border-sage-500 focus:outline-none"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-zen-700">Description</label>
                              <RichTextTextarea
                                value={formState.description}
                                onChange={value => setFormState(prev => ({ ...prev, description: value }))}
                                placeholder="Add a gentle reminder of what this list helps you with."
                                rows={4}
                              />
                            </div>
                          </div>

                          {formError && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                              {formError}
                            </div>
                          )}

                          <ListItemsBoard
                            items={Array.isArray(list.items) ? list.items : []}
                            canEdit={canEditList}
                            editing={isEditingList}
                            onAddItem={canEditList ? () => handleCreateListItem(list.id) : undefined}
                            onToggleItem={canEditList ? (itemId, completed) => handleToggleListItem(list.id, itemId, completed) : undefined}
                            onContentCommit={canEditList ? (itemId, content) => handleUpdateListItemContent(list.id, itemId, content) : undefined}
                            onDeleteItem={canEditList ? itemId => handleDeleteListItem(list.id, itemId) : undefined}
                            onReorder={canEditList ? orderedIds => handleReorderListItems(list.id, orderedIds) : undefined}
                            error={itemActionErrors[list.id] ?? null}
                          />

                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            {metadata}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleCancelInlineEdit}
                                className="px-4 py-2 rounded-xl border border-zen-200 text-sm font-medium text-zen-600 hover:text-zen-800 hover:border-zen-300 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={submitting}
                                className="px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                              >
                                {submitting ? 'Saving…' : 'Save changes'}
                              </button>
                            </div>
                          </div>

                          <div className="text-xs text-zen-400">ID: {list.id.slice(0, 8)}…</div>
                        </form>
                      ) : (
                        <>
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-2 sm:flex-1 sm:min-w-0">
                                <h3 className="text-xl font-semibold text-zen-900">{list.name}</h3>
                                {list.description && <MarkdownDisplay text={list.description} />}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end sm:self-start">
                                {list.access_role && (
                                  <button
                                    type="button"
                                    onClick={() => void handleOpenShare(list)}
                                    className="p-2 rounded-xl border border-zen-200 text-zen-500 hover:text-zen-700 hover:border-zen-300 transition-colors"
                                    title={role === 'owner' ? 'Share list' : 'View collaborators'}
                                  >
                                    <Share2 className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(list)}
                                  className="p-2 rounded-xl border border-zen-200 text-zen-500 hover:text-zen-700 hover:border-zen-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={!canEditList}
                                  title={canEditList ? 'Edit list' : 'You do not have permission to edit this list'}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(list)}
                                  className="p-2 rounded-xl border border-red-200 text-red-500 hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={!canDeleteList}
                                  title={canDeleteList ? 'Delete list' : 'Only owners can delete this list'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <ListItemsBoard
                              items={Array.isArray(list.items) ? list.items : []}
                              canEdit={canEditList}
                              editing={isEditingList}
                              onAddItem={canEditList ? () => handleCreateListItem(list.id) : undefined}
                              onToggleItem={canEditList ? (itemId, completed) => handleToggleListItem(list.id, itemId, completed) : undefined}
                              onContentCommit={canEditList ? (itemId, content) => handleUpdateListItemContent(list.id, itemId, content) : undefined}
                              onDeleteItem={canEditList ? itemId => handleDeleteListItem(list.id, itemId) : undefined}
                              onReorder={canEditList ? orderedIds => handleReorderListItems(list.id, orderedIds) : undefined}
                              error={itemActionErrors[list.id] ?? null}
                            />
                            {metadata}
                          </div>
                          <div className="text-xs text-zen-400">ID: {list.id.slice(0, 8)}…</div>
                        </>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          </section>
        </main>
      </div>

      <AnimatePresence>
        {sharingList && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={handleCloseShare}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative w-full max-w-2xl rounded-3xl bg-surface p-6 shadow-xl border border-zen-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sage-100 text-sage-700 text-xs font-medium">
                    <Shield className="w-3 h-3" />
                    {canManageMembers ? 'Owner tools' : 'Shared access'}
                  </div>
                  <h2 className="text-xl font-semibold text-zen-900">
                    {canManageMembers ? `Share “${sharingList.name}”` : `Collaborators for “${sharingList.name}”`}
                  </h2>
                  <p className="text-sm text-zen-600">
                    {canManageMembers
                      ? 'Invite trusted collaborators and choose their access.'
                      : 'Review who has access or leave the list if it no longer fits.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseShare}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zen-500 hover:text-zen-700 hover:bg-zen-100 transition-colors"
                  aria-label="Close share dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <div className="rounded-2xl border border-zen-200 bg-surface/90 shadow-soft p-5 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zen-100 text-zen-700 text-xs font-medium">
                        <Globe2 className="w-3 h-3" />
                        Share with a link
                      </div>
                      <p className="text-sm text-zen-600">
                        {canManageMembers
                          ? 'Generate a polished public view to share with anyone—even without an account.'
                          : 'The owner can create a public link so anyone can read this list without signing in.'}
                      </p>
                    </div>
                    {canManageMembers && shareIsActive && (
                      <button
                        type="button"
                        onClick={() => void handleRotatePublicShare()}
                        disabled={shareSubmitting}
                        className="inline-flex items-center gap-2 self-start rounded-xl border border-zen-200 px-3 py-2 text-xs font-medium text-zen-600 transition-colors hover:border-zen-300 hover:text-zen-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {shareSubmitting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCcw className="w-3 h-3" />
                        )}
                        Refresh link
                      </button>
                    )}
                  </div>

                  {shareActionError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {shareActionError}
                    </div>
                  )}

                  {shareIsActive && sharingList?.public_share_token ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 rounded-xl border border-zen-200 bg-zen-50 px-3 py-2 text-xs text-zen-600">
                            <LinkIcon className="w-4 h-4 shrink-0 text-zen-400" />
                            <span className="truncate">
                              {shareUrl || 'Link will appear after the page loads.'}
                            </span>
                          </div>
                        </div>
                        {canManageMembers && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleCopyShareLink()}
                              disabled={shareSubmitting}
                              className="inline-flex items-center gap-2 rounded-xl bg-sage-500 px-3 py-2 text-xs font-medium text-white shadow-soft transition-colors hover:bg-sage-600 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {shareSubmitting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : shareLinkCopied ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              {shareLinkCopied ? 'Copied' : 'Copy link'}
                            </button>
                            <button
                              type="button"
                              onClick={handlePreviewShareLink}
                              disabled={shareSubmitting}
                              className="inline-flex items-center gap-2 rounded-xl border border-zen-200 px-3 py-2 text-xs font-medium text-zen-600 transition-colors hover:border-zen-300 hover:text-zen-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <ArrowUpRight className="w-3 h-3" />
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDisablePublicShare()}
                              disabled={shareSubmitting}
                              className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {shareSubmitting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <X className="w-3 h-3" />
                              )}
                              Stop sharing
                            </button>
                          </div>
                        )}
                      </div>
                      {!canManageMembers && (
                        <p className="text-xs text-zen-500">
                          Share this link carefully—anyone with it can read the list.
                        </p>
                      )}
                    </div>
                  ) : canManageMembers ? (
                    <button
                      type="button"
                      onClick={() => void handleEnablePublicShare()}
                      disabled={shareSubmitting}
                      className="inline-flex items-center gap-2 rounded-xl bg-zen-600 px-4 py-2 text-sm font-medium text-white shadow-soft transition-colors hover:bg-zen-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {shareSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Globe2 className="w-4 h-4" />
                      )}
                      Enable public link
                    </button>
                  ) : (
                    <p className="text-xs text-zen-500">
                      Only owners can enable a public share link for this list.
                    </p>
                  )}
                </div>

                {canManageMembers ? (
                  <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zen-700">Choose a friend</label>
                      <div className="relative">
                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-400" />
                        <select
                          value={inviteFriendId}
                          onChange={event => {
                            const value = event.target.value;
                            if (value === '__add__') {
                              setInviteFriendId('');
                              router.push('/friends');
                              return;
                            }
                            setMemberError(null);
                            setInviteFriendId(value);
                          }}
                          className="w-full rounded-xl border border-zen-200 bg-surface/90 pl-9 pr-9 py-2 text-sm text-zen-900 shadow-soft focus:border-sage-400 focus:outline-none appearance-none"
                          disabled={memberSubmitting}
                        >
                          <option value="" disabled>
                            {friends.length === 0
                              ? 'No friends yet'
                              : availableFriends.length === 0
                                ? 'All friends already invited'
                                : 'Select a friend'}
                          </option>
                          {availableFriends.map(friend => (
                            <option key={friend.friend_id} value={friend.friend_id}>
                              {friend.friend_name ? `${friend.friend_name} (${friend.friend_email})` : friend.friend_email}
                            </option>
                          ))}
                          <option value="__add__">Add more friends</option>
                        </select>
                      </div>
                      {friends.length === 0 && (
                        <p className="text-xs text-zen-500">Add friends to invite them to collaborate.</p>
                      )}
                      {friends.length > 0 && availableFriends.length === 0 && (
                        <p className="text-xs text-zen-500">Everyone on your friends list already collaborates on this list.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zen-700">Role</label>
                      <select
                        value={inviteRole}
                        onChange={event => setInviteRole(event.target.value as MemberRole)}
                        className="w-full rounded-xl border border-zen-200 bg-surface/90 px-3 py-2 text-sm text-zen-900 shadow-soft focus:border-sage-400 focus:outline-none"
                        disabled={memberSubmitting}
                      >
                        {EDITABLE_ROLES.map(role => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleInvite()}
                      disabled={memberSubmitting || !inviteFriendId}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {memberSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      Invite
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-zen-200 bg-zen-50 px-3 py-2 text-sm text-zen-600 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Only owners can invite collaborators. You can leave the list below.
                  </div>
                )}

                {memberError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {memberError}
                  </div>
                )}

                <div className="rounded-2xl border border-zen-200 bg-surface/90 shadow-soft">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zen-100">
                    <p className="text-sm font-medium text-zen-700">Collaborators</p>
                    <span className="text-xs text-zen-500">{members.length} people</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-zen-100">
                    {membersLoading ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-zen-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading members…
                      </div>
                    ) : members.length === 0 ? (
                      <div className="py-6 text-center text-sm text-zen-500">
                        No collaborators yet. {canManageMembers ? 'Invite someone above.' : 'Ask the owner to invite collaborators if you need help.'}
                      </div>
                    ) : (
                      members.map(member => {
                        const isOwner = member.role === 'owner';
                        const isCurrentUser = member.user_id === user.id;
                        const disabled = memberActionId === member.id;

                        return (
                          <div key={member.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-zen-800">{member.user_email ?? 'Unknown user'}</p>
                              <p className="text-xs text-zen-500">
                                {isOwner ? 'Full control' : isCurrentUser ? 'You have shared access' : 'Collaborator'}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              {isOwner ? (
                                <span className="inline-flex items-center gap-1 rounded-lg border border-sage-200 bg-sage-50 px-3 py-1 text-xs font-medium text-sage-600">
                                  <Shield className="w-3 h-3" />
                                  Owner
                                </span>
                              ) : canManageMembers ? (
                                <select
                                  value={member.role}
                                  onChange={event => void handleMemberRoleChange(member, event.target.value as MemberRole)}
                                  disabled={disabled}
                                  className="rounded-xl border border-zen-200 bg-surface px-3 py-2 text-xs text-zen-700 shadow-soft focus:border-sage-400 focus:outline-none disabled:opacity-60"
                                >
                                  {EDITABLE_ROLES.map(role => (
                                    <option key={role} value={role}>
                                      {ROLE_LABELS[role]}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-lg border border-zen-200 bg-zen-50 px-3 py-1 text-xs font-medium text-zen-600">
                                  {ROLE_LABELS[member.role]}
                                </span>
                              )}
                              {!isOwner && (canManageMembers || isCurrentUser) && (
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveMember(member)}
                                  disabled={disabled}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 text-xs font-medium text-red-500 hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-60"
                                >
                                  {disabled ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserMinus className="w-3 h-3" />}
                                  {isCurrentUser ? 'Leave' : 'Remove'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
