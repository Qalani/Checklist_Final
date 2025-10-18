'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Mail,
  Loader2,
  X,
  UserMinus,
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
    refresh,
    loadMembers,
    inviteMember,
    updateMemberRole,
    removeMember,
  } = useLists(user?.id ?? null);
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sharingList, setSharingList] = useState<List | null>(null);
  const [members, setMembers] = useState<ListMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('viewer');
  const [memberSubmitting, setMemberSubmitting] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  useEffect(() => {
    if (!showForm) {
      setFormState(INITIAL_FORM);
      setEditingList(null);
      setFormError(null);
    }
  }, [showForm]);

  const resolveRole = (list: List): MemberRole => list.access_role ?? 'owner';

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
    setFormState(INITIAL_FORM);
    setShowForm(true);
  };

  const handleOpenEdit = (list: List) => {
    const role = resolveRole(list);
    if (!['owner', 'editor'].includes(role)) {
      setFormError('You can only edit lists that you own or have editor access to.');
      return;
    }

    setEditingList(list);
    setFormState({
      name: list.name,
      description: list.description ?? '',
    });
    setShowForm(true);
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

    const result = editingList
      ? await updateList(editingList.id, payload)
      : await createList(payload);

    if (result && 'error' in result && result.error) {
      setFormError(result.error);
    } else {
      setShowForm(false);
      setFormState(INITIAL_FORM);
    }

    setSubmitting(false);
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
    setInviteEmail('');
    setInviteRole('viewer');
    setMemberError(null);
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
    setInviteEmail('');
    setInviteRole('viewer');
    setMemberSubmitting(false);
    setMemberActionId(null);
  };

  const handleInvite = async () => {
    if (!sharingList) {
      return;
    }

    if (resolveRole(sharingList) !== 'owner') {
      setMemberError('Only owners can invite collaborators.');
      return;
    }

    setMemberSubmitting(true);
    setMemberError(null);

    const result = await inviteMember(sharingList.id, inviteEmail, inviteRole);
    if ('error' in result) {
      setMemberError(result.error);
    } else {
      setMembers(prev => {
        const others = prev.filter(member => member.id !== result.member.id);
        return orderMembers([...others, result.member]);
      });
      setInviteEmail('');
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

  if (!authChecked || !user) {
    return <LoadingScreen />;
  }

  const sharingRole = sharingList ? resolveRole(sharingList) : null;
  const canManageMembers = sharingRole === 'owner';

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 min-h-screen flex flex-col">
        <ZenPageHeader
          title="Zen Lists"
          subtitle="Curate mindful collections"
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
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 items-start">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold text-zen-900">Shape routines, rituals, and shared moments.</h2>
                <p className="text-zen-600 max-w-2xl">
                  Lists help you organise ideas that don&apos;t fit into traditional tasks. Capture reading plans, packing essentials, or weekly rituals and keep them beautifully organised.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sage-500/90 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors"
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

                  return (
                    <motion.div
                      key={list.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="rounded-3xl bg-surface/80 border border-zen-200 shadow-soft p-6 flex flex-col gap-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <h3 className="text-xl font-semibold text-zen-900">{list.name}</h3>
                          {list.description && <MarkdownDisplay text={list.description} />}
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
                        </div>
                        <div className="flex items-center gap-2">
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
                      <div className="text-xs text-zen-400">
                        ID: {list.id.slice(0, 8)}…
                      </div>
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
                  className="p-2 rounded-lg text-zen-500 hover:text-zen-700 hover:bg-zen-100 transition-colors"
                  aria-label="Close share dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                {canManageMembers ? (
                  <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zen-700">Email address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-400" />
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={event => setInviteEmail(event.target.value)}
                          placeholder="teammate@example.com"
                          className="w-full rounded-xl border border-zen-200 bg-surface/90 pl-9 pr-3 py-2 text-sm text-zen-900 shadow-soft focus:border-sage-400 focus:outline-none"
                          disabled={memberSubmitting}
                        />
                      </div>
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
                      disabled={memberSubmitting}
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
