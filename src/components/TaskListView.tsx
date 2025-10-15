'use client';

import { useState } from 'react';
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
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, Circle, MoreHorizontal, Flag, Clock, GripVertical, BellRing } from 'lucide-react';
import type { Task, Category } from '@/types';

interface TaskListViewProps {
  tasks: Task[];
  categories: Category[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onReorder: (tasks: Task[]) => void;
}

const priorityColors: Record<Task['priority'], string> = {
  low: 'text-zen-500',
  medium: 'text-warm-600',
  high: 'text-red-600',
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

function SortableTaskItem({
  task,
  category,
  isExpanded,
  onExpand,
  onEdit,
  onDelete,
  onToggle,
}: {
  task: Task;
  category?: Category;
  isExpanded: boolean;
  onExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

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

  return (
    <div ref={setNodeRef} style={style} className="group">
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`
          relative bg-white rounded-xl p-4 border-2 transition-all
          ${task.completed
            ? 'border-zen-200 opacity-60'
            : 'border-zen-100 hover:border-sage-300 hover:shadow-soft'}
        `}
      >
        <div
          {...attributes}
          {...listeners}
          className="absolute left-3 top-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4 text-zen-400" />
        </div>

        <div className="flex items-start gap-3">
          <button
            onClick={onToggle}
            className="flex-shrink-0 mt-0.5 text-sage-600 hover:text-sage-700 transition-colors"
          >
            {task.completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className={`font-medium text-zen-900 ${task.completed ? 'line-through' : ''}`}>
                {task.title}
              </h3>

              <div className="flex items-center gap-1">
                <Flag className={`w-4 h-4 ${priorityColors[task.priority]}`} />
                <button
                  onClick={onExpand}
                  className="p-1 rounded-lg hover:bg-zen-100 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <MoreHorizontal className="w-4 h-4 text-zen-500" />
                </button>
              </div>
            </div>

            {task.description && <p className="text-sm text-zen-600 mt-1">{task.description}</p>}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {category && (
                <span
                  className="px-2 py-0.5 rounded-lg text-xs font-medium"
                  style={{
                    backgroundColor: `${category.color}15`,
                    color: category.color,
                  }}
                >
                  {category.name}
                </span>
              )}

              {task.created_at && (
                <span className="text-xs text-zen-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(task.created_at).toLocaleDateString()}
                </span>
              )}

              {dueBadge && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-lg flex items-center gap-1 ${dueBadge.tone}`}>
                  <Clock className="w-3 h-3" />
                  {dueBadge.text}
                </span>
              )}

              {reminderLabel && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-sage-50 text-sage-700 flex items-center gap-1">
                  <BellRing className="w-3 h-3" />
                  {reminderLabel}
                </span>
              )}
            </div>

            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="flex gap-2 mt-3 pt-3 border-t border-zen-100"
              >
                <button
                  onClick={onEdit}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-sage-100 text-sage-700 hover:bg-sage-200 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this task?')) {
                      onDelete();
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                >
                  Delete
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function TaskListView({
  tasks,
  categories,
  onEdit,
  onDelete,
  onToggle,
  onReorder,
}: TaskListViewProps) {
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = tasks.findIndex(task => task.id === active.id);
    const newIndex = tasks.findIndex(task => task.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reordered = arrayMove(tasks, oldIndex, newIndex);
    onReorder(reordered);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map(task => (
            <SortableTaskItem
              key={task.id}
              task={task}
              category={categories.find(c => c.name === task.category)}
              isExpanded={expandedTask === task.id}
              onExpand={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
              onEdit={() => onEdit(task)}
              onDelete={() => {
                setExpandedTask(prev => (prev === task.id ? null : prev));
                onDelete(task.id);
              }}
              onToggle={() => {
                setExpandedTask(prev => (prev === task.id ? null : prev));
                onToggle(task.id, !task.completed);
              }}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
