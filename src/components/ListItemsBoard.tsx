'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckSquare, GripVertical, Plus, Square, Trash2 } from 'lucide-react';
import type { ListItem } from '@/types';

interface ListItemsBoardProps {
  items: ListItem[];
  canEdit: boolean;
  editing?: boolean;
  onAddItem?: () => Promise<string | null>;
  onToggleItem?: (itemId: string, completed: boolean) => Promise<void> | void;
  onContentCommit?: (itemId: string, content: string) => Promise<void> | void;
  onDeleteItem?: (itemId: string) => Promise<void> | void;
  onReorder?: (orderedIds: string[]) => Promise<void> | void;
  error?: string | null;
}

interface SortableListItemProps {
  item: ListItem;
  canEdit: boolean;
  editing: boolean;
  onToggle?: (completed: boolean) => Promise<void> | void;
  onContentCommit?: (content: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  autoFocus?: boolean;
  onFocusComplete?: () => void;
}

function SortableListItem({
  item,
  canEdit,
  editing,
  onToggle,
  onContentCommit,
  onDelete,
  autoFocus,
  onFocusComplete,
}: SortableListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !canEdit || !editing,
  });

  const style = useMemo<CSSProperties>(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
      width: '100%',
    }),
    [transform, transition],
  );

  const [value, setValue] = useState(item.content);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setValue(item.content);
  }, [item.content]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      onFocusComplete?.();
    }
  }, [autoFocus, onFocusComplete]);

  const handleBlur = () => {
    if (!canEdit || !editing || !onContentCommit) {
      return;
    }

    if (value !== item.content) {
      void onContentCommit(value.trim());
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!canEdit || !editing) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const completedClasses = item.completed ? 'line-through text-zen-400' : 'text-zen-800';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex w-full items-start gap-3 rounded-2xl border border-zen-200 bg-surface/80 p-4 transition-all ${
        isDragging ? 'shadow-lg ring-2 ring-sage-200' : 'shadow-soft'
      }`}
    >
      {canEdit && editing && (
        <button
          type="button"
          className="flex-shrink-0 text-zen-400 hover:text-zen-600"
          aria-label="Reorder list item"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        className={`mt-0.5 flex-shrink-0 ${
          canEdit ? 'text-sage-500 hover:text-sage-600' : 'text-sage-300'
        }`}
        aria-label={item.completed ? 'Mark item as incomplete' : 'Mark item as complete'}
        disabled={!canEdit || !onToggle}
        onClick={() => {
          if (!canEdit || !onToggle) {
            return;
          }
          void onToggle(!item.completed);
        }}
      >
        {item.completed ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
      </button>
      <div className="flex-1 min-w-0">
        {canEdit && editing && onContentCommit ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={event => setValue(event.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            rows={1}
            className={`w-full resize-none bg-transparent text-sm leading-relaxed break-words outline-none ${completedClasses}`}
            placeholder="Describe this list item"
          />
        ) : (
          <p className={`text-sm leading-relaxed break-words ${completedClasses}`}>
            {item.content ? item.content : <span className="text-zen-400">No details yet</span>}
          </p>
        )}
      </div>
      {canEdit && editing && onDelete && (
        <button
          type="button"
          onClick={() => void onDelete()}
          className="flex-shrink-0 text-zen-400 hover:text-red-500"
          aria-label="Delete list item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default function ListItemsBoard({
  items,
  canEdit,
  editing = false,
  onAddItem,
  onToggleItem,
  onContentCommit,
  onDeleteItem,
  onReorder,
  error,
}: ListItemsBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [orderedItems, setOrderedItems] = useState<ListItem[]>(() => [...items].sort((a, b) => a.position - b.position));
  const [creating, setCreating] = useState(false);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  useEffect(() => {
    setOrderedItems([...items].sort((a, b) => a.position - b.position));
  }, [items]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (!canEdit || !editing || !onReorder) {
      return;
    }

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = orderedItems.findIndex(item => item.id === active.id);
    const newIndex = orderedItems.findIndex(item => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const nextOrder = arrayMove(orderedItems, oldIndex, newIndex);
    setOrderedItems(nextOrder);
    void onReorder(nextOrder.map(item => item.id));
  };

  const handleAddItem = async () => {
    if (!canEdit || !editing || !onAddItem || creating) {
      return;
    }

    setCreating(true);
    try {
      const id = await onAddItem();
      if (id) {
        setFocusItemId(id);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4 w-full">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedItems.map(item => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 w-full">
            {orderedItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zen-200 bg-surface/60 p-4 text-sm text-zen-500">
                No items yet.{' '}
                {canEdit
                  ? editing
                    ? 'Add your first item to begin organising this list.'
                    : 'Switch to edit mode to start adding checklist details.'
                  : 'The creator has not added items yet.'}
              </div>
            ) : (
              orderedItems.map(item => (
                <SortableListItem
                  key={item.id}
                  item={item}
                  canEdit={canEdit}
                  editing={editing}
                  onToggle={onToggleItem ? completed => onToggleItem(item.id, completed) : undefined}
                  onContentCommit={onContentCommit ? content => onContentCommit(item.id, content) : undefined}
                  onDelete={onDeleteItem ? () => onDeleteItem(item.id) : undefined}
                  autoFocus={focusItemId === item.id}
                  onFocusComplete={() => setFocusItemId(null)}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      {canEdit && editing && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleAddItem}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-xl border border-zen-200 px-3 py-2 text-sm font-medium text-zen-600 transition-colors hover:border-sage-300 hover:text-zen-800 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            New list item
          </button>
          {creating && <span className="text-xs text-zen-400">Adding…</span>}
        </div>
      )}

      {error && <p className="text-sm font-medium text-red-500">{error}</p>}
    </div>
  );
}
