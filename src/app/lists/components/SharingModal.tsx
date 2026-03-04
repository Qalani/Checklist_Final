'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Shield,
  X,
  Globe2,
  RefreshCcw,
  Loader2,
  LinkIcon,
  Copy,
  Check,
  ArrowUpRight,
  Users,
  UserPlus,
  UserMinus,
} from 'lucide-react';
import type { List, ListMember } from '@/types';
import { useRouter } from 'next/navigation';

type MemberRole = ListMember['role'];

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const EDITABLE_ROLES: MemberRole[] = ['viewer', 'editor'];

type Friend = {
  friend_id: string;
  friend_email: string;
  friend_name?: string | null;
};

interface SharingModalProps {
  sharingList: List | null;
  members: ListMember[];
  membersLoading: boolean;
  memberError: string | null;
  inviteFriendId: string;
  setInviteFriendId: (id: string) => void;
  inviteRole: MemberRole;
  setInviteRole: (role: MemberRole) => void;
  memberSubmitting: boolean;
  memberActionId: string | null;
  shareActionError: string | null;
  shareSubmitting: boolean;
  shareLinkCopied: boolean;
  shareUrl: string;
  canManageMembers: boolean;
  shareIsActive: boolean;
  friends: Friend[];
  availableFriends: Friend[];
  userId: string;
  setMemberError: (error: string | null) => void;
  handleCloseShare: () => void;
  handleInvite: () => void;
  handleMemberRoleChange: (member: ListMember, role: MemberRole) => void;
  handleRemoveMember: (member: ListMember) => void;
  handleEnablePublicShare: () => void;
  handleRotatePublicShare: () => void;
  handleDisablePublicShare: () => void;
  handleCopyShareLink: () => void;
  handlePreviewShareLink: () => void;
}

export default function SharingModal({
  sharingList,
  members,
  membersLoading,
  memberError,
  inviteFriendId,
  setInviteFriendId,
  inviteRole,
  setInviteRole,
  memberSubmitting,
  memberActionId,
  shareActionError,
  shareSubmitting,
  shareLinkCopied,
  shareUrl,
  canManageMembers,
  shareIsActive,
  friends,
  availableFriends,
  userId,
  setMemberError,
  handleCloseShare,
  handleInvite,
  handleMemberRoleChange,
  handleRemoveMember,
  handleEnablePublicShare,
  handleRotatePublicShare,
  handleDisablePublicShare,
  handleCopyShareLink,
  handlePreviewShareLink,
}: SharingModalProps) {
  const router = useRouter();

  return (
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
                  {canManageMembers ? `Share "${sharingList.name}"` : `Collaborators for "${sharingList.name}"`}
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
                      const isCurrentUser = member.user_id === userId;
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
  );
}
