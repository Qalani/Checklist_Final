'use client';

import useSWR from 'swr';
import { LayoutGrid } from 'lucide-react';
import DashboardWidgetFrame from './DashboardWidgetFrame';
import { loadProductivitySummary } from '../data';

interface DashboardProductivityWidgetProps {
  userId: string | null;
}

export default function DashboardProductivityWidget({ userId }: DashboardProductivityWidgetProps) {
  const { data, error, isLoading } = useSWR(
    userId ? ['dashboard-productivity', userId] : null,
    () => loadProductivitySummary(userId as string),
    {
      revalidateOnFocus: false,
    },
  );

  const icon = <LayoutGrid className="h-5 w-5" />;

  if (!userId) {
    return (
      <DashboardWidgetFrame title="Productivity Pulse" description="Sign in to see your tasks." icon={icon}>
        <p className="text-sm text-zen-500 dark:text-slate-300">Sign in to explore your productivity insights.</p>
      </DashboardWidgetFrame>
    );
  }

  return (
    <DashboardWidgetFrame
      title="Productivity Pulse"
      description="Monitor your current workload and upcoming deadlines."
      icon={icon}
      isLoading={isLoading}
      footer={error ? <span className="text-red-600">{error.message}</span> : undefined}
    >
      {data ? (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl bg-sage-50 p-4 text-center dark:bg-slate-800/70">
            <p className="text-3xl font-semibold text-zen-900 dark:text-white">{data.activeCount}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-zen-500 dark:text-slate-300">Active</p>
          </div>
          <div className="rounded-2xl bg-sage-50 p-4 text-center dark:bg-slate-800/70">
            <p className="text-3xl font-semibold text-zen-900 dark:text-white">{data.completedCount}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-zen-500 dark:text-slate-300">Completed</p>
          </div>
          <div className="rounded-2xl bg-sage-50 p-4 text-center dark:bg-slate-800/70">
            <p className="text-sm font-medium text-zen-700 dark:text-slate-200">{data.nextDueTask ? data.nextDueTask.title : 'No upcoming tasks'}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-zen-500 dark:text-slate-300">
              {data.nextDueTask?.due_date
                ? new Date(data.nextDueTask.due_date).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Schedule your next task'}
            </p>
          </div>
        </div>
      ) : null}
    </DashboardWidgetFrame>
  );
}
