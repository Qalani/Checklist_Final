'use client';

import type { Dispatch, SetStateAction } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import RichTextTextarea from '@/components/RichTextTextarea';
import ListItemsBoard from '@/components/ListItemsBoard';
import type { List } from '@/types';

type FormState = {
  name: string;
  description: string;
};

interface ListFormModalProps {
  showForm: boolean;
  setShowForm: (show: boolean) => void;
  editingList: List | null;
  formState: FormState;
  setFormState: Dispatch<SetStateAction<FormState>>;
  formError: string | null;
  submitting: boolean;
  newListItems: List['items'];
  addNewListItem: () => Promise<string>;
  updateNewListItemContent: (itemId: string, content: string) => Promise<void>;
  toggleNewListItem: (itemId: string, completed: boolean) => Promise<void>;
  deleteNewListItem: (itemId: string) => Promise<void>;
  reorderNewListItems: (orderedIds: string[]) => Promise<void>;
  handleSubmit: () => Promise<void>;
}

export default function ListFormModal({
  showForm,
  setShowForm,
  editingList,
  formState,
  setFormState,
  formError,
  submitting,
  newListItems,
  addNewListItem,
  updateNewListItemContent,
  toggleNewListItem,
  deleteNewListItem,
  reorderNewListItems,
  handleSubmit,
}: ListFormModalProps) {
  return (
    <AnimatePresence>
      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="rounded-3xl bg-surface/90 border border-zen-200 shadow-soft p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zen-900">
                {editingList ? 'Update list' : 'Create a new list'}
              </h3>
              <p className="text-sm text-zen-600">
                Name your list and describe its intention to stay inspired.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-zen-500 hover:text-zen-700"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zen-700">List name</label>
              <input
                type="text"
                value={formState.name}
                onChange={event => setFormState(prev => ({ ...prev, name: event.target.value }))}
                placeholder="Sunday reset, Travel checklist, Reading list..."
                className="w-full rounded-xl border border-zen-200 bg-surface/80 px-4 py-2.5 text-sm text-zen-900 shadow-soft focus:border-sage-400 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zen-700">Description</label>
              <RichTextTextarea
                value={formState.description}
                onChange={value => setFormState(prev => ({ ...prev, description: value }))}
                placeholder="Add a gentle reminder of what this list helps you with."
                rows={4}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-zen-700">List items</label>
                <span className="text-xs text-zen-500">
                  Add items now just like in edit mode.
                </span>
              </div>
              <ListItemsBoard
                items={Array.isArray(newListItems) ? newListItems : []}
                canEdit
                editing
                onAddItem={addNewListItem}
                onToggleItem={(itemId, completed) => toggleNewListItem(itemId, completed)}
                onContentCommit={(itemId, content) => updateNewListItemContent(itemId, content)}
                onDeleteItem={deleteNewListItem}
                onReorder={reorderNewListItems}
                error={null}
              />
            </div>
          </div>

          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-zen-200 text-sm font-medium text-zen-600 hover:text-zen-800 hover:border-zen-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {submitting ? 'Saving…' : editingList ? 'Save changes' : 'Create list'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
