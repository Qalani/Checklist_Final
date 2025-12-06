'use client';

import type Draggabilly from 'draggabilly';
import type Packery from 'packery';
import { motion } from 'framer-motion';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  GripVertical,
  BellRing,
  Share2,
  Shield,
  Pencil,
  Trash2,
  RefreshCcw,
  AlarmClock,
} from 'lucide-react';
import type { Task, Category } from '@/types';
import MarkdownDisplay from './MarkdownDisplay';
import TaskForm from './TaskForm';
import { describeReminderRecurrence, formatReminderDate, getNextReminderOccurrence } from '@/utils/reminders';

interface TaskBentoGridProps {
  tasks: Task[];
  categories: Category[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onReorder: (tasks: Task[]) => void;
  onManageAccess?: (task: Task) => void;
  editingTaskId?: string | null;
  onCancelEdit?: () => void;
  onSaveEdit?: (task: Task, updates: Partial<Task>) => Promise<{ error?: string } | void>;
  onCreateCategory?: (input: { name: string; color: string }) => Promise<Category>;
  enableReorder?: boolean;
}

const ROLE_LABELS: Record<'owner' | 'editor' | 'viewer', string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

function formatReminder(minutes: number) {
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} before`;
  }

  if (minutes % 1440 === 0) {
    const days = Math.round(minutes / 1440);
    return `${days} day${days === 1 ? '' : 's'} before`;
  }

  if (minutes % 60 === 0) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'} before`;
  }

  return `${minutes} minutes before`;
}

function TaskCard({
  task,
  category,
  onEdit,
  onDelete,
  onToggle,
  onManageAccess,
  isEditing = false,
  editingContent,
  enableReorder,
}: {
  task: Task;
  category?: Category;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onManageAccess?: () => void;
  isEditing?: boolean;
  editingContent?: ReactNode;
  enableReorder: boolean;
}) {
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  let dueBadge: { text: string; tone: string } | null = null;

  if (dueDate && !Number.isNaN(dueDate.getTime())) {
    const diff = dueDate.getTime() - Date.now();
    const formatted = dueDate.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    if (!task.completed && diff < 0) {
      dueBadge = {
        text: `Overdue · ${formatted}`,
        tone: 'bg-red-100 text-red-700',
      };
    } else if (!task.completed && diff <= 86_400_000) {
      dueBadge = {
        text: `Due soon · ${formatted}`,
        tone: 'bg-warm-100 text-warm-700',
      };
    } else {
      dueBadge = {
        text: `${task.completed ? 'Was due' : 'Due'} · ${formatted}`,
        tone: task.completed ? 'bg-zen-100 text-zen-500' : 'bg-zen-100 text-zen-600',
      };
    }
  }

  const reminderLabel =
    typeof task.reminder_minutes_before === 'number' && !Number.isNaN(task.reminder_minutes_before)
      ? formatReminder(task.reminder_minutes_before)
      : null;
  const nextReminder = getNextReminderOccurrence(task, { includeCurrent: true });
  const nextReminderLabel = nextReminder ? formatReminderDate(nextReminder, task.reminder_timezone) : null;
  const recurrenceLabel = describeReminderRecurrence(task.reminder_recurrence);
  const snoozedLabel = (() => {
    if (!task.reminder_snoozed_until) {
      return null;
    }
    const parsed = new Date(task.reminder_snoozed_until);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return formatReminderDate(parsed, task.reminder_timezone);
  })();

  const priorityColors = {
    low: 'text-zen-500 bg-zen-100',
    medium: 'text-warm-600 bg-warm-100',
    high: 'text-red-600 bg-red-100',
  };

  const accessRole = task.access_role ?? 'owner';
  const isOwner = accessRole === 'owner';
  const canEdit = ['owner', 'editor'].includes(accessRole);
  const canDelete = accessRole === 'owner';
  const canManageAccess = Boolean(onManageAccess);
  const shareButtonTitle = isOwner ? 'Share task' : 'View collaborators';
  const editButtonTitle = canEdit ? 'Edit task' : 'You do not have permission to edit this task';
  const deleteButtonTitle = canDelete ? 'Delete task' : 'Only owners can delete this task';

  const cardClassName = `
    relative transition-all ${
      isEditing
        ? 'rounded-2xl border-2 bg-surface border-zen-200 shadow-soft'
        : `p-5 rounded-2xl border-2 cursor-pointer ${
            task.completed
              ? 'bg-zen-50/50 border-zen-200 opacity-60'
              : 'bg-surface border-zen-100 hover:border-sage-300 shadow-soft hover:shadow-medium'
          }`
    }
  `;

  return (
    <div className="group relative h-full">
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`${cardClassName} h-full`}
      >
        {isEditing ? (
          editingContent ?? null
        ) : (
          <>
            {/* Drag Handle */}
            {enableReorder ? (
              <div
                className="packery-drag-handle absolute left-2 top-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
              >
                <GripVertical className="w-4 h-4 text-zen-400" />
              </div>
            ) : null}

            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <button
                  onClick={onToggle}
                  className="flex-shrink-0 mt-0.5 text-sage-600 hover:text-sage-700 transition-colors"
                  aria-label={task.completed ? 'Mark task as incomplete' : 'Mark task as complete'}
                >
                  {task.completed ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    <Circle className="w-6 h-6" />
                  )}
                </button>

                <div className="flex-1 min-w-0 space-y-1">
                  <h3
                    className={`font-semibold text-zen-900 break-words ${task.completed ? 'line-through' : ''}`}
                  >
                    {task.title}
                  </h3>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                {canManageAccess && (
                  <button
                    type="button"
                    onClick={() => onManageAccess?.()}
                    className="p-2 rounded-xl border border-zen-200 text-zen-500 hover:text-zen-700 hover:border-zen-300 transition-colors"
                    title={shareButtonTitle}
                    aria-label={shareButtonTitle}
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!canEdit) {
                      return;
                    }
                    onEdit();
                  }}
                  className={`p-2 rounded-xl border transition-colors ${
                    canEdit
                      ? 'border-zen-200 text-zen-500 hover:text-zen-700 hover:border-zen-300'
                      : 'border-zen-100 text-zen-300 cursor-not-allowed opacity-60'
                  }`}
                  disabled={!canEdit}
                  title={editButtonTitle}
                  aria-label={editButtonTitle}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canDelete) {
                      return;
                    }
                    if (confirm('Delete this task?')) {
                      onDelete();
                    }
                  }}
                  className={`p-2 rounded-xl border transition-colors ${
                    canDelete
                      ? 'border-red-200 text-red-500 hover:text-red-600 hover:border-red-300'
                      : 'border-zen-100 text-zen-300 cursor-not-allowed opacity-60'
                  }`}
                  disabled={!canDelete}
                  title={deleteButtonTitle}
                  aria-label={deleteButtonTitle}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {task.description && (
              <div className="mt-3">
                <MarkdownDisplay text={task.description} className="[&>p]:mb-1 [&>p:last-child]:mb-0" />
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-2 flex-wrap">
              {task.access_role && (
                <span
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium shrink-0 ${
                    isOwner
                      ? 'border-sage-200 bg-sage-50 text-sage-600'
                      : 'border-zen-200 bg-zen-50 text-zen-600'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  {ROLE_LABELS[accessRole]}
                </span>
              )}

              {category && (
                <span
                  className="px-2 py-1 rounded-lg text-xs font-medium shrink-0"
                  style={{
                    backgroundColor: `${category.color}15`,
                    color: category.color,
                  }}
                >
                  {category.name}
                </span>
              )}

              <span
                className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 ${priorityColors[task.priority]}`}
              >
                <Flag className="w-3 h-3" />
                {task.priority}
              </span>

              {task.created_at && (
                <span className="px-2 py-1 rounded-lg text-xs text-zen-500 bg-zen-50 flex items-center gap-1 ml-auto shrink-0">
                  <Clock className="w-3 h-3" />
                  {new Date(task.created_at).toLocaleDateString()}
                </span>
              )}

              {dueBadge && (
                <span className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 ${dueBadge.tone}`}>
                  <Clock className="w-3 h-3" />
                  {dueBadge.text}
                </span>
              )}

              {reminderLabel && (
                <span className="px-2 py-1 rounded-lg text-xs font-medium bg-sage-50 text-sage-700 flex items-center gap-1 shrink-0">
                  <BellRing className="w-3 h-3" />
                  {reminderLabel}
                </span>
              )}
              {recurrenceLabel && (
                <span className="px-2 py-1 rounded-lg text-xs font-medium bg-zen-50 text-zen-700 flex items-center gap-1 shrink-0">
                  <RefreshCcw className="w-3 h-3" />
                  {recurrenceLabel}
                </span>
              )}
              {nextReminderLabel && (
                <span className="px-2 py-1 rounded-lg text-xs font-medium bg-sage-50 text-sage-700/90 flex items-center gap-1 shrink-0">
                  <BellRing className="w-3 h-3" />
                  Next: {nextReminderLabel}
                </span>
              )}
              {snoozedLabel && (
                <span className="px-2 py-1 rounded-lg text-xs font-medium bg-warm-50 text-warm-700 flex items-center gap-1 shrink-0">
                  <AlarmClock className="w-3 h-3" />
                  Snoozed until {snoozedLabel}
                </span>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function TaskBentoGrid({
  tasks,
  categories,
  onEdit,
  onDelete,
  onToggle,
  onReorder,
  onManageAccess,
  editingTaskId = null,
  onCancelEdit,
  onSaveEdit,
  onCreateCategory,
  enableReorder = true,
}: TaskBentoGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const packeryRef = useRef<Packery | null>(null);
  const draggiesRef = useRef<Map<string, Draggabilly>>(new Map());

  const taskLookup = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);

  useEffect(() => {
    const container = gridRef.current;

    if (!container || tasks.length === 0 || typeof window === 'undefined') {
      return undefined;
    }

    let resizeHandler: (() => void) | null = null;
    let cancelled = false;

    const setupPackery = async () => {
      const [packeryModule, draggabillyModule] = await Promise.all([
        import('packery'),
        import('draggabilly'),
      ]);

      if (cancelled || !gridRef.current) {
        return;
      }

      const PackeryConstructor = packeryModule.default as typeof Packery;
      const DraggabillyConstructor = draggabillyModule.default as typeof Draggabilly;

      const packery = new PackeryConstructor(gridRef.current, {
        itemSelector: '.packery-item',
        gutter: 16,
        percentPosition: true,
        columnWidth: '.packery-sizer',
      });

      packeryRef.current = packery;

      const cleanupDraggies = () => {
        draggiesRef.current.forEach(draggie => draggie.destroy());
        draggiesRef.current.clear();
      };

      const syncLayoutAndDragging = () => {
        cleanupDraggies();

        if (!enableReorder) {
          packery.reloadItems();
          packery.layout();
          return;
        }

        tasks.forEach(task => {
          const element = container.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
          if (!element) {
            return;
          }

          const draggie = new DraggabillyConstructor(element, {
            handle: '.packery-drag-handle',
          });

          draggie.on('dragEnd', () => {
            packery.layout();

            const orderedIds = packery
              .getItemElements()
              .map(el => el.getAttribute('data-task-id'))
              .filter((id): id is string => Boolean(id));

            if (!enableReorder || orderedIds.length !== tasks.length) {
              return;
            }

            const reorderedTasks = orderedIds
              .map(id => taskLookup.get(id))
              .filter((task): task is Task => Boolean(task));

            const orderChanged = reorderedTasks.some((task, index) => task.id !== tasks[index]?.id);

            if (orderChanged && reorderedTasks.length === tasks.length) {
              onReorder(reorderedTasks);
            }
          });

          packery.bindDraggabillyEvents(draggie);
          draggiesRef.current.set(task.id, draggie);
        });

        packery.reloadItems();
        packery.layout();
      };

      syncLayoutAndDragging();

      resizeHandler = () => packery.layout();
      window.addEventListener('resize', resizeHandler);

      return () => {
        window.removeEventListener('resize', resizeHandler!);
        cleanupDraggies();
        packery.destroy();
        packeryRef.current = null;
      };
    };

    const teardownPromise = setupPackery();

    return () => {
      cancelled = true;
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
      }
      teardownPromise
        .then(dispose => {
          dispose?.();
        })
        .catch(() => {
          // no-op: cleanup errors should not block unmount
        });
    };
  }, [enableReorder, onReorder, taskLookup, tasks]);

  useEffect(() => {
    packeryRef.current?.reloadItems();
    packeryRef.current?.layout();
  }, [editingTaskId]);

  if (tasks.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <div className="w-20 h-20 rounded-full bg-sage-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-10 h-10 text-sage-600" />
        </div>
        <h3 className="text-xl font-semibold text-zen-900 mb-2">All clear!</h3>
        <p className="text-zen-600">Create your first task to get started</p>
      </motion.div>
    );
  }

  return (
    <div className="relative">
      <div ref={gridRef} className="packery-grid relative" aria-live="polite">
        <div className="packery-sizer w-full sm:w-1/2 xl:w-1/3" aria-hidden />
        {tasks.map(task => {
          const isEditing = editingTaskId === task.id;
          const editingContent =
            isEditing && onSaveEdit && onCancelEdit && onCreateCategory
              ? (
                  <TaskForm
                    task={task}
                    categories={categories}
                    onCreateCategory={onCreateCategory}
                    onClose={onCancelEdit}
                    onSave={(updates) => onSaveEdit(task, updates)}
                    mode="inline"
                  />
                )
              : null;

          return (
            <div
              key={task.id}
              className="packery-item w-full sm:w-1/2 xl:w-1/3 mb-4"
              data-task-id={task.id}
            >
              <TaskCard
                task={task}
                category={categories.find(c => c.name === task.category)}
                onEdit={() => onEdit(task)}
                onDelete={() => onDelete(task.id)}
                onToggle={() => onToggle(task.id, !task.completed)}
                onManageAccess={onManageAccess ? () => onManageAccess(task) : undefined}
                isEditing={isEditing}
                editingContent={editingContent}
                enableReorder={enableReorder}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}