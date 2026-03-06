'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  List as ListIcon,
  Plus,
  Pencil,
  Trash2,
  Share2,
  CheckSquare,
  Users,
  Archive,
  Upload,
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
import { useListsPageHandlers } from './hooks/useListsPageHandlers';
import ListFormModal from './components/ListFormModal';
import SharingModal from './components/SharingModal';
import ImportListsModal from '@/components/ImportListsModal';

type FormState = {
  name: string;
  description: string;
};

type ListSortOption = 'created-oldest' | 'created-newest' | 'name-asc' | 'name-desc';

const LIST_SORT_OPTIONS: Array<{ value: ListSortOption; label: string; description: string }> = [
  {
    value: 'created-oldest',
    label: 'Created · oldest',
    description: 'Oldest lists appear first.',
  },
  {
    value: 'created-newest',
    label: 'Created · newest',
    description: 'Most recently created lists appear first.',
  },
  {
    value: 'name-asc',
    label: 'Name · A → Z',
    description: 'Lists are shown alphabetically.',
  },
  {
    value: 'name-desc',
    label: 'Name · Z → A',
    description: 'Lists are shown in reverse alphabetical order.',
  },
];

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
    archiveList,
    unarchiveList,
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
  const [listSort, setListSort] = useState<ListSortOption>('created-oldest');
  const [newListItems, setNewListItems] = useState<List['items']>([]);
  const [listTab, setListTab] = useState<'active' | 'archived'>('active');
  const [listActionMessage, setListActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

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
      setNewListItems([]);
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

  const {
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
  } = useListsPageHandlers({
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
    userId: user?.id,
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
  });

  const sortedLists = useMemo(() => {
    const fallbackOrder = new Map(lists.map((list, index) => [list.id, index]));
    const getCreatedTime = (list: List) => {
      if (!list.created_at) {
        return null;
      }
      const timestamp = new Date(list.created_at).getTime();
      return Number.isNaN(timestamp) ? null : timestamp;
    };

    const sorted = [...lists];

    sorted.sort((a, b) => {
      const fallback = (fallbackOrder.get(a.id) ?? 0) - (fallbackOrder.get(b.id) ?? 0);

      if (listSort === 'created-oldest' || listSort === 'created-newest') {
        const createdA = getCreatedTime(a);
        const createdB = getCreatedTime(b);

        if (createdA == null && createdB == null) {
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || fallback;
        }
        if (createdA == null) {
          return listSort === 'created-oldest' ? 1 : -1;
        }
        if (createdB == null) {
          return listSort === 'created-oldest' ? -1 : 1;
        }

        const diff = listSort === 'created-oldest' ? createdA - createdB : createdB - createdA;
        if (diff !== 0) {
          return diff;
        }

        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || fallback;
      }

      if (listSort === 'name-asc' || listSort === 'name-desc') {
        const diff = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        if (diff !== 0) {
          return listSort === 'name-asc' ? diff : -diff;
        }

        const createdA = getCreatedTime(a);
        const createdB = getCreatedTime(b);

        if (createdA != null && createdB != null && createdA !== createdB) {
          return createdB - createdA;
        }

        return fallback;
      }

      return fallback;
    });

    return sorted;
  }, [listSort, lists]);

  const activeLists = useMemo(() => sortedLists.filter((l: List) => !l.archived), [sortedLists]);
  const archivedLists = useMemo(() => sortedLists.filter((l: List) => l.archived), [sortedLists]);

  const selectedListSortOption =
    LIST_SORT_OPTIONS.find(option => option.value === listSort) ?? LIST_SORT_OPTIONS[0];
  const listSortStatusText = selectedListSortOption.description;

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
                    onClick={() => setShowImportModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zen-200 bg-surface/80 text-sm font-medium text-zen-600 hover:text-zen-800 hover:border-zen-300 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Import
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

            <ListFormModal
              showForm={showForm}
              setShowForm={setShowForm}
              editingList={editingList}
              formState={formState}
              setFormState={setFormState}
              formError={formError}
              submitting={submitting}
              newListItems={newListItems}
              addNewListItem={addNewListItem}
              updateNewListItemContent={updateNewListItemContent}
              toggleNewListItem={toggleNewListItem}
              deleteNewListItem={deleteNewListItem}
              reorderNewListItems={reorderNewListItems}
              handleSubmit={handleSubmit}
            />

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-1 p-1 bg-surface/70 border border-zen-200 rounded-xl shadow-soft">
                {[
                  { key: 'active' as const, label: `Active (${activeLists.length})` },
                  { key: 'archived' as const, label: `Archived (${archivedLists.length})` },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setListTab(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      listTab === tab.key
                        ? 'bg-sage-100 text-sage-700 shadow-soft'
                        : 'text-zen-600 hover:bg-zen-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <p className="text-sm text-zen-500">{listSortStatusText}</p>
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zen-400 sm:text-[0.75rem]">
                  <span>Sort</span>
                  <select
                    value={listSort}
                    onChange={event => setListSort(event.target.value as ListSortOption)}
                    className="rounded-lg border border-zen-200 bg-surface/90 px-3 py-1.5 text-sm font-medium text-zen-700 shadow-soft focus:border-sage-400 focus:outline-none"
                  >
                    {LIST_SORT_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {status === 'loading' && lists.length === 0 ? (
              <div className="columns-1 md:columns-2 xl:columns-3 gap-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="break-inside-avoid mb-6 h-40 rounded-3xl bg-surface/70 border border-zen-200 shadow-soft animate-pulse"
                  />
                ))}
              </div>
            ) : listTab === 'archived' ? (
              archivedLists.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-zen-200 bg-surface/50 p-12 text-center space-y-4">
                  <Archive className="w-12 h-12 mx-auto text-sage-400" />
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-zen-900">No archived lists</h3>
                    <p className="text-zen-600 max-w-xl mx-auto">
                      Lists you archive will appear here. You can restore them at any time.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="columns-1 md:columns-2 xl:columns-3 gap-6">
                  {archivedLists.map(list => (
                    <div
                      key={list.id}
                      className="break-inside-avoid mb-6 rounded-3xl border border-zen-200/60 bg-surface/60 p-6 flex flex-col gap-3 opacity-70"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-zen-700 truncate">{list.name}</h3>
                          {list.description && (
                            <p className="text-xs text-zen-500 mt-1 line-clamp-2">{list.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleUnarchive(list)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-zen-200 text-xs font-medium text-zen-600 hover:text-zen-800 hover:border-zen-300 transition-colors"
                            title="Restore list"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(list)}
                            className="p-1.5 rounded-xl border border-red-200 text-red-400 hover:text-red-600 hover:border-red-300 transition-colors"
                            title="Delete permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-zen-400">{(list.items?.length ?? 0)} items</p>
                    </div>
                  ))}
                </div>
              )
            ) : activeLists.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-zen-200 bg-surface/50 p-12 text-center space-y-4">
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
              <div className="columns-1 md:columns-2 xl:columns-3 gap-6">
                {activeLists.map(list => {
                  const role = resolveRole(list);
                  const canEditList = role === 'owner' || role === 'editor';
                  const canDeleteList = role === 'owner';
                  const isEditingList = editingItemsListId === list.id;
                  const isInlineEditing = inlineEditingListId === list.id;
                  const cardClassName = `break-inside-avoid mb-6 rounded-3xl border shadow-soft p-6 flex flex-col gap-4 ${
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
                                  onClick={() => void handleArchive(list)}
                                  className="p-2 rounded-xl border border-zen-200 text-zen-500 hover:text-zen-700 hover:border-zen-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={!canDeleteList}
                                  title={canDeleteList ? 'Archive list' : 'Only owners can archive this list'}
                                >
                                  <Archive className="w-4 h-4" />
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
                })}
              </div>
            )}

          </section>
        </main>
      </div>

      {listActionMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-32 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lift ${
            listActionMessage.type === 'success'
              ? 'border-sage-200 bg-surface text-sage-700'
              : 'border-red-200 bg-surface text-red-600'
          }`}
        >
          {listActionMessage.text}
        </div>
      )}

      <SharingModal
        sharingList={sharingList}
        members={members}
        membersLoading={membersLoading}
        memberError={memberError}
        inviteFriendId={inviteFriendId}
        setInviteFriendId={setInviteFriendId}
        inviteRole={inviteRole}
        setInviteRole={setInviteRole}
        memberSubmitting={memberSubmitting}
        memberActionId={memberActionId}
        shareActionError={shareActionError}
        shareSubmitting={shareSubmitting}
        shareLinkCopied={shareLinkCopied}
        shareUrl={shareUrl}
        canManageMembers={canManageMembers}
        shareIsActive={shareIsActive}
        friends={friends}
        availableFriends={availableFriends}
        userId={user.id}
        setMemberError={setMemberError}
        handleCloseShare={handleCloseShare}
        handleInvite={handleInvite}
        handleMemberRoleChange={handleMemberRoleChange}
        handleRemoveMember={handleRemoveMember}
        handleEnablePublicShare={handleEnablePublicShare}
        handleRotatePublicShare={handleRotatePublicShare}
        handleDisablePublicShare={handleDisablePublicShare}
        handleCopyShareLink={handleCopyShareLink}
        handlePreviewShareLink={handlePreviewShareLink}
      />

      <ImportListsModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={() => void refresh(true)}
      />
    </div>
  );
}
