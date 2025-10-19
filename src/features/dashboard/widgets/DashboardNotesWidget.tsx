'use client';

import useSWR from 'swr';
import { FileText } from 'lucide-react';
import DashboardWidgetFrame from './DashboardWidgetFrame';
import { loadNotesSummary } from '../data';
import type { DashboardWidgetProps } from './index';

const DEMO_NOTES = {
  totalCount: 12,
  recentTitle: 'Weekly reflection – embracing focus',
  lastUpdatedAt: 'Updated 2 hours ago',
};

export default function DashboardNotesWidget({ userId, isDemoMode }: DashboardWidgetProps) {
  const { data, error, isLoading } = useSWR(
    userId ? ['dashboard-notes', userId] : null,
    () => loadNotesSummary(userId as string),
    {
      revalidateOnFocus: false,
    },
  );

  const icon = <FileText className="h-5 w-5" />;

  if (!userId) {
    if (isDemoMode) {
      return (
        <DashboardWidgetFrame
          title="Recent Notes"
          description="Pick up where you left off in your workspace."
          icon={icon}
        >
          <div className="space-y-2">
            <p className="text-4xl font-semibold text-zen-900 dark:text-white">{DEMO_NOTES.totalCount}</p>
            <p className="text-sm text-zen-500 dark:text-slate-300">Documents saved</p>
            <div className="rounded-2xl bg-sage-50 p-4 dark:bg-slate-800/70">
              <p className="text-sm font-medium text-zen-700 dark:text-slate-200">{DEMO_NOTES.recentTitle}</p>
              <p className="mt-1 text-xs text-zen-500 dark:text-slate-300">{DEMO_NOTES.lastUpdatedAt}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-zen-400 dark:text-slate-400">Demo data shown. Sign in to see your notes.</p>
        </DashboardWidgetFrame>
      );
    }

    return (
      <DashboardWidgetFrame title="Recent Notes" description="Sign in to continue writing." icon={icon}>
        <p className="text-sm text-zen-500 dark:text-slate-300">Sign in to see your most recent notes.</p>
      </DashboardWidgetFrame>
    );
  }

  return (
    <DashboardWidgetFrame
      title="Recent Notes"
      description="Pick up where you left off in your workspace."
      icon={icon}
      isLoading={isLoading}
      footer={error ? <span className="text-red-600">{error.message}</span> : undefined}
    >
      {data ? (
        <div className="space-y-2">
          <p className="text-4xl font-semibold text-zen-900 dark:text-white">{data.totalCount}</p>
          <p className="text-sm text-zen-500 dark:text-slate-300">Documents saved</p>
          <div className="rounded-2xl bg-sage-50 p-4 dark:bg-slate-800/70">
            <p className="text-sm font-medium text-zen-700 dark:text-slate-200">{data.recentTitle ?? 'No recent notes yet'}</p>
            <p className="mt-1 text-xs text-zen-500 dark:text-slate-300">
              {data.lastUpdatedAt ? `Updated ${new Date(data.lastUpdatedAt).toLocaleString()}` : 'Create a note to get started'}
            </p>
          </div>
        </div>
      ) : null}
    </DashboardWidgetFrame>
  );
}
