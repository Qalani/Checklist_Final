'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, Circle, TrendingUp, Target, Zap } from 'lucide-react';
import type { Task, Category } from '@/types';

interface QuickStatsProps {
  tasks: Task[];
  categories: Category[];
}

export default function QuickStats({ tasks, categories }: QuickStatsProps) {
  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const todayTasks = tasks.filter(t => {
    const today = new Date().toDateString();
    return new Date(t.created_at || '').toDateString() === today;
  }).length;
  const highPriorityCount = tasks.filter(t => t.priority === 'high' && !t.completed).length;

  const stats = [
    {
      label: 'Completion Rate',
      value: `${completionRate}%`,
      icon: TrendingUp,
      color: 'sage',
      subtitle: `${completedCount} of ${totalCount} tasks`,
    },
    {
      label: 'Active Tasks',
      value: totalCount - completedCount,
      icon: Circle,
      color: 'warm',
      subtitle: 'In progress',
    },
    {
      label: 'High Priority',
      value: highPriorityCount,
      icon: Zap,
      color: 'red',
      subtitle: 'Needs attention',
    },
    {
      label: 'Today',
      value: todayTasks,
      icon: Target,
      color: 'zen',
      subtitle: 'Created today',
    },
  ];

  const colorClasses = {
    sage: 'from-sage-500 to-sage-600',
    warm: 'from-warm-500 to-warm-600',
    red: 'from-red-500 to-red-600',
    zen: 'from-zen-500 to-zen-600',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="relative overflow-hidden bg-white rounded-2xl p-6 shadow-soft hover:shadow-medium transition-shadow border border-zen-100"
        >
          <div className="flex items-start justify-between mb-4">
            <div 
              className={\`w-12 h-12 rounded-xl bg-gradient-to-br \${colorClasses[stat.color as keyof typeof colorClasses]} flex items-center justify-center shadow-medium\`}
            >
              <stat.icon className="w-6 h-6 text-white" />
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-zen-900">{stat.value}</div>
              <div className="text-xs text-zen-600 mt-1">{stat.subtitle}</div>
            </div>
          </div>
          <h3 className="text-sm font-medium text-zen-700">{stat.label}</h3>
        </motion.div>
      ))}
    </div>
  );
}
