'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Calendar, CheckCircle2, ListTodo, Sparkles, Users } from 'lucide-react';
import type { ReactNode } from 'react';

import { loadDashboardHeroSummary } from './data';

interface DashboardHeroProps {
  userName: string | null;
  userId: string | null;
  isEditMode: boolean;
  isSaving: boolean;
  onToggleEditMode: () => void;
}

interface HeroMetricProps {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  icon: ReactNode;
}

function HeroMetric({ label, value, helper, icon }: HeroMetricProps) {
  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-zen-200/60 bg-surface/80 p-4 shadow-small backdrop-blur-sm dark:border-zen-700/40">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zen-100 text-zen-600 dark:bg-zen-800/30 dark:text-zen-900">
          {icon}
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-zen-500 dark:text-zen-200">{label}</p>
      </div>
      <div className="mt-6 text-3xl font-semibold text-zen-900">{value}</div>
      {helper ? <p className="mt-2 text-xs text-zen-500 dark:text-zen-200">{helper}</p> : null}
    </div>
  );
}

export default function DashboardHero({ userName, userId, isEditMode, isSaving, onToggleEditMode }: DashboardHeroProps) {
  const { data, isLoading } = useSWR(
    userId ? ['dashboard-hero', userId] : null,
    () => loadDashboardHeroSummary(userId as string),
    { revalidateOnFocus: false },
  );

  const greeting = useMemo(() => {
    if (!userName) {
      return 'Welcome to Zen Workspace';
    }
    const hours = new Date().getHours();
    if (hours < 12) return `Good morning, ${userName}`;
    if (hours < 18) return `Good afternoon, ${userName}`;
    return `Good evening, ${userName}`;
  }, [userName]);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-zen-200/60 bg-gradient-to-br from-zen-50/95 via-sage-50/85 to-warm-50/75 p-6 shadow-large backdrop-blur-lg dark:border-zen-700/40 dark:from-zen-200/15 dark:via-zen-100/10 dark:to-zen-50/10">
      <div className="absolute -top-12 -right-16 h-48 w-48 rounded-full bg-zen-200/40 blur-3xl dark:bg-zen-800/20" aria-hidden />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-surface/85 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zen-600 shadow-small dark:text-zen-900">
            <Sparkles className="h-4 w-4" />
            Composed overview
          </div>
          <h1 className="text-3xl font-semibold text-zen-900">{greeting}</h1>
          <p className="text-sm text-zen-600 dark:text-zen-200">
            Track progress, rebalance commitments, and arrange widgets to match your rhythm. Switch into edit mode to curate the dashboard that keeps you centred.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={onToggleEditMode}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[rgb(var(--color-surface))] ${
                isEditMode
                  ? 'border-zen-600 bg-zen-600 text-white hover:bg-zen-700 focus:ring-zen-500'
                  : 'border-zen-200 text-zen-700 hover:bg-zen-50 focus:ring-zen-300 dark:border-zen-700/50 dark:text-zen-200 dark:hover:bg-zen-800/30'
              }`}
            >
              {isEditMode ? 'Done editing' : 'Edit dashboard'}
            </button>
            {isSaving ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-zen-200 bg-surface/85 px-3 py-1 text-xs font-medium uppercase tracking-wide text-zen-600 dark:border-zen-700/40 dark:text-zen-200">
                <span className="h-3 w-3 animate-ping rounded-full bg-zen-500" /> Saving layout
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid w-full max-w-xl grid-cols-2 gap-4">
          <HeroMetric
            label="Active tasks"
            value={isLoading ? '—' : data?.activeTasks ?? '—'}
            helper={data?.nextDueTaskTitle ? (
              <span className="inline-flex items-center gap-1 text-zen-500 dark:text-zen-200">
                <Calendar className="h-3.5 w-3.5" />
                {data.nextDueTaskTitle}
                {data.nextDueTaskDueDate
                  ? ` • ${new Date(data.nextDueTaskDueDate).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : null}
              </span>
            ) : (
              'No upcoming due dates'
            )}
            icon={<Calendar className="h-4 w-4" />}
          />
          <HeroMetric
            label="Completed"
            value={isLoading ? '—' : data?.completedTasks ?? '—'}
            helper="Closed items across Zen Workspace"
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <HeroMetric
            label="Shared lists"
            value={isLoading ? '—' : data?.sharedLists ?? '—'}
            helper={isLoading ? null : `${data?.totalLists ?? 0} total lists`}
            icon={<ListTodo className="h-4 w-4" />}
          />
          <HeroMetric
            label="Connections"
            value={isLoading ? '—' : data?.totalFriends ?? '—'}
            helper={isLoading ? null : `${data?.pendingConnections ?? 0} pending requests`}
            icon={<Users className="h-4 w-4" />}
          />
        </div>
      </div>
    </section>
  );
}
