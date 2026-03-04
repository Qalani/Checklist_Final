'use client';
import { motion } from 'framer-motion';
import {
  Share2,
  UserPlus,
  UserMinus,
  Shield,
  Loader2,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Task, TaskCollaborator, Friend } from '@/types';

type CollaboratorRole = 'viewer' | 'editor';

const COLLABORATOR_ROLES: CollaboratorRole[] = ['viewer', 'editor'];

const ROLE_LABELS: Record<'owner' | CollaboratorRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

interface TaskShareModalProps {
  sharingTask: Task;
  collaborators: TaskCollaborator[];
  collaboratorsLoading: boolean;
  collaboratorError: string | null;
  setCollaboratorError: (error: string | null) => void;
  inviteFriendId: string;
  setInviteFriendId: (value: string) => void;
  inviteRole: CollaboratorRole;
  setInviteRole: (role: CollaboratorRole) => void;
  collaboratorSubmitting: boolean;
  collaboratorActionId: string | null;
  availableFriends: Friend[];
  friends: Friend[];
  resolveRole: (task: Task) => 'owner' | CollaboratorRole;
  handleCloseShareTask: () => void;
  handleInviteCollaborator: () => void;
  handleCollaboratorRoleChange: (collaborator: TaskCollaborator, role: CollaboratorRole) => void;
  handleRemoveCollaborator: (collaborator: TaskCollaborator) => void;
  currentUserId: string | undefined;
}

export default function TaskShareModal({
  sharingTask,
  collaborators,
  collaboratorsLoading,
  collaboratorError,
  setCollaboratorError,
  inviteFriendId,
  setInviteFriendId,
  inviteRole,
  setInviteRole,
  collaboratorSubmitting,
  collaboratorActionId,
  availableFriends,
  friends,
  resolveRole,
  handleCloseShareTask,
  handleInviteCollaborator,
  handleCollaboratorRoleChange,
  handleRemoveCollaborator,
  currentUserId,
}: TaskShareModalProps) {
  const router = useRouter();

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleCloseShareTask}
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
              <Share2 className="w-3 h-3" />
              Collaborative task
            </div>
            <h2 className="text-xl font-semibold text-zen-900">Manage "{sharingTask.title}"</h2>
            <p className="text-sm text-zen-600">
              {resolveRole(sharingTask) === 'owner'
                ? 'Invite trusted friends to contribute or update their access.'
                : 'Review your access or leave the task if it no longer serves you.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCloseShareTask}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zen-500 hover:text-zen-700 hover:bg-zen-100 transition-colors"
            aria-label="Close collaborator dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          {resolveRole(sharingTask) === 'owner' ? (
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
                      setCollaboratorError(null);
                      setInviteFriendId(value);
                    }}
                    className="w-full rounded-xl border border-zen-200 bg-surface/90 pl-9 pr-9 py-2 text-sm text-zen-900 shadow-soft focus:border-sage-400 focus:outline-none appearance-none"
                    disabled={collaboratorSubmitting}
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
                  <p className="text-xs text-zen-500">Everyone on your friends list already collaborates on this task.</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zen-700">Role</label>
                <select
                  value={inviteRole}
                  onChange={event => setInviteRole(event.target.value as CollaboratorRole)}
                  className="w-full rounded-xl border border-zen-200 bg-surface/90 px-3 py-2 text-sm text-zen-900 shadow-soft focus:border-sage-400 focus:outline-none"
                  disabled={collaboratorSubmitting}
                >
                  {COLLABORATOR_ROLES.map(role => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
                <button
                  type="button"
                  onClick={() => void handleInviteCollaborator()}
                  disabled={collaboratorSubmitting || !inviteFriendId}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                {collaboratorSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Invite
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-zen-200 bg-zen-50 px-3 py-2 text-sm text-zen-600 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Only the owner can invite new collaborators. You can leave the task below.
            </div>
          )}

          {collaboratorError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {collaboratorError}
            </div>
          )}

          <div className="rounded-2xl border border-zen-200 bg-surface/90 shadow-soft">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zen-100">
              <p className="text-sm font-medium text-zen-700">Collaborators</p>
              <span className="text-xs text-zen-500">{collaborators.length} people</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-zen-100">
              {collaboratorsLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-zen-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading collaborators…
                </div>
              ) : collaborators.length === 0 ? (
                <div className="py-6 text-center text-sm text-zen-500">
                  No collaborators yet. {resolveRole(sharingTask) === 'owner' ? 'Invite a friend above to begin collaborating.' : 'Ask the owner to invite friends if you need help.'}
                </div>
              ) : (
                collaborators.map(collaborator => {
                  const isOwnerRow = Boolean(collaborator.is_owner || collaborator.role === 'owner');
                  const isCurrentUser = collaborator.user_id === currentUserId;
                  const disabled = collaboratorActionId === collaborator.id;
                  const collaboratorRole = (collaborator.role ?? 'viewer') as CollaboratorRole;
                  const roleLabelKey: 'owner' | CollaboratorRole = isOwnerRow ? 'owner' : collaboratorRole;

                  return (
                    <div
                      key={`${collaborator.id}-${collaborator.is_owner ? 'owner' : 'collaborator'}`}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-zen-800">{collaborator.user_email ?? (isOwnerRow ? 'Task owner' : 'Unknown user')}</p>
                        <p className="text-xs text-zen-500">
                          {isOwnerRow
                            ? 'Full control'
                            : isCurrentUser
                              ? 'You have shared access'
                              : 'Collaborator'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {isOwnerRow ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-sage-200 bg-sage-50 px-3 py-1 text-xs font-medium text-sage-600">
                            <Shield className="w-3 h-3" />
                            Owner
                          </span>
                        ) : resolveRole(sharingTask) === 'owner' ? (
                          <select
                            value={collaboratorRole}
                            onChange={event => void handleCollaboratorRoleChange(collaborator, event.target.value as CollaboratorRole)}
                            disabled={disabled}
                            className="rounded-xl border border-zen-200 bg-surface px-3 py-2 text-xs text-zen-700 shadow-soft focus:border-sage-400 focus:outline-none disabled:opacity-60"
                          >
                            {COLLABORATOR_ROLES.map(option => (
                              <option key={option} value={option}>
                                {ROLE_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-zen-200 bg-zen-50 px-3 py-1 text-xs font-medium text-zen-600">
                            {ROLE_LABELS[roleLabelKey]}
                          </span>
                        )}

                        {!isOwnerRow && (resolveRole(sharingTask) === 'owner' || isCurrentUser) && (
                          <button
                            type="button"
                            onClick={() => void handleRemoveCollaborator(collaborator)}
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
  );
}
