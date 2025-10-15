'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Plus, 
  LayoutGrid, 
  List, 
  Filter,
  TrendingUp,
  Calendar,
  Clock,
  Sparkles
} from 'lucide-react';
import TaskBentoGrid from '@/components/TaskBentoGrid';
import TaskListView from '@/components/TaskListView';
import TaskForm from '@/components/TaskForm';
import CategoryManager from '@/components/CategoryManager';
import ProgressDashboard from '@/components/ProgressDashboard';
import QuickStats from '@/components/QuickStats';
import { supabase } from '@/lib/supabase';
import type { Task, Category } from '@/types';
import type { User } from '@supabase/supabase-js';
import AuthPanel from '@/components/AuthPanel';

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadTasks = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('order', { ascending: true });

    if (error) {
      console.error('Error loading tasks', error);
      return;
    }

    if (data) setTasks(data);
  }, []);

  const loadCategories = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading categories', error);
      return;
    }

    if (data) setCategories(data);
  }, []);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setUser(data.session?.user ?? null);
        setAuthChecked(true);
      })
      .catch((error) => {
        if (!isMounted) return;
        console.error('Error fetching auth session', error);
        setAuthChecked(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      setCategories([]);
      setIsLoading(false);
      setShowTaskForm(false);
      setEditingTask(null);
      return;
    }

    let isActive = true;

    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([loadTasks(user.id), loadCategories(user.id)]);
      if (isActive) {
        setIsLoading(false);
      }
    };

    loadData();

    const tasksSubscription = supabase
      .channel(`tasks-user-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        loadTasks(user.id);
      })
      .subscribe();

    const categoriesSubscription = supabase
      .channel(`categories-user-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        loadCategories(user.id);
      })
      .subscribe();

    return () => {
      isActive = false;
      tasksSubscription.unsubscribe();
      categoriesSubscription.unsubscribe();
    };
  }, [user, loadTasks, loadCategories]);

  const userId = user?.id;

  const handleCategoryCreated = useCallback(async (createdCategory: Category) => {
    setCategories((prev) => {
      const existingIndex = prev.findIndex((category) => category.id === createdCategory.id);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = createdCategory;
        return updated;
      }
      return [...prev, createdCategory];
    });

    if (!userId) {
      return;
    }

    await loadCategories(userId);
  }, [loadCategories, userId]);

  const handleTaskSave = useCallback(
    async (taskData: Partial<Task>, existingTask?: Task | null): Promise<{ error?: string } | void> => {
      if (!userId) {
        return { error: 'You must be signed in to add tasks.' };
      }

      try {
        if (existingTask) {
          const { error } = await supabase
            .from('tasks')
            .update(taskData)
            .eq('id', existingTask.id)
            .eq('user_id', userId);

          if (error) {
            console.error('Error updating task', error);
            return { error: error.message ?? 'Unable to save task. Please try again.' };
          }
        } else {
          const { data: sessionResult } = await supabase.auth.getSession();

          if (!sessionResult.session) {
            return { error: 'You must be signed in to add tasks.' };
          }

          const nextOrder = tasks.reduce((max, current) => Math.max(max, current.order ?? 0), -1) + 1;

          const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionResult.session.access_token}`,
            },
            body: JSON.stringify({
              ...taskData,
              order: nextOrder,
            }),
          });

          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            const message =
              typeof (payload as { error?: unknown })?.error === 'string'
                ? (payload as { error?: string }).error
                : 'Unable to save task. Please try again.';
            return { error: message };
          }

          const savedTask =
            payload && typeof payload === 'object'
              ? (payload as { task?: Task }).task
              : undefined;

          if (!savedTask) {
            return { error: 'Unable to save task. Please try again.' };
          }

          setTasks((prev) => {
            const next = [...prev, savedTask];
            return next.sort((a, b) => a.order - b.order);
          });
        }

        await loadTasks(userId);
        setShowTaskForm(false);
        setEditingTask(null);
      } catch (error) {
        console.error('Error saving task', error);
        return { error: 'Unable to save task. Please try again.' };
      }
    },
    [loadTasks, tasks, userId],
  );

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sage-200 border-t-sage-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50 flex flex-col">
        <header className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 flex items-center justify-center shadow-medium">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-zen-900">Zen Tasks</h1>
              <p className="text-sm text-zen-600">Your mindful workspace</p>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 px-4 sm:px-6 lg:px-8 pb-12">
          <div className="max-w-xl text-center lg:text-left space-y-4">
            <h2 className="text-3xl font-semibold text-zen-900">
              Stay organized with mindful task management
            </h2>
            <p className="text-zen-600 text-base">
              Create an account or sign in to sync your tasks and categories securely across devices.
            </p>
          </div>
          <AuthPanel />
        </main>
      </div>
    );
  }

  const activeUserId = userId!;

  const filteredTasks = tasks.filter(task => {
    if (filterPriority && task.priority !== filterPriority) return false;
    if (filterCategory && task.category !== filterCategory) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-zen-200 shadow-soft">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 flex items-center justify-center shadow-medium">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-zen-900">Zen Tasks</h1>
                <p className="text-sm text-zen-600">Your mindful workspace</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap justify-end">
              <div className="flex items-center gap-1 p-1 bg-zen-100 rounded-xl">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white shadow-soft text-sage-600'
                      : 'text-zen-500 hover:text-zen-700'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'list' 
                      ? 'bg-white shadow-soft text-sage-600' 
                      : 'text-zen-500 hover:text-zen-700'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={() => {
                  setEditingTask(null);
                  setShowTaskForm(true);
                }}
                className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-xl shadow-medium hover:shadow-lift transition-all flex items-center gap-2 font-medium"
              >
                <Plus className="w-4 h-4" />
                New Task
              </button>

              <div className="hidden xl:block h-8 w-px bg-zen-200" />

              <div className="flex items-center gap-3 px-3 py-2 bg-white/70 border border-zen-200 rounded-2xl shadow-soft">
                <div className="text-right">
                  <p className="text-sm font-medium text-zen-900">{user.email ?? 'Account'}</p>
                  <p className="text-xs text-zen-500">Signed in</p>
                </div>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-zen-100 hover:bg-zen-200 text-xs font-semibold text-zen-700 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button
              onClick={() => setFilterPriority(null)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
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
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterPriority === priority 
                    ? 'bg-sage-100 text-sage-700' 
                    : 'bg-zen-100 text-zen-600 hover:bg-zen-200'
                }`}
              >
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              <AnimatePresence mode="wait">
                {viewMode === 'grid' ? (
                  <TaskBentoGrid
                    key="grid"
                    tasks={filteredTasks}
                    categories={categories}
                    onEdit={(task) => {
                      setEditingTask(task);
                      setShowTaskForm(true);
                    }}
                    onDelete={async (id) => {
                      await supabase
                        .from('tasks')
                        .delete()
                        .eq('id', id)
                        .eq('user_id', activeUserId);
                      await loadTasks(activeUserId);
                    }}
                    onToggle={async (id, completed) => {
                      await supabase
                        .from('tasks')
                        .update({ completed })
                        .eq('id', id)
                        .eq('user_id', activeUserId);
                      await loadTasks(activeUserId);
                    }}
                    onReorder={async (reorderedTasks) => {
                      setTasks(reorderedTasks);
                      for (let i = 0; i < reorderedTasks.length; i++) {
                        await supabase
                            .from('tasks')
                            .update({ order: i })
                            .eq('id', reorderedTasks[i].id)
                            .eq('user_id', activeUserId);
                      }
                      await loadTasks(activeUserId);
                    }}
                  />
                ) : (
                  <TaskListView
                    key="list"
                    tasks={filteredTasks}
                    categories={categories}
                    onEdit={(task) => {
                      setEditingTask(task);
                      setShowTaskForm(true);
                    }}
                    onDelete={async (id) => {
                      await supabase
                        .from('tasks')
                        .delete()
                        .eq('id', id)
                        .eq('user_id', activeUserId);
                      await loadTasks(activeUserId);
                    }}
                    onToggle={async (id, completed) => {
                      await supabase
                        .from('tasks')
                        .update({ completed })
                        .eq('id', id)
                        .eq('user_id', activeUserId);
                      await loadTasks(activeUserId);
                    }}
                  />
                )}
              </AnimatePresence>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <ProgressDashboard tasks={tasks} categories={categories} />
              <CategoryManager
                categories={categories}
                onUpdate={() => loadCategories(activeUserId)}
                onCategoryCreated={handleCategoryCreated}
                userId={activeUserId}
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
            userId={activeUserId}
            onCategoryCreated={handleCategoryCreated}
            onClose={() => {
              setShowTaskForm(false);
              setEditingTask(null);
            }}
            onSave={(taskData) => handleTaskSave(taskData, editingTask)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
