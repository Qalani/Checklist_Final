'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Plus,
  Clock,
  Sparkles,
  Bell,
  Share2,
  UserPlus,
  UserMinus,
  Shield,
  Loader2,
  Users,
  X,
} from 'lucide-react';
import TaskBentoGrid from '@/components/TaskBentoGrid';
import TaskForm from '@/components/TaskForm';
import CategoryManager from '@/components/CategoryManager';
import ProgressDashboard from '@/components/ProgressDashboard';
import type { Task, TaskCollaborator } from '@/types';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ParallaxBackground from '@/components/ParallaxBackground';
import ZenPageHeader from '@/components/ZenPageHeader';
import AccountSummary from '@/components/AccountSummary';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useRouter } from 'next/navigation';
import { useFriends } from '@/features/friends/useFriends';

type CollaboratorRole = 'viewer' | 'editor';

const COLLABORATOR_ROLES: CollaboratorRole[] = ['viewer', 'editor'];

const ROLE_LABELS: Record<'owner' | CollaboratorRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_ORDER: Record<'owner' | CollaboratorRole, number> = {
  owner: 0,
  editor: 1,
  viewer: 2,
};

function orderCollaborators(collaborators: TaskCollaborator[]): TaskCollaborator[] {
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

export default function HomePage() {
  const router = useRouter();
  const { user, authChecked, signOut } = useAuthSession();
  const [taskTab, setTaskTab] = useState<'active' | 'completed'>('active');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported' | 'pending'
  >('pending');
  const reminderTimeoutsRef = useRef<Map<string, number>>(new Map());
  const triggeredRemindersRef = useRef<Map<string, string>>(new Map());
  const [sharingTask, setSharingTask] = useState<Task | null>(null);
  const [collaborators, setCollaborators] = useState<TaskCollaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [collaboratorError, setCollaboratorError] = useState<string | null>(null);
  const [inviteFriendId, setInviteFriendId] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>('viewer');
  const [collaboratorSubmitting, setCollaboratorSubmitting] = useState(false);
  const [collaboratorActionId, setCollaboratorActionId] = useState<string | null>(null);
  const resolveRole = useCallback((task: Task): 'owner' | CollaboratorRole => task.access_role ?? 'owner', []);

  const { friends } = useFriends(user?.id ?? null);

  const availableFriends = useMemo(() => {
    const collaboratorEmails = new Set(
      collaborators
        .map(collaborator => collaborator.user_email?.toLowerCase())
        .filter((email): email is string => Boolean(email && email.trim())),
    );

    return friends.filter(friend => !collaboratorEmails.has(friend.friend_email.toLowerCase()));
  }, [collaborators, friends]);

  const {
    tasks,
    categories,
    status,
    syncing,
    error: syncError,
    saveTask,
    deleteTask,
    toggleTask,
    reorderTasks,
    createCategory,
    updateCategory,
    deleteCategory,
    loadTaskCollaborators,
    inviteTaskCollaborator,
    updateTaskCollaboratorRole,
    removeTaskCollaborator,
  } = useChecklist(user?.id ?? null);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  const checklistError = syncError;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    const NotificationAPI = window.Notification;

    if (!NotificationAPI) {
      setNotificationPermission('unsupported');
      return;
    }

    setNotificationPermission(NotificationAPI.permission);
  }, []);

  useEffect(() => {
    if (!user) {
      setShowTaskForm(false);
      setEditingTask(null);
      setFilterPriority(null);
      setFilterCategory(null);
    }
  }, [user]);

  const handleTaskSave = useCallback(
    async (taskData: Partial<Task>, existingTask?: Task | null): Promise<{ error?: string } | void> => {
      const result = await saveTask(taskData, existingTask ?? null);
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        return result;
      }

      setShowTaskForm(false);
      setEditingTask(null);
    },
    [saveTask],
  );

  const handleCategoryCreate = useCallback(
    async (input: { name: string; color: string }) => {
      return createCategory(input);
    },
    [createCategory],
  );

  const handleCategoryUpdate = useCallback(
    async (id: string, input: { name: string; color: string }) => {
      await updateCategory(id, input);
    },
    [updateCategory],
  );

  const handleCategoryDelete = useCallback(
    async (id: string) => {
      await deleteCategory(id);
    },
    [deleteCategory],
  );

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

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    const NotificationAPI = window.Notification;

    if (!NotificationAPI) {
      setNotificationPermission('unsupported');
      return;
    }

    try {
      const permission = await NotificationAPI.requestPermission();
      setNotificationPermission(permission);
    } catch (error) {
      console.error('Failed to request notification permission', error);
    }
  }, []);

  const showTaskCompletionNotification = useCallback(
    (taskTitle: string) => {
      if (notificationPermission !== 'granted' || typeof window === 'undefined' || !('Notification' in window)) {
        return;
      }

      const NotificationAPI = window.Notification;

      if (!NotificationAPI) {
        return;
      }

      try {
        const notification = new NotificationAPI('Task completed', {
          body: `Nice work! "${taskTitle}" is done.`,
        });

        setTimeout(() => {
          notification.close();
        }, 5000);
      } catch (error) {
        console.error('Unable to display notification', error);
      }
    },
    [notificationPermission],
  );

  const showTaskReminderNotification = useCallback(
    (taskId: string, taskTitle: string, dueDate: Date) => {
      if (notificationPermission !== 'granted' || typeof window === 'undefined' || !('Notification' in window)) {
        return;
      }

      const NotificationAPI = window.Notification;

      if (!NotificationAPI) {
        return;
      }

      try {
        const notification = new NotificationAPI('Task reminder', {
          body: `"${taskTitle}" is due ${dueDate.toLocaleString()}.`,
          tag: `task-reminder-${taskId}`,
        });

        setTimeout(() => {
          notification.close();
        }, 8000);
      } catch (error) {
        console.error('Unable to display reminder notification', error);
      }
    },
    [notificationPermission],
  );

  useEffect(() => {
    const registry = reminderTimeoutsRef.current;

    return () => {
      if (typeof window === 'undefined') {
        return;
      }
      registry.forEach(timeoutId => window.clearTimeout(timeoutId));
      registry.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    const registry = reminderTimeoutsRef.current;
    registry.forEach(timeoutId => {
      window.clearTimeout(timeoutId);
    });
    registry.clear();

    const triggered = triggeredRemindersRef.current;

    if (notificationPermission !== 'granted') {
      triggered.clear();
      return;
    }

    const taskIds = new Set(tasks.map(task => task.id));
    triggered.forEach((_signature, id) => {
      if (!taskIds.has(id)) {
        triggered.delete(id);
      }
    });

    tasks.forEach(task => {
      if (
        !task.due_date ||
        task.completed ||
        task.reminder_minutes_before === null ||
        typeof task.reminder_minutes_before === 'undefined'
      ) {
        triggered.delete(task.id);
        return;
      }

      const dueTime = new Date(task.due_date).getTime();

      if (Number.isNaN(dueTime)) {
        triggered.delete(task.id);
        return;
      }

      const reminderTime = dueTime - task.reminder_minutes_before * 60_000;
      const delay = reminderTime - Date.now();
      const signature = `${dueTime}-${task.reminder_minutes_before}`;

      if (delay <= 0) {
        if (triggered.get(task.id) !== signature) {
          triggered.set(task.id, signature);
          showTaskReminderNotification(task.id, task.title, new Date(dueTime));
        }
        return;
      }

      const timeoutId = window.setTimeout(() => {
        triggered.set(task.id, signature);
        showTaskReminderNotification(task.id, task.title, new Date(dueTime));
        registry.delete(task.id);
      }, delay);

      registry.set(task.id, timeoutId);
    });

    return () => {
      registry.forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      registry.clear();
    };
  }, [notificationPermission, showTaskReminderNotification, tasks]);

  const handleToggleTask = useCallback(
    async (id: string, completed: boolean) => {
      const task = tasks.find(currentTask => currentTask.id === id);
      await toggleTask(id, completed);

      if (completed && task) {
        showTaskCompletionNotification(task.title);
      }
    },
    [showTaskCompletionNotification, tasks, toggleTask],
  );

  if (!authChecked) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
        <ParallaxBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-sage-200 border-t-sage-600" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
        <ParallaxBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-sage-200 border-t-sage-600" />
        </div>
      </div>
    );
  }

  const filteredTasks = tasks.filter(task => {
    if (filterPriority && task.priority !== filterPriority) return false;
    if (filterCategory && task.category !== filterCategory) return false;
    return true;
  });

  const activeTasks = filteredTasks.filter(task => !task.completed);
  const completedTasks = filteredTasks.filter(task => task.completed);
  const displayedTasks = taskTab === 'active' ? activeTasks : completedTasks;

  const taskTabDetails = taskTab === 'active'
    ? {
        title: 'Active tasks',
        description:
          activeTasks.length === 0
            ? 'You’re all caught up. Create a task to keep your momentum.'
            : 'Stay focused on the work in progress and keep your flow going.',
        icon: Circle,
        badgeClassName: 'bg-sage-100 text-sage-700 border border-sage-200',
      }
    : {
        title: 'Completed tasks',
        description:
          completedTasks.length === 0
            ? 'No completed tasks yet. Wrap up an item to celebrate progress.'
            : 'Celebrate the wins behind you and review what’s been finished.',
        icon: CheckCircle2,
        badgeClassName: 'bg-zen-100 text-zen-700 border border-zen-200',
      };
  const TaskTabIcon = taskTabDetails.icon;

  const isLoading = status === 'loading';

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 min-h-screen">
        <ZenPageHeader
          title="Zen Tasks"
          subtitle="Your mindful workspace"
          icon={Sparkles}
          backHref="/"
          actions={
            <>
              <ThemeSwitcher />
              <button
                onClick={() => {
                  setEditingTask(null);
                  setShowTaskForm(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sage-600 px-4 py-2 font-medium text-white shadow-medium transition-all hover:bg-sage-700 hover:shadow-lift sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                New Task
              </button>
              {notificationPermission === 'default' ? (
                <button
                  onClick={() => {
                    void requestNotificationPermission();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-zen-200 bg-surface/80 px-3 py-2 text-sm font-medium text-zen-600 transition-all hover:border-sage-200 hover:bg-sage-50 sm:w-auto"
                >
                  <Bell className="h-4 w-4" />
                  Enable notifications
                </button>
              ) : null}
              {notificationPermission === 'denied' ? (
                <div className="w-full rounded-xl border border-zen-200 bg-surface/60 px-3 py-2 text-center text-xs text-zen-500 sm:w-auto">
                  Notifications disabled in browser settings
                </div>
              ) : null}
              {notificationPermission === 'granted' ? (
                <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-sage-200 bg-surface/70 px-3 py-2 text-sm text-sage-700 sm:w-auto">
                  <Bell className="h-4 w-4" />
                  Notifications on
                </div>
              ) : null}
              <div className="hidden h-8 w-px bg-zen-200 xl:block" />
              <AccountSummary email={user.email} syncing={syncing} onSignOut={signOut} />
            </>
          }
          footer={
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setFilterPriority(null)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  !filterPriority
                    ? 'bg-sage-100 text-sage-700'
                    : 'bg-zen-100 text-zen-600 hover:bg-zen-200'
                }`}
              >
                All
              </button>
              {['high', 'medium', 'low'].map(priority => (
                <button
                  key={priority}
                  onClick={() => setFilterPriority(priority)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                    filterPriority === priority
                      ? 'bg-sage-100 text-sage-700'
                      : 'bg-zen-100 text-zen-600 hover:bg-zen-200'
                  }`}
                >
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </button>
              ))}
            </div>
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {checklistError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {checklistError}
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-sage-200 border-t-sage-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 items-start">
            <section className="space-y-4">
              <div className="rounded-3xl border border-zen-200 bg-surface/90 shadow-soft p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zen-400">Task focus</span>
                    <h2 className="text-2xl font-semibold text-zen-900">{taskTabDetails.title}</h2>
                    <p className="text-sm text-zen-600 max-w-xl">{taskTabDetails.description}</p>
                  </div>
                  <div
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${taskTabDetails.badgeClassName}`}
                  >
                    <TaskTabIcon className="h-4 w-4" />
                    {taskTab === 'active'
                      ? `${activeTasks.length} active ${activeTasks.length === 1 ? 'task' : 'tasks'}`
                      : `${completedTasks.length} completed ${completedTasks.length === 1 ? 'task' : 'tasks'}`}
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-1 p-1 bg-surface/70 border border-zen-200 rounded-xl shadow-soft">
                    {[
                      { key: 'active' as const, label: `Active (${activeTasks.length})` },
                      { key: 'completed' as const, label: `Completed (${completedTasks.length})` },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setTaskTab(tab.key)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          taskTab === tab.key
                            ? 'bg-sage-100 text-sage-700 shadow-soft'
                            : 'text-zen-600 hover:bg-zen-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zen-500">
                    <span className="hidden sm:inline">Drag and drop to reorder tasks</span>
                    <span className="sm:hidden">Drag to reorder</span>
                  </div>
                </div>

                <div className="mt-6">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={taskTab}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -16 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                      <TaskBentoGrid
                        tasks={displayedTasks}
                        categories={categories}
                        onEdit={(task) => {
                          setEditingTask(task);
                          setShowTaskForm(true);
                        }}
                        onDelete={(id) => {
                          void deleteTask(id);
                        }}
                        onToggle={(id, completed) => {
                          void handleToggleTask(id, completed);
                        }}
                        onReorder={(reorderedTasks) => {
                          void reorderTasks(reorderedTasks);
                        }}
                        onManageAccess={(task) => {
                          void handleOpenShareTask(task);
                        }}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <ProgressDashboard tasks={tasks} categories={categories} />
              <CategoryManager
                categories={categories}
                onCreateCategory={handleCategoryCreate}
                onUpdateCategory={handleCategoryUpdate}
                onDeleteCategory={handleCategoryDelete}
              />
            </aside>
          </div>
        )}
        </main>

        <AnimatePresence>
          {showTaskForm && (
            <TaskForm
              task={editingTask}
              categories={categories}
              onCreateCategory={handleCategoryCreate}
              onClose={() => {
                setShowTaskForm(false);
                setEditingTask(null);
              }}
              onSave={(taskData) => handleTaskSave(taskData, editingTask)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {sharingTask && (
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
                    <h2 className="text-xl font-semibold text-zen-900">Manage “{sharingTask.title}”</h2>
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
                          const isCurrentUser = collaborator.user_id === user?.id;
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
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
