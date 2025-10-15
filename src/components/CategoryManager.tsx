'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, Plus, X, Edit2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/types';

interface CategoryManagerProps {
  categories: Category[];
  onUpdate: () => void;
}

const PRESET_COLORS = [
  '#5a7a5a', '#7a957a', '#a89478', '#8b7961',
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#06b6d4', '#6b7280'
];

export default function CategoryManager({ categories, onUpdate }: CategoryManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    
    await supabase.from('categories').insert({
      name: newName.trim(),
      color: newColor,
    });
    
    setNewName('');
    setIsAdding(false);
    onUpdate();
  };

  const handleUpdate = async (id: string, name: string, color: string) => {
    await supabase.from('categories').update({ name, color }).eq('id', id);
    setEditingId(null);
    onUpdate();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this category? Tasks will keep this label.')) {
      await supabase.from('categories').delete().eq('id', id);
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
          onClick={() => setIsAdding(!isAdding)}
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
              <button
                onClick={handleAdd}
                className="w-full py-2 bg-sage-600 text-white rounded-lg hover:bg-sage-700 transition-colors font-medium text-sm"
              >
                Add Category
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
