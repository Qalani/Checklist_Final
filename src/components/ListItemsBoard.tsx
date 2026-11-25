'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
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
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { ListItem } from '@/types';
import { SyncStatusBadge } from './SyncStatusBadge';
import CompletionToggle from './CompletionToggle';
import { categorizeGroceryItem, GROCERY_CATEGORIES } from '@/features/lists/groceryCategories';

type CategoryMode = 'none' | 'manual' | 'grocery';

function getItemCategory(item: ListItem, mode: CategoryMode): string {
  return item.category?.trim() || (mode === 'grocery' ? categorizeGroceryItem(item.content) : 'Uncategorized');
}

interface ListItemsBoardProps {
  items: ListItem[];
  canEdit: boolean;
  editing?: boolean;
  onAddItem?: () => Promise<string | null>;
  onToggleItem?: (itemId: string, completed: boolean) => Promise<void | boolean> | void | boolean;
  onContentCommit?: (itemId: string, content: string) => Promise<void> | void;
  onDeleteItem?: (itemId: string) => Promise<void> | void;
  onReorder?: (orderedIds: string[]) => Promise<void> | void;
  categoryMode?: CategoryMode;
  onCategoryChange?: (itemId: string, category: string | null) => Promise<void> | void;
  error?: string | null;
}

interface SortableListItemProps {
  item: ListItem;
  canEdit: boolean;
  editing: boolean;
  onToggle?: (completed: boolean) => Promise<void | boolean> | void | boolean;
  onContentCommit?: (content: string) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  autoFocus?: boolean;
  onFocusComplete?: () => void;
  categoryMode: CategoryMode;
  categoryOptions: string[];
  onCategoryChange?: (category: string | null) => Promise<void> | void;
}

const LINK_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const TRAILING_PUNCTUATION_PATTERN = /[)\],.!?:;'"“”]+$/;

function linkifyText(content: string): ReactNode[] {
  LINK_PATTERN.lastIndex = 0;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_PATTERN.exec(content)) !== null) {
    const [rawMatch] = match;
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      nodes.push(content.slice(lastIndex, matchIndex));
    }

    let displayText = rawMatch;
    let trailingText = '';

    const trailingMatch = rawMatch.match(TRAILING_PUNCTUATION_PATTERN);
    if (trailingMatch) {
      displayText = rawMatch.slice(0, -trailingMatch[0].length);
      trailingText = trailingMatch[0];

      const restoreClosing = (char: string, open: RegExp, close: RegExp) => {
        const openCount = (displayText.match(open) ?? []).length;
        const closeCount = (displayText.match(close) ?? []).length;
        if (openCount > closeCount) {
          displayText += char;
          return false;
        }
        return true;
      };

      let remaining = '';
      for (const char of trailingText) {
        if (
          (char === ')' && !restoreClosing(char, /\(/g, /\)/g)) ||
          (char === ']' && !restoreClosing(char, /\[/g, /\]/g)) ||
          (char === '}' && !restoreClosing(char, /\{/g, /\}/g)) ||
          (char === '”' && !restoreClosing(char, /“/g, /”/g)) ||
          (char === '"' && !restoreClosing(char, /"/g, /"/g)) ||
          (char === '\'' && !restoreClosing(char, /'/g, /'/g))
        ) {
          continue;
        }

        remaining += char;
      }

      trailingText = remaining;

      if (!displayText) {
        displayText = rawMatch;
        trailingText = '';
      }
    }

    const href = displayText.startsWith('http') ? displayText : `https://${displayText}`;

    nodes.push(
      <a
        key={`link-${matchIndex}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sage-600 underline break-words"
      >
        {displayText}
      </a>,
    );

    if (trailingText) {
      nodes.push(trailingText);
    }

    lastIndex = matchIndex + rawMatch.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [content];
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
  categoryMode,
  categoryOptions,
  onCategoryChange,
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
  const [categoryValue, setCategoryValue] = useState(item.category ?? '');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const renderedContent = useMemo(() => linkifyText(item.content), [item.content]);

  useEffect(() => {
    setValue(item.content);
  }, [item.content]);

  useEffect(() => {
    setCategoryValue(item.category ?? '');
  }, [item.category]);

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
      <CompletionToggle
        completed={item.completed}
        label="Item completed"
        subject="item"
        shape="square"
        size="sm"
        disabled={!canEdit || !onToggle}
        onToggle={() => onToggle?.(!item.completed)}
      />
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
            {item.content ? (
              renderedContent
            ) : (
              <span className="text-zen-400">No details yet</span>
            )}
          </p>
        )}
        {categoryMode !== 'none' && canEdit && editing && onCategoryChange && (
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={`category-${item.id}`} className="text-xs text-zen-500">Category</label>
            <input
              id={`category-${item.id}`}
              list={`category-options-${item.id}`}
              value={categoryValue}
              onChange={event => setCategoryValue(event.target.value)}
              onBlur={() => {
                const next = categoryValue.trim() || null;
                setCategoryValue(next ?? '');
                if (next !== (item.category ?? null)) void onCategoryChange(next);
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              placeholder={categoryMode === 'grocery' ? `Automatic: ${categorizeGroceryItem(item.content)}` : 'Uncategorized'}
              className="min-w-0 flex-1 rounded-lg border border-zen-200 bg-surface px-2 py-1 text-xs text-zen-700 focus:border-sage-400 focus:outline-none"
            />
            <datalist id={`category-options-${item.id}`}>
              {categoryOptions.map(category => <option key={category} value={category} />)}
            </datalist>
          </div>
        )}
        <div className="mt-1">
          <SyncStatusBadge tableName="list_items" id={item.id} />
        </div>
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
  categoryMode = 'none',
  onCategoryChange,
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

  const groups = useMemo(() => {
    if (categoryMode === 'none') return [{ name: '', items: orderedItems }];
    const grouped = new Map<string, ListItem[]>();
    for (const item of orderedItems) {
      const name = getItemCategory(item, categoryMode);
      const group = grouped.get(name) ?? [];
      group.push(item);
      grouped.set(name, group);
    }
    return Array.from(grouped, ([name, groupItems]) => ({ name, items: groupItems }))
      .sort((a, b) => {
        const last = categoryMode === 'grocery' ? 'Other' : 'Uncategorized';
        if (a.name === last) return b.name === last ? 0 : 1;
        if (b.name === last) return -1;
        if (categoryMode === 'grocery') {
          const aIndex = GROCERY_CATEGORIES.findIndex(name => name === a.name);
          const bIndex = GROCERY_CATEGORIES.findIndex(name => name === b.name);
          if (aIndex !== -1 || bIndex !== -1) {
            return (aIndex === -1 ? Infinity : aIndex) - (bIndex === -1 ? Infinity : bIndex);
          }
        }
        return a.name.localeCompare(b.name);
      });
  }, [categoryMode, orderedItems]);

  const categoryOptions = useMemo(() => Array.from(new Set([
    ...(categoryMode === 'grocery' ? GROCERY_CATEGORIES : []),
    ...orderedItems.map(item => item.category?.trim()).filter((category): category is string => Boolean(category)),
  ])), [categoryMode, orderedItems]);

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

    // Moving between groups would otherwise look like a successful drag while
    // leaving the item's category unchanged. Use the category field to move it.
    if (categoryMode !== 'none' && getItemCategory(orderedItems[oldIndex], categoryMode) !== getItemCategory(orderedItems[newIndex], categoryMode)) {
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
      {categoryMode !== 'none' && canEdit && editing && onCategoryChange && (
        <p className="text-xs text-zen-500">
          {categoryMode === 'grocery'
            ? 'Items are sorted automatically. Enter a category to change it, or clear the field to use automatic sorting.'
            : 'Enter a category for each item, or leave it blank for Uncategorized.'}
        </p>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={groups.flatMap(group => group.items.map(item => item.id))} strategy={verticalListSortingStrategy}>
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
              groups.map(group => (
                <section key={group.name || 'all'} className="space-y-3">
                  {categoryMode !== 'none' && <h4 className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-zen-500">{group.name}</h4>}
                  {group.items.map(item => (
                    <SortableListItem
                      key={item.id}
                      item={item}
                      canEdit={canEdit}
                      editing={editing}
                      categoryMode={categoryMode}
                      categoryOptions={categoryOptions}
                      onCategoryChange={onCategoryChange ? category => onCategoryChange(item.id, category) : undefined}
                      onToggle={onToggleItem ? completed => onToggleItem(item.id, completed) : undefined}
                      onContentCommit={onContentCommit ? content => onContentCommit(item.id, content) : undefined}
                      onDelete={onDeleteItem ? () => onDeleteItem(item.id) : undefined}
                      autoFocus={focusItemId === item.id}
                      onFocusComplete={() => setFocusItemId(null)}
                    />
                  ))}
                </section>
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
