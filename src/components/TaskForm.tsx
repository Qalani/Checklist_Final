'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Save, PlusCircle } from 'lucide-react';
import type { Task, Category } from '@/types';

interface TaskFormProps {
  task: Task | null;
  categories: Category[];
  onCreateCategory: (input: { name: string; color: string }) => Promise<Category>;
  onClose: () => void;
  onSave: (task: Partial<Task>) => Promise<{ error?: string } | void>;
}

const PRESET_COLORS = [
  '#5a7a5a',
  '#7a957a',
  '#a89478',
  '#8b7961',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#6b7280',
];

function extractMessage(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

export default function TaskForm({
  task,
  categories,
  onCreateCategory,
  onClose,
  onSave,
}: TaskFormProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(task?.priority || 'medium');
  const [category, setCategory] = useState(task?.category || categories[0]?.name || '');
  const [categoryColor, setCategoryColor] = useState(task?.category_color || categories[0]?.color || '#5a7a5a');
  const [isCreatingCategory, setIsCreatingCategory] = useState(categories.length === 0);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(PRESET_COLORS[0]);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const selectedCat = categories.find(c => c.name === category);
    if (selectedCat) {
      setCategoryColor(selectedCat.color);
    }
  }, [category, categories]);

  useEffect(() => {
    if (!task && !isCreatingCategory && !category && categories[0]) {
      setCategory(categories[0].name);
      setCategoryColor(categories[0].color);
    }
  }, [categories, category, isCreatingCategory, task]);

  const handleCategorySelection = (value: string) => {
    if (value === '__create__') {
      setIsCreatingCategory(true);
      setCategory('');
      setNewCategoryName('');
      setNewCategoryColor(PRESET_COLORS[0]);
      setCategoryError(null);
      return;
    }

    setIsCreatingCategory(false);
    setCategory(value);
    setCategoryError(null);
  };

  const handleCreateCategory = async () => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName || isSavingCategory) {
      return;
    }

    if (categories.some(existing => existing.name.toLowerCase() === trimmedName.toLowerCase())) {
      setCategoryError('You already have a category with that name.');
      return;
    }

    setIsSavingCategory(true);
    setCategoryError(null);

    try {
      const savedCategory = await onCreateCategory({
        name: trimmedName,
        color: newCategoryColor,
      });

      setCategory(savedCategory.name);
      setCategoryColor(savedCategory.color);
      setIsCreatingCategory(false);
      setNewCategoryName('');
      setNewCategoryColor(PRESET_COLORS[0]);
      setCategoryError(null);
    } catch (error) {
      console.error('Error creating category', error);
      setCategoryError(extractMessage(error, 'Unable to save category. Please try again.'));
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (isCreatingCategory || !category) return;

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const result = await onSave({
        title: title.trim(),
        description: description.trim(),
        priority: priority,
        category,
        category_color: categoryColor,
        completed: task?.completed || false,
      });

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        if (!isMountedRef.current) {
          return;
        }
        setFormError(result.error);
        return;
      }
    } catch (error) {
      console.error('Error saving task', error);
      if (!isMountedRef.current) {
        return;
      }
      setFormError('Unable to save task. Please try again.');
      return;
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-lift max-w-lg w-full p-8 border border-zen-200"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-zen-900">
            {task ? 'Edit Task' : 'New Task'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-zen-100 transition-colors"
          >
            <X className="w-5 h-5 text-zen-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-zen-700 mb-2">
              Task Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-4 py-3 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zen-700 mb-2">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zen-700 mb-2">
              Priority
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-2 px-4 rounded-xl font-medium text-sm transition-all ${
                    priority === p
                      ? 'bg-sage-600 text-white shadow-medium'
                      : 'bg-zen-100 text-zen-700 hover:bg-zen-200'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zen-700 mb-2">
                Category
              </label>
              <select
                value={isCreatingCategory ? '__create__' : category}
                onChange={(e) => handleCategorySelection(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none transition-colors"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
                <option value="__create__">+ Create new category</option>
              </select>
            </div>

            {isCreatingCategory && (
              <div className="rounded-2xl border border-dashed border-sage-300 bg-sage-50/50 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-sage-700 mb-1">
                      New category name
                    </label>
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Wellness"
                      className="w-full px-3 py-2 rounded-xl border-2 border-sage-200 focus:border-sage-500 focus:ring-0 outline-none text-sm"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sage-700 mb-2">
                    Color
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCategoryColor(color)}
                        className={`w-8 h-8 rounded-xl transition-all ${
                          newCategoryColor === color ? 'ring-2 ring-offset-2 ring-sage-600' : ''
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={isSavingCategory}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sage-600 text-white text-sm font-medium hover:bg-sage-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <PlusCircle className="w-4 h-4" />
                  {isSavingCategory ? 'Creating...' : 'Create Category'}
                </button>
                {categoryError && (
                  <p className="text-sm text-red-600 text-center">{categoryError}</p>
                )}
              </div>
            )}
          </div>

          {formError && (
            <p className="text-sm text-red-600 text-center">{formError}</p>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl font-medium text-zen-700 bg-zen-100 hover:bg-zen-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-sage-600 hover:bg-sage-700 shadow-medium hover:shadow-lift transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save Task'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
