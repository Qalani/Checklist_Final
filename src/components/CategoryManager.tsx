'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, Plus, X, Edit2 } from 'lucide-react';
import type { Category } from '@/types';

interface CategoryManagerProps {
  categories: Category[];
  onCreateCategory: (input: { name: string; color: string }) => Promise<Category>;
  onUpdateCategory: (id: string, input: { name: string; color: string }) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
}

const PRESET_COLORS = [
  '#5a7a5a', '#7a957a', '#a89478', '#8b7961',
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#06b6d4', '#6b7280'
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

export default function CategoryManager({
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}: CategoryManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedNames = useMemo(() =>
    new Set(categories.map((category) => category.name.trim().toLowerCase()))
  , [categories]);

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName || isSaving) return;

    const normalized = trimmedName.toLowerCase();
    if (normalizedNames.has(normalized)) {
      setError('You already have a category with that name.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onCreateCategory({
        name: trimmedName,
        color: newColor,
      });

      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setIsAdding(false);
      setError(null);
    } catch (insertError) {
      console.error('Error inserting category', insertError);
      setError(extractMessage(insertError, 'Unable to save category. Please try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (id: string, name: string, color: string): Promise<boolean> => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Category name is required.');
      setEditingId(id);
      return false;
    }

    const normalized = trimmedName.toLowerCase();
    const hasDuplicate = categories.some((category) => (
      category.id !== id && category.name.trim().toLowerCase() === normalized
    ));

    if (hasDuplicate) {
      setError('You already have a category with that name.');
      setEditingId(id);
      return false;
    }

    try {
      await onUpdateCategory(id, { name: trimmedName, color });
      setEditingId(null);
      setError(null);
      return true;
    } catch (updateError) {
      console.error('Error updating category', updateError);
      setError(extractMessage(updateError, 'Unable to update category. Please try again.'));
      setEditingId(id);
      return false;
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this category? Tasks will keep this label.')) {
      try {
        await onDeleteCategory(id);
        setError(null);
      } catch (deleteError) {
        console.error('Error deleting category', deleteError);
        setError(extractMessage(deleteError, 'Unable to delete category. Please try again.'));
      }
    }
  };

  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft border border-zen-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-sage-600" />
          <h2 className="text-lg font-semibold text-zen-900">Categories</h2>
        </div>
        <button
          onClick={() => {
            if (!isAdding) {
              setError(null);
              setNewName('');
              setNewColor(PRESET_COLORS[0]);
            }
            setIsAdding(!isAdding);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-sage-100 transition-colors text-sage-600"
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 pb-3 border-b border-zen-200"
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Category name"
                className="w-full px-3 py-2 rounded-lg border-2 border-zen-200 focus:border-sage-500 outline-none text-sm"
                autoFocus
              />
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`w-8 h-8 rounded-full transition-all ${
                      newColor === color ? 'ring-2 ring-sage-600 ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <button
                onClick={handleAdd}
                disabled={isSaving}
                className="w-full py-2 bg-sage-600 text-white rounded-lg hover:bg-sage-700 transition-colors font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Add Category'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {categories.map((category) => (
          <motion.div
            key={category.id}
            layout
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-zen-50 transition-colors group"
          >
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: category.color }}
            />
            
            {editingId === category.id ? (
              <input
                type="text"
                defaultValue={category.name}
                onBlur={(e) => {
                  const input = e.currentTarget;
                  const value = input.value;
                  handleUpdate(category.id, value, category.color).then((success) => {
                    if (!success) {
                      requestAnimationFrame(() => input.focus());
                    }
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const input = e.currentTarget;
                    const value = input.value;
                    handleUpdate(category.id, value, category.color).then((success) => {
                      if (!success) {
                        requestAnimationFrame(() => input.focus());
                      }
                    });
                  }
                }}
                className="flex-1 px-2 py-1 rounded border border-sage-300 outline-none text-sm"
                autoFocus
              />
            ) : (
              <span className="flex-1 text-sm font-medium text-zen-700">
                {category.name}
              </span>
            )}

            <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setEditingId(editingId === category.id ? null : category.id)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-zen-200 transition-colors"
              >
                <Edit2 className="w-3 h-3 text-zen-600" />
              </button>
              <button
                onClick={() => handleDelete(category.id)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-red-100 transition-colors"
              >
                <X className="w-3 h-3 text-red-600" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
