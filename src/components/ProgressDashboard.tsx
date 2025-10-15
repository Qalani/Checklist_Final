'use client';

import { motion } from 'framer-motion';
import { PieChart } from 'lucide-react';
import type { Task, Category } from '@/types';

interface ProgressDashboardProps {
  tasks: Task[];
  categories: Category[];
}

export default function ProgressDashboard({ tasks, categories }: ProgressDashboardProps) {
  const categoryStats = categories.map(cat => {
    const catTasks = tasks.filter(t => t.category === cat.name);
    const completed = catTasks.filter(t => t.completed).length;
    return {
      ...cat,
      total: catTasks.length,
      completed,
      percentage: catTasks.length > 0 ? (completed / catTasks.length) * 100 : 0,
    };
  }).filter(stat => stat.total > 0);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-soft border border-zen-100">
      <div className="flex items-center gap-2 mb-6">
        <PieChart className="w-5 h-5 text-sage-600" />
        <h2 className="text-lg font-semibold text-zen-900">Progress Overview</h2>
      </div>

      <div className="space-y-4">
        {categoryStats.length > 0 ? (
          categoryStats.map((stat, index) => (
            <motion.div
              key={stat.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-zen-700">{stat.name}</span>
                <span className="text-zen-600">
                  {stat.completed}/{stat.total}
                </span>
              </div>
              <div className="relative h-2 bg-zen-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${stat.percentage}%` }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: stat.color }}
                />
              </div>
            </motion.div>
          ))
        ) : (
          <p className="text-sm text-zen-500 text-center py-4">
            No tasks yet
          </p>
        )}
      </div>
    </div>
  );
}
