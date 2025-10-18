'use client';

import { motion } from 'framer-motion';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, Circle, Clock, Flag, MoreHorizontal, GripVertical, BellRing, Share2, Shield } from 'lucide-react';
import type { Task, Category } from '@/types';
import { useState } from 'react';
import MarkdownDisplay from './MarkdownDisplay';

interface TaskBentoGridProps {
  tasks: Task[];
  categories: Category[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onReorder: (tasks: Task[]) => void;
  onManageAccess?: (task: Task) => void;
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

function SortableTaskCard({ task, category, onEdit, onDelete, onToggle, onManageAccess }: {
  task: Task;
  category?: Category;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onManageAccess?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const [showMenu, setShowMenu] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`
          relative p-5 rounded-2xl border-2 transition-all cursor-pointer
          ${task.completed 
            ? 'bg-zen-50/50 border-zen-200 opacity-60' 
            : 'bg-surface border-zen-100 hover:border-sage-300 shadow-soft hover:shadow-medium'
          }
        `}
      >
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="absolute left-2 top-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4 text-zen-400" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <button
            onClick={onToggle}
            className="flex-shrink-0 mt-0.5 text-sage-600 hover:text-sage-700 transition-colors"
          >
            {task.completed ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              <Circle className="w-6 h-6" />
            )}
          </button>

          <div className="flex-1 min-w-0 ml-1">
            <h3 className={`font-semibold text-zen-900 mb-1 ${task.completed ? 'line-through' : ''}`}>
              {task.title}
            </h3>
            {task.description && (
              <MarkdownDisplay text={task.description} className="[&>p]:mb-1 [&>p:last-child]:mb-0" />
            )}
          </div>

        {/* Menu */}
        <div className="relative flex items-center gap-2">
          {task.access_role && (
            <span
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ${
                isOwner
                  ? 'border-sage-200 bg-sage-50 text-sage-600'
                  : 'border-zen-200 bg-zen-50 text-zen-600'
              }`}
            >
              <Shield className="w-3 h-3" />
              {ROLE_LABELS[accessRole]}
            </span>
          )}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded-lg hover:bg-zen-100 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4 text-zen-500" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-8 w-40 bg-surface rounded-xl shadow-lift border border-zen-200 py-1 z-10">
                <button
                  onClick={() => {
                    if (!canEdit) {
                      return;
                    }
                    onEdit();
                    setShowMenu(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                    canEdit ? 'hover:bg-zen-50' : 'cursor-not-allowed opacity-60 text-zen-400'
                  }`}
                  disabled={!canEdit}
                >
                  Edit
                </button>
                {canManageAccess && (
                  <button
                    onClick={() => {
                      onManageAccess?.();
                      setShowMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-zen-50 transition-colors flex items-center gap-2"
                  >
                    <Share2 className="w-3 h-3" />
                    {isOwner ? 'Share task' : 'View access'}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (!canDelete) {
                      return;
                    }
                    if (confirm('Delete this task?')) {
                      onDelete();
                    }
                    setShowMenu(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                    canDelete ? 'text-red-600 hover:bg-red-50' : 'text-zen-400 cursor-not-allowed opacity-60'
                  }`}
                  disabled={!canDelete}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 flex-wrap">
          {category && (
            <span
              className="px-2 py-1 rounded-lg text-xs font-medium"
              style={{
                backgroundColor: `${category.color}15`,
                color: category.color,
              }}
            >
              {category.name}
            </span>
          )}

          <span className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${priorityColors[task.priority]}`}>
            <Flag className="w-3 h-3" />
            {task.priority}
          </span>

          {task.created_at && (
            <span className="px-2 py-1 rounded-lg text-xs text-zen-500 bg-zen-50 flex items-center gap-1 ml-auto">
              <Clock className="w-3 h-3" />
              {new Date(task.created_at).toLocaleDateString()}
            </span>
          )}

          {dueBadge && (
            <span className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${dueBadge.tone}`}>
              <Clock className="w-3 h-3" />
              {dueBadge.text}
            </span>
          )}

          {reminderLabel && (
            <span className="px-2 py-1 rounded-lg text-xs font-medium bg-sage-50 text-sage-700 flex items-center gap-1">
              <BellRing className="w-3 h-3" />
              {reminderLabel}
            </span>
          )}
        </div>
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
}: TaskBentoGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex(t => t.id === active.id);
      const newIndex = tasks.findIndex(t => t.id === over.id);

      const newTasks = [...tasks];
      const [movedTask] = newTasks.splice(oldIndex, 1);
      newTasks.splice(newIndex, 0, movedTask);

      onReorder(newTasks);
    }
  };

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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tasks.map(t => t.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tasks.map(task => (
            <SortableTaskCard
              key={task.id}
              task={task}
              category={categories.find(c => c.name === task.category)}
              onEdit={() => onEdit(task)}
              onDelete={() => onDelete(task.id)}
              onToggle={() => onToggle(task.id, !task.completed)}
              onManageAccess={onManageAccess ? () => onManageAccess(task) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}