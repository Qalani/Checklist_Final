'use client';

import useSWR from 'swr';
import { ListTodo } from 'lucide-react';
import DashboardWidgetFrame from './DashboardWidgetFrame';
import { loadListsSummary } from '../data';
import type { DashboardWidgetProps } from './index';

const DEMO_LISTS = {
  totalLists: 8,
  sharedCount: 3,
  highlight: 'Strategy Sync Agenda',
};

export default function DashboardListsWidget({ userId, isDemoMode }: DashboardWidgetProps) {
  const { data, error, isLoading } = useSWR(
    userId ? ['dashboard-lists', userId] : null,
    () => loadListsSummary(userId as string),
    {
      revalidateOnFocus: false,
    },
  );

  const icon = <ListTodo className="h-5 w-5" />;

  if (!userId) {
    if (isDemoMode) {
      return (
        <DashboardWidgetFrame
          title="Shared Lists"
          description="Stay aligned with collaborators across your lists."
          icon={icon}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-3xl font-semibold text-zen-900 dark:text-white">{DEMO_LISTS.totalLists}</p>
                <p className="text-sm text-zen-500 dark:text-slate-300">Total lists</p>
              </div>
              <div className="rounded-2xl bg-sage-50 px-4 py-3 text-center dark:bg-slate-800/70">
                <p className="text-2xl font-semibold text-zen-900 dark:text-white">{DEMO_LISTS.sharedCount}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-zen-500 dark:text-slate-300">Shared</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white/70 p-3 text-sm text-zen-600 shadow-inner dark:bg-slate-800/60 dark:text-slate-200">
              Featured: {DEMO_LISTS.highlight}
            </div>
          </div>
          <p className="mt-3 text-xs text-zen-400 dark:text-slate-400">Demo data shown. Sign in to manage your own lists.</p>
        </DashboardWidgetFrame>
      );
    }

    return (
      <DashboardWidgetFrame title="Shared Lists" description="Sign in to see your lists." icon={icon}>
        <p className="text-sm text-zen-500 dark:text-slate-300">Sign in to review your collaborative lists.</p>
      </DashboardWidgetFrame>
    );
  }

  return (
    <DashboardWidgetFrame
      title="Shared Lists"
      description="Stay aligned with collaborators across your lists."
      icon={icon}
      isLoading={isLoading}
      footer={error ? <span className="text-red-600">{error.message}</span> : undefined}
    >
      {data ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-3xl font-semibold text-zen-900 dark:text-white">{data.totalLists}</p>
              <p className="text-sm text-zen-500 dark:text-slate-300">Total lists</p>
            </div>
            <div className="rounded-2xl bg-sage-50 px-4 py-3 text-center dark:bg-slate-800/70">
              <p className="text-2xl font-semibold text-zen-900 dark:text-white">{data.sharedCount}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-zen-500 dark:text-slate-300">Shared</p>
            </div>
          </div>
          <p className="text-xs text-zen-500 dark:text-slate-300">
            {data.sharedCount > 0
              ? 'Collaborate smoothly with your shared collections.'
              : 'Invite teammates to share lists and stay in sync.'}
          </p>
        </div>
      ) : null}
    </DashboardWidgetFrame>
  );
}
