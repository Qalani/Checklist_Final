'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Circle, MoreHorizontal, Flag, Clock } from 'lucide-react';
import type { Task, Category } from '@/types';
import { useState } from 'react';

interface TaskListViewProps {
  tasks: Task[];
  categories: Category[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
}

export default function TaskListView({
  tasks,
  categories,
  onEdit,
  onDelete,
  onToggle,
}: TaskListViewProps) {
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

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
    <div className="space-y-2">
      {tasks.map((task, index) => {
        const category = categories.find(c => c.name === task.category);
        const priorityColors = {
          low: 'text-zen-500',
          medium: 'text-warm-600',
          high: 'text-red-600',
        };

        return (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`
              group bg-white rounded-xl p-4 border-2 transition-all
              ${task.completed 
                ? 'border-zen-200 opacity-60' 
                : 'border-zen-100 hover:border-sage-300 hover:shadow-soft'
              }
            `}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={() => onToggle(task.id, !task.completed)}
                className="flex-shrink-0 mt-0.5 text-sage-600 hover:text-sage-700 transition-colors"
              >
                {task.completed ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className={`font-medium text-zen-900 ${task.completed ? 'line-through' : ''}`}>
                    {task.title}
                  </h3>

                  <div className="flex items-center gap-1">
                    <Flag className={`w-4 h-4 ${priorityColors[task.priority]}`} />
                    <button
                      onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                      className="p-1 rounded-lg hover:bg-zen-100 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <MoreHorizontal className="w-4 h-4 text-zen-500" />
                    </button>
                  </div>
                </div>

                {task.description && (
                  <p className="text-sm text-zen-600 mt-1">
                    {task.description}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-2">
                  {category && (
                    <span 
                      className="px-2 py-0.5 rounded-lg text-xs font-medium"
                      style={{ 
                        backgroundColor: `${category.color}15`,
                        color: category.color
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
                </div>

                {/* Expanded Actions */}
                {expandedTask === task.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex gap-2 mt-3 pt-3 border-t border-zen-100"
                  >
                    <button
                      onClick={() => onEdit(task)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-sage-100 text-sage-700 hover:bg-sage-200 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this task?')) {
                          onDelete(task.id);
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
        );
      })}
    </div>
  );
}