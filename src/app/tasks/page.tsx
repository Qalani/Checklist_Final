'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Plus,
  Sparkles,
  Upload,
} from 'lucide-react';
import TaskBentoGrid from '@/components/TaskBentoGrid';
import TaskForm from '@/components/TaskForm';
import CategoryManager from '@/components/CategoryManager';
import ProgressDashboard from '@/components/ProgressDashboard';
import type { Task } from '@/types';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ParallaxBackground from '@/components/ParallaxBackground';
import ZenPageHeader from '@/components/ZenPageHeader';
import AccountSummary from '@/components/AccountSummary';
import SettingsMenu from '@/components/SettingsMenu';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useRouter } from 'next/navigation';
import { useFriends } from '@/features/friends/useFriends';
import { useTaskCollaboration } from './hooks/useTaskCollaboration';
import { useTaskReminders } from './hooks/useTaskReminders';
import TaskShareModal from './components/TaskShareModal';
import ImportTasksModal from '@/components/ImportTasksModal';

type TaskSortOption = 'custom' | 'due-asc' | 'due-desc' | 'priority' | 'title';

const TASK_SORT_OPTIONS: Array<{ value: TaskSortOption; label: string; description: string }> = [
  { value: 'custom', label: 'Custom order', description: 'Drag and drop to arrange tasks manually.' },
  { value: 'due-asc', label: 'Due date · earliest', description: 'Shows the nearest due dates first.' },
  { value: 'due-desc', label: 'Due date · latest', description: 'Shows tasks with the most distant due dates first.' },
  { value: 'priority', label: 'Priority · high → low', description: 'Groups tasks by urgency from high to low.' },
  { value: 'title', label: 'Title · A → Z', description: 'Sorts alphabetically by task title.' },
];

export default function HomePage() {
  const router = useRouter();
  const { user, authChecked, signOut } = useAuthSession();
  const [taskTab, setTaskTab] = useState<'active' | 'completed'>('active');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [inlineEditingTaskId, setInlineEditingTaskId] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [taskSort, setTaskSort] = useState<TaskSortOption>('custom');
  const [showImportModal, setShowImportModal] = useState(false);

  const { friends } = useFriends(user?.id ?? null);

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
    refresh: refreshTasks,
  } = useChecklist(user?.id ?? null);

  const {
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
  } = useTaskCollaboration({
    friends,
    user,
    loadTaskCollaborators,
    inviteTaskCollaborator,
    updateTaskCollaboratorRole,
    removeTaskCollaborator,
  });

  const {
    notificationPermission,
    requestNotificationPermission,
    handleToggleTask,
  } = useTaskReminders({ tasks, toggleTaskFn: toggleTask });

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
    if (!user) {
      setShowTaskForm(false);
      setEditingTask(null);
      setInlineEditingTaskId(null);
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
      setInlineEditingTaskId(null);
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

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filterPriority && task.priority !== filterPriority) return false;
      if (filterCategory && task.category !== filterCategory) return false;
      return true;
    });
  }, [filterCategory, filterPriority, tasks]);

  const activeTasks = useMemo(() => filteredTasks.filter(task => !task.completed), [filteredTasks]);
  const completedTasks = useMemo(() => filteredTasks.filter(task => task.completed), [filteredTasks]);
  const displayedTasks = useMemo(
    () => (taskTab === 'active' ? activeTasks : completedTasks),
    [activeTasks, completedTasks, taskTab],
  );

  const sortedDisplayedTasks = useMemo(() => {
    if (taskSort === 'custom') {
      return displayedTasks;
    }

    const fallbackOrder = new Map(displayedTasks.map((task, index) => [task.id, index]));
    const getDueTime = (task: Task) => {
      if (!task.due_date) {
        return null;
      }
      const dueTime = new Date(task.due_date).getTime();
      return Number.isNaN(dueTime) ? null : dueTime;
    };
    const priorityWeights: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 };

    const sorted = [...displayedTasks];

    sorted.sort((a, b) => {
      const fallback = (fallbackOrder.get(a.id) ?? 0) - (fallbackOrder.get(b.id) ?? 0);

      if (taskSort === 'due-asc' || taskSort === 'due-desc') {
        const dueA = getDueTime(a);
        const dueB = getDueTime(b);

        if (dueA == null && dueB == null) {
          return fallback;
        }
        if (dueA == null) {
          return taskSort === 'due-asc' ? 1 : -1;
        }
        if (dueB == null) {
          return taskSort === 'due-asc' ? -1 : 1;
        }

        const diff = taskSort === 'due-asc' ? dueA - dueB : dueB - dueA;
        return diff !== 0 ? diff : fallback;
      }

      if (taskSort === 'priority') {
        const diff = (priorityWeights[a.priority] ?? 99) - (priorityWeights[b.priority] ?? 99);
        if (diff !== 0) {
          return diff;
        }

        const dueA = getDueTime(a);
        const dueB = getDueTime(b);

        if (dueA != null && dueB != null && dueA !== dueB) {
          return dueA - dueB;
        }

        return fallback;
      }

      if (taskSort === 'title') {
        const diff = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        return diff !== 0 ? diff : fallback;
      }

      return fallback;
    });

    return sorted;
  }, [displayedTasks, taskSort]);

  const selectedTaskSortOption = TASK_SORT_OPTIONS.find(option => option.value === taskSort) ?? TASK_SORT_OPTIONS[0];
  const sortStatusText = taskSort === 'custom' ? 'Drag and drop to reorder tasks.' : selectedTaskSortOption.description;

  const taskTabDetails = taskTab === 'active'
    ? {
        title: 'Active tasks',
        description:
          activeTasks.length === 0
            ? "You're all caught up. Create a task to keep your momentum."
            : 'Stay focused on the work in progress and keep your flow going.',
        icon: Circle,
        badgeClassName: 'bg-sage-100 text-sage-700 border border-sage-200',
      }
    : {
        title: 'Completed tasks',
        description:
          completedTasks.length === 0
            ? 'No completed tasks yet. Wrap up an item to celebrate progress.'
            : "Celebrate the wins behind you and review what's been finished.",
        icon: CheckCircle2,
        badgeClassName: 'bg-zen-100 text-zen-700 border border-zen-200',
      };
  const TaskTabIcon = taskTabDetails.icon;

  const isLoading = status === 'loading';

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

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-sage-50 to-warm-50">
      <ParallaxBackground />
      <div className="relative z-10 min-h-screen">
        <ZenPageHeader
          title="Zen Tasks"
          subtitle="Structure priorities with poise"
          icon={Sparkles}
          backHref="/"
          actions={
            <>
              <ThemeSwitcher />
              <button
                onClick={() => setShowImportModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zen-200 bg-surface/80 px-4 py-2 font-medium text-zen-600 shadow-soft transition-all hover:border-zen-300 hover:text-zen-800 sm:w-auto"
              >
                <Upload className="h-4 w-4" />
                Import
              </button>
              <button
                onClick={() => {
                  setEditingTask(null);
                  setInlineEditingTaskId(null);
                  setShowTaskForm(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-zen-600 px-4 py-2 font-medium text-white shadow-medium transition-all hover:bg-zen-700 hover:shadow-lift sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                New Task
              </button>
              <SettingsMenu
                userEmail={user.email}
                onSignOut={signOut}
                notificationPermission={notificationPermission}
                onRequestNotificationPermission={() => {
                  void requestNotificationPermission();
                }}
              />
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
                    ? 'bg-zen-100 text-zen-700'
                    : 'bg-surface/80 text-zen-600 hover:bg-zen-50'
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <p className="text-sm text-zen-500">{sortStatusText}</p>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zen-400 sm:text-[0.75rem]">
                      <span>Sort</span>
                      <select
                        value={taskSort}
                        onChange={event => setTaskSort(event.target.value as TaskSortOption)}
                        className="rounded-lg border border-zen-200 bg-surface/90 px-3 py-1.5 text-sm font-medium text-zen-700 shadow-soft focus:border-sage-400 focus:outline-none"
                      >
                        {TASK_SORT_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
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
                        tasks={sortedDisplayedTasks}
                        categories={categories}
                        onEdit={(task) => {
                          setEditingTask(task);
                          setInlineEditingTaskId(task.id);
                          setShowTaskForm(false);
                        }}
                        onDelete={(id) => {
                          void deleteTask(id);
                        }}
                        onToggle={(id, completed) => {
                          void handleToggleTask(id, completed);
                        }}
                        onReorder={(reorderedTasks) => {
                          if (taskSort !== 'custom') {
                            return;
                          }
                          void reorderTasks(reorderedTasks);
                        }}
                        onManageAccess={(task) => {
                          void handleOpenShareTask(task);
                        }}
                        editingTaskId={inlineEditingTaskId}
                        onCancelEdit={() => {
                          setInlineEditingTaskId(null);
                          setEditingTask(null);
                        }}
                        onSaveEdit={(task, updates) => handleTaskSave(updates, task)}
                        onCreateCategory={handleCategoryCreate}
                        enableReorder={taskSort === 'custom'}
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
            <TaskShareModal
              sharingTask={sharingTask}
              collaborators={collaborators}
              collaboratorsLoading={collaboratorsLoading}
              collaboratorError={collaboratorError}
              setCollaboratorError={setCollaboratorError}
              inviteFriendId={inviteFriendId}
              setInviteFriendId={setInviteFriendId}
              inviteRole={inviteRole}
              setInviteRole={setInviteRole}
              collaboratorSubmitting={collaboratorSubmitting}
              collaboratorActionId={collaboratorActionId}
              availableFriends={availableFriends}
              friends={friends}
              resolveRole={resolveRole}
              handleCloseShareTask={handleCloseShareTask}
              handleInviteCollaborator={handleInviteCollaborator}
              handleCollaboratorRoleChange={handleCollaboratorRoleChange}
              handleRemoveCollaborator={handleRemoveCollaborator}
              currentUserId={user?.id}
            />
          )}
        </AnimatePresence>
      </div>

      <ImportTasksModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={() => void refreshTasks(true)}
      />
    </div>
  );
}
