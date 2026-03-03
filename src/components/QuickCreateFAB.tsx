'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { fetchCategories } from '@/features/checklist/ChecklistManager';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/local-db';
import { enqueue } from '@/lib/sync-queue';
import { isOnline } from '@/lib/network-status';
import type { Category } from '@/types';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

/**
 * Floating action button for fast task capture from anywhere in the app.
 *
 * Opens a compact modal — title + priority + category — and saves directly
 * to Supabase (or the offline sync queue). Hidden on pages where full task
 * creation already exists (Tasks) and on public/auth pages.
 */
export function QuickCreateFAB() {
  const pathname = usePathname();
  const { user } = useAuthSession();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Pages where the FAB should be hidden
  const hidden =
    !user ||
    pathname === '/tasks' ||
    pathname?.startsWith('/lists/share') ||
    pathname === '/';

  // Load the user's categories when the modal opens
  useEffect(() => {
    if (!open || !user?.id) return;
    void fetchCategories(user.id).then((cats) => {
      setCategories(cats);
      setSelectedCategory(cats[0] ?? null);
    });
  }, [open, user?.id]);

  // Focus the title input when the modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setTitle('');
    setPriority('medium');
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) {
        setError('Please enter a task title.');
        return;
      }
      if (!user?.id) return;

      setSubmitting(true);
      setError(null);

      try {
        const category = selectedCategory?.name ?? '';
        const category_color = selectedCategory?.color ?? '#5a7a5a';

        // Compute next order from local DB
        const existingTasks = await db.tasks.where('user_id').equals(user.id).toArray();
        const nextOrder = existingTasks.reduce((max, t) => Math.max(max, t.order ?? 0), -1) + 1;

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const newTask = {
          id,
          user_id: user.id,
          title: trimmed,
          description: '',
          priority,
          category,
          category_color,
          completed: false,
          due_date: null,
          reminder_minutes_before: null,
          reminder_recurrence: null,
          reminder_next_trigger_at: null,
          reminder_snoozed_until: null,
          reminder_timezone: null,
          order: nextOrder,
          access_role: 'owner' as const,
          created_at: now,
          updated_at: now,
        };

        if (!isOnline()) {
          await db.tasks.put(newTask);
          await enqueue({ table_name: 'tasks', operation: 'INSERT', payload: newTask });
        } else {
          const { error: insertError } = await supabase.from('tasks').insert(newTask);
          if (insertError) throw new Error(insertError.message);
        }

        setOpen(false);
        setTitle('');
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create task.');
      } finally {
        setSubmitting(false);
      }
    },
    [title, priority, selectedCategory, user],
  );

  // Dismiss on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  if (hidden) return null;

  return (
    <>
      {/* Success toast */}
      {showSuccess && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-xl border border-sage-200 bg-surface px-4 py-2.5 text-sm font-medium text-sage-700 shadow-lift lg:bottom-4"
        >
          <CheckCircle2 className="h-4 w-4" />
          Task created
        </div>
      )}

      {/* FAB trigger */}
      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Quick-create a new task"
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sage-500 to-zen-500 text-white shadow-lift transition hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2 lg:bottom-6"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

      {/* Quick-create modal backdrop + panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-zen-900/20 backdrop-blur-sm"
            aria-hidden="true"
            onClick={handleClose}
          />

          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-create-title"
            className="fixed bottom-20 right-4 z-50 w-80 rounded-3xl border border-zen-200/70 bg-surface/95 shadow-lift backdrop-blur-xl dark:border-zen-700/40 lg:bottom-6"
          >
            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <h2
                  id="quick-create-title"
                  className="text-sm font-semibold text-zen-900"
                >
                  New task
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close quick-create"
                  className="rounded-lg p-1 text-zen-400 hover:text-zen-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Title */}
              <input
                ref={titleRef}
                type="text"
                placeholder="What needs doing?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={500}
                className="w-full rounded-xl border border-zen-200/80 bg-zen-50/50 px-3 py-2.5 text-sm text-zen-900 placeholder:text-zen-400 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-100"
                aria-label="Task title"
              />

              {/* Priority */}
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs font-medium text-zen-500">Priority</span>
                <div className="flex gap-1.5">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPriority(opt.value)}
                      aria-pressed={priority === opt.value}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        priority === opt.value
                          ? 'bg-sage-500 text-white'
                          : 'bg-zen-100/80 text-zen-600 hover:bg-zen-200/80 dark:bg-zen-800/50 dark:text-zen-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category (if user has categories) */}
              {categories.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-medium text-zen-500">Category</span>
                  <select
                    value={selectedCategory?.id ?? ''}
                    onChange={(e) => {
                      const cat = categories.find((c) => c.id === e.target.value) ?? null;
                      setSelectedCategory(cat);
                    }}
                    className="flex-1 rounded-xl border border-zen-200/80 bg-zen-50/50 px-2.5 py-1.5 text-xs text-zen-700 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-200"
                    aria-label="Task category"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-xs text-red-600" role="alert">
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-sage-500 to-zen-500 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2"
              >
                {submitting ? 'Adding…' : 'Add task'}
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
