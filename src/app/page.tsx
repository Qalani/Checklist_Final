'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('order', { ascending: true });
    
    if (data) setTasks(data);
  };

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (data) setCategories(data);
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([loadTasks(), loadCategories()]);
      setIsLoading(false);
    };

    loadData();
    
    const tasksSubscription = supabase
      .channel('tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        loadTasks();
      })
      .subscribe();

    const categoriesSubscription = supabase
      .channel('categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        loadCategories();
      })
      .subscribe();

    return () => {
      tasksSubscription.unsubscribe();
      categoriesSubscription.unsubscribe();
    };
  }, []);

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

            <div className="flex items-center gap-3">
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
                      await supabase.from('tasks').delete().eq('id', id);
                      loadTasks();
                    }}
                    onToggle={async (id, completed) => {
                      await supabase.from('tasks').update({ completed }).eq('id', id);
                      loadTasks();
                    }}
                    onReorder={async (reorderedTasks) => {
                      setTasks(reorderedTasks);
                      for (let i = 0; i < reorderedTasks.length; i++) {
                        await supabase
                          .from('tasks')
                          .update({ order: i })
                          .eq('id', reorderedTasks[i].id);
                      }
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
                      await supabase.from('tasks').delete().eq('id', id);
                      loadTasks();
                    }}
                    onToggle={async (id, completed) => {
                      await supabase.from('tasks').update({ completed }).eq('id', id);
                      loadTasks();
                    }}
                  />
                )}
              </AnimatePresence>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <ProgressDashboard tasks={tasks} categories={categories} />
              <CategoryManager 
                categories={categories}
                onUpdate={loadCategories}
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
            onClose={() => {
              setShowTaskForm(false);
              setEditingTask(null);
            }}
            onSave={async (taskData) => {
              if (editingTask) {
                await supabase.from('tasks').update(taskData).eq('id', editingTask.id);
              } else {
                await supabase.from('tasks').insert({
                  ...taskData,
                  order: tasks.length,
                });
              }
              loadTasks();
              setShowTaskForm(false);
              setEditingTask(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
