'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, Plus, X, Edit2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/types';
import { generateLocalId, saveLocalCategories } from '@/lib/localPersistence';

interface CategoryManagerProps {
  categories: Category[];
  onUpdate: () => void | Promise<void>;
  onCategoryCreated: (category: Category) => void | Promise<void>;
  userId: string;
  isSupabaseConfigured: boolean;
}

const PRESET_COLORS = [
  '#5a7a5a', '#7a957a', '#a89478', '#8b7961',
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#06b6d4', '#6b7280'
];

export default function CategoryManager({
  categories,
  onUpdate,
  onCategoryCreated,
  userId,
  isSupabaseConfigured,
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
      if (!isSupabaseConfigured) {
        const savedCategory: Category = {
          id: generateLocalId(),
          name: trimmedName,
          color: newColor,
        };
        const updatedCategories = [...categories, savedCategory];
        saveLocalCategories(updatedCategories);
        await Promise.resolve(onCategoryCreated(savedCategory));
        setNewName('');
        setNewColor(PRESET_COLORS[0]);
        setIsAdding(false);
        await Promise.resolve(onUpdate());
        return;
      }

      const { data: sessionResult } = await supabase.auth.getSession();

      if (!sessionResult.session) {
        setError('You must be signed in to add categories.');
        return;
      }

      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionResult.session.access_token}`,
        },
        body: JSON.stringify({
          name: trimmedName,
          color: newColor,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : 'Unable to save category. Please try again.';
        setError(message);
        return;
      }

      const savedCategory = (payload && typeof payload === 'object'
        ? (payload as { category?: Category }).category
        : undefined);

      if (!savedCategory) {
        setError('Unable to save category. Please try again.');
        return;
      }

      await Promise.resolve(onCategoryCreated(savedCategory));
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
      setIsAdding(false);
      await Promise.resolve(onUpdate());
    } catch (insertError) {
      console.error('Error inserting category', insertError);
      setError('Unable to save category. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (id: string, name: string, color: string) => {
    if (!isSupabaseConfigured) {
      const updatedCategories = categories.map((category) =>
        category.id === id ? { ...category, name, color } : category,
      );
      saveLocalCategories(updatedCategories);
      setEditingId(null);
      await Promise.resolve(onUpdate());
      return;
    }

    await supabase
      .from('categories')
      .update({ name, color })
      .eq('id', id)
      .eq('user_id', userId);
    setEditingId(null);
    onUpdate();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this category? Tasks will keep this label.')) {
      if (!isSupabaseConfigured) {
        const updatedCategories = categories.filter((category) => category.id !== id);
        saveLocalCategories(updatedCategories);
        await Promise.resolve(onUpdate());
        return;
      }

      await supabase
        .from('categories')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      onUpdate();
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-soft border border-zen-100">
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
          className="p-2 rounded-lg hover:bg-sage-100 transition-colors text-sage-600"
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
                    className={`w-8 h-8 rounded-lg transition-all ${
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
                onBlur={(e) => handleUpdate(category.id, e.target.value, category.color)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleUpdate(category.id, e.currentTarget.value, category.color);
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

            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setEditingId(editingId === category.id ? null : category.id)}
                className="p-1 rounded hover:bg-zen-200 transition-colors"
              >
                <Edit2 className="w-3 h-3 text-zen-600" />
              </button>
              <button
                onClick={() => handleDelete(category.id)}
                className="p-1 rounded hover:bg-red-100 transition-colors"
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
