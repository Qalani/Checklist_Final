'use client';
import { useState, useCallback, useMemo } from 'react';
import type { Task, TaskCollaborator, Friend } from '@/types';

type CollaboratorRole = 'viewer' | 'editor';

function orderCollaborators(collaborators: TaskCollaborator[]): TaskCollaborator[] {
  const ROLE_ORDER: Record<'owner' | CollaboratorRole, number> = {
    owner: 0,
    editor: 1,
    viewer: 2,
  };

  return [...collaborators].sort((a, b) => {
    if (a.is_owner && !b.is_owner) {
      return -1;
    }
    if (b.is_owner && !a.is_owner) {
      return 1;
    }

    const roleA = (a.role ?? 'viewer') as 'owner' | CollaboratorRole;
    const roleB = (b.role ?? 'viewer') as 'owner' | CollaboratorRole;
    const roleComparison = (ROLE_ORDER[roleA] ?? 2) - (ROLE_ORDER[roleB] ?? 2);

    if (roleComparison !== 0) {
      return roleComparison;
    }

    return (a.user_email ?? '').localeCompare(b.user_email ?? '');
  });
}

interface UseTaskCollaborationOptions {
  friends: Friend[];
  user: { id: string; email?: string } | null | undefined;
  loadTaskCollaborators: (taskId: string) => Promise<{ collaborators: TaskCollaborator[] } | { error: string }>;
  inviteTaskCollaborator: (taskId: string, email: string, role: 'viewer' | 'editor') => Promise<{ collaborator: TaskCollaborator } | { error: string }>;
  updateTaskCollaboratorRole: (collaboratorId: string, role: 'viewer' | 'editor') => Promise<{ collaborator: TaskCollaborator } | { error: string }>;
  removeTaskCollaborator: (collaboratorId: string) => Promise<{ error: string } | void>;
}

export function useTaskCollaboration({
  friends,
  user,
  loadTaskCollaborators,
  inviteTaskCollaborator,
  updateTaskCollaboratorRole,
  removeTaskCollaborator,
}: UseTaskCollaborationOptions) {
  const [sharingTask, setSharingTask] = useState<Task | null>(null);
  const [collaborators, setCollaborators] = useState<TaskCollaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [collaboratorError, setCollaboratorError] = useState<string | null>(null);
  const [inviteFriendId, setInviteFriendId] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>('viewer');
  const [collaboratorSubmitting, setCollaboratorSubmitting] = useState(false);
  const [collaboratorActionId, setCollaboratorActionId] = useState<string | null>(null);

  const resolveRole = useCallback((task: Task): 'owner' | CollaboratorRole => task.access_role ?? 'owner', []);

  const availableFriends = useMemo(() => {
    const collaboratorEmails = new Set(
      collaborators
        .map(collaborator => collaborator.user_email?.toLowerCase())
        .filter((email): email is string => Boolean(email && email.trim())),
    );

    return friends.filter(friend => !collaboratorEmails.has(friend.friend_email.toLowerCase()));
  }, [collaborators, friends]);

  const handleOpenShareTask = useCallback(
    async (task: Task) => {
      setSharingTask(task);
      setCollaborators([]);
      setInviteFriendId('');
      setInviteRole('viewer');
      setCollaboratorError(null);
      setCollaboratorsLoading(true);

      const result = await loadTaskCollaborators(task.id);

      if ('error' in result) {
        setCollaboratorError(result.error);
        setCollaborators([]);
      } else {
        setCollaborators(orderCollaborators(result.collaborators));
      }

      setCollaboratorsLoading(false);
    },
    [loadTaskCollaborators],
  );

  const handleCloseShareTask = useCallback(() => {
    setSharingTask(null);
    setCollaborators([]);
    setCollaboratorError(null);
    setInviteFriendId('');
    setInviteRole('viewer');
    setCollaboratorSubmitting(false);
    setCollaboratorActionId(null);
  }, []);

  const handleInviteCollaborator = useCallback(async () => {
    if (!sharingTask) {
      return;
    }

    if (resolveRole(sharingTask) !== 'owner') {
      setCollaboratorError('Only owners can invite collaborators.');
      return;
    }

    const selectedFriend = availableFriends.find(friend => friend.friend_id === inviteFriendId);
    if (!selectedFriend) {
      setCollaboratorError(
        friends.length === 0
          ? 'Add friends before inviting them.'
          : 'Select a friend to invite.',
      );
      return;
    }

    setCollaboratorSubmitting(true);
    setCollaboratorError(null);

    const result = await inviteTaskCollaborator(sharingTask.id, selectedFriend.friend_email, inviteRole);

    if ('error' in result) {
      setCollaboratorError(result.error);
    } else {
      setCollaborators(prev => {
        const ownerRows = prev.filter(collaborator => collaborator.is_owner);
        const others = prev.filter(collaborator => !collaborator.is_owner && collaborator.id !== result.collaborator.id);
        return orderCollaborators([...ownerRows, ...others, result.collaborator]);
      });
      setInviteFriendId('');
    }

    setCollaboratorSubmitting(false);
  }, [
    sharingTask,
    resolveRole,
    inviteTaskCollaborator,
    inviteRole,
    inviteFriendId,
    availableFriends,
    friends.length,
  ]);

  const handleCollaboratorRoleChange = useCallback(
    async (collaborator: TaskCollaborator, role: CollaboratorRole) => {
      if (collaborator.role === role) {
        return;
      }

      if (!sharingTask || resolveRole(sharingTask) !== 'owner') {
        setCollaboratorError('Only owners can update collaborator roles.');
        return;
      }

      setCollaboratorActionId(collaborator.id);
      setCollaboratorError(null);

      const result = await updateTaskCollaboratorRole(collaborator.id, role);

      if ('error' in result) {
        setCollaboratorError(result.error);
      } else {
        setCollaborators(prev => {
          const ownerRows = prev.filter(entry => entry.is_owner);
          const others = prev.filter(entry => !entry.is_owner && entry.id !== collaborator.id);
          return orderCollaborators([...ownerRows, ...others, result.collaborator]);
        });
      }

      setCollaboratorActionId(null);
    },
    [resolveRole, sharingTask, updateTaskCollaboratorRole],
  );

  const handleRemoveCollaborator = useCallback(
    async (collaborator: TaskCollaborator) => {
      if (collaborator.is_owner) {
        return;
      }

      setCollaboratorActionId(collaborator.id);
      setCollaboratorError(null);

      const result = await removeTaskCollaborator(collaborator.id);

      if (result && 'error' in result && result.error) {
        setCollaboratorError(result.error);
        setCollaboratorActionId(null);
        return;
      }

      setCollaborators(prev => prev.filter(entry => entry.id !== collaborator.id));
      setCollaboratorActionId(null);

      if (sharingTask && user && collaborator.user_id === user.id) {
        handleCloseShareTask();
      }
    },
    [removeTaskCollaborator, sharingTask, user, handleCloseShareTask],
  );

  return {
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
    resolveRole,
    handleOpenShareTask,
    handleCloseShareTask,
    handleInviteCollaborator,
    handleCollaboratorRoleChange,
    handleRemoveCollaborator,
  };
}
