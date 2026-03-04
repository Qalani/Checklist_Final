'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Archive, ArchiveX, Trash2 } from 'lucide-react';
import type { List } from '@/types';

interface ArchivedListsSectionProps {
  archivedLists: List[];
  showArchived: boolean;
  setShowArchived: Dispatch<SetStateAction<boolean>>;
  handleUnarchive: (list: List) => Promise<void>;
  handleDelete: (list: List) => Promise<void>;
}

export default function ArchivedListsSection({
  archivedLists,
  showArchived,
  setShowArchived,
  handleUnarchive,
  handleDelete,
}: ArchivedListsSectionProps) {
  if (archivedLists.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setShowArchived((v: boolean) => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-zen-500 hover:text-zen-700 transition-colors mb-4"
      >
        <Archive className="w-4 h-4" />
        {showArchived ? 'Hide' : 'Show'} archived lists ({archivedLists.length})
      </button>

      {showArchived && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 opacity-70">
          {archivedLists.map(list => (
            <div
              key={list.id}
              className="rounded-3xl border border-zen-200/60 bg-surface/60 p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-zen-700 truncate">{list.name}</h3>
                  {list.description && (
                    <p className="text-xs text-zen-500 mt-1 line-clamp-2">{list.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleUnarchive(list)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-zen-200 text-xs font-medium text-zen-600 hover:text-zen-800 hover:border-zen-300 transition-colors"
                    title="Restore list"
                  >
                    <ArchiveX className="w-3.5 h-3.5" />
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(list)}
                    className="p-1.5 rounded-xl border border-red-200 text-red-400 hover:text-red-600 hover:border-red-300 transition-colors"
                    title="Delete permanently"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-zen-400">{(list.items?.length ?? 0)} items</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
