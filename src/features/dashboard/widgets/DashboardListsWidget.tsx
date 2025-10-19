'use client';

import useSWR from 'swr';
import { ListTodo } from 'lucide-react';
import DashboardWidgetFrame from './DashboardWidgetFrame';
import { loadListsSummary } from '../data';

interface DashboardListsWidgetProps {
  userId: string | null;
}

export default function DashboardListsWidget({ userId }: DashboardListsWidgetProps) {
  const { data, error, isLoading } = useSWR(
    userId ? ['dashboard-lists', userId] : null,
    () => loadListsSummary(userId as string),
    {
      revalidateOnFocus: false,
    },
  );

  const icon = <ListTodo className="h-5 w-5" />;

  if (!userId) {
    return (
      <DashboardWidgetFrame title="Shared Lists" description="Sign in to see your lists." icon={icon}>
        <p className="text-sm text-zen-500 dark:text-zen-200">Sign in to review your collaborative lists.</p>
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold text-zen-900">{data.totalLists}</p>
            <p className="text-sm text-zen-500 dark:text-zen-200">Total lists</p>
          </div>
          <div className="rounded-2xl bg-sage-50 px-4 py-3 text-center dark:bg-zen-800/30">
            <p className="text-2xl font-semibold text-zen-900">{data.sharedCount}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-zen-500 dark:text-zen-200">Shared</p>
          </div>
        </div>
      ) : null}
    </DashboardWidgetFrame>
  );
}
