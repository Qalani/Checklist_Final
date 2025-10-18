'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Plus,
  LayoutGrid,
  List,
  Clock,
  Sparkles,
  Bell,
} from 'lucide-react';
import TaskBentoGrid from '@/components/TaskBentoGrid';
import TaskListView from '@/components/TaskListView';
import TaskForm from '@/components/TaskForm';
import CategoryManager from '@/components/CategoryManager';
import ProgressDashboard from '@/components/ProgressDashboard';
import QuickStats from '@/components/QuickStats';
import type { Task, Category } from '@/types';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ParallaxBackground from '@/components/ParallaxBackground';
import ZenPageHeader from '@/components/ZenPageHeader';
import AccountSummary from '@/components/AccountSummary';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const { user, authChecked, signOut } = useAuthSession();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
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
  } = useChecklist(user?.id ?? null);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 640px)');

    const enforceGridView = (matches: boolean) => {
      if (matches) {
        setViewMode('grid');
      }
    };

    enforceGridView(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      enforceGridView(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

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
              <div className="flex items-center gap-1 rounded-xl bg-zen-100 p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'grid'
                      ? 'bg-surface shadow-soft text-sage-600'
                      : 'text-zen-500 hover:text-zen-700'
                  }`}
                  aria-label="Show tasks in grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`hidden sm:inline-flex p-2 rounded-lg transition-all ${
                    viewMode === 'list'
                      ? 'bg-surface shadow-soft text-sage-600'
                      : 'text-zen-500 hover:text-zen-700'
                  }`}
                  aria-label="Show tasks in list view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12">
              <QuickStats tasks={tasks} categories={categories} />
            </div>

            <div className="lg:col-span-8">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
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
              <AnimatePresence mode="wait">
                {viewMode === 'grid' ? (
                  <motion.div
                    key="grid"
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
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="list"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    <TaskListView
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
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <ProgressDashboard tasks={tasks} categories={categories} />
              <CategoryManager
                categories={categories}
                onCreateCategory={handleCategoryCreate}
                onUpdateCategory={handleCategoryUpdate}
                onDeleteCategory={handleCategoryDelete}
              />
            </div>
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
      </div>
    </div>
  );
}
