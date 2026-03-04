'use client';
import { PlusCircle } from 'lucide-react';
import { PRESET_COLORS } from '@/utils/dateTimeLocal';

interface CategoryCreationFormProps {
  newCategoryName: string;
  setNewCategoryName: (value: string) => void;
  newCategoryColor: string;
  setNewCategoryColor: (value: string) => void;
  isSavingCategory: boolean;
  categoryError: string | null;
  handleCreateCategory: () => void;
}

export default function CategoryCreationForm({
  newCategoryName,
  setNewCategoryName,
  newCategoryColor,
  setNewCategoryColor,
  isSavingCategory,
  categoryError,
  handleCreateCategory,
}: CategoryCreationFormProps) {
  return (
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
            maxLength={100}
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
  );
}
