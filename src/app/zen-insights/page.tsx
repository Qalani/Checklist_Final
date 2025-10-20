'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, LayoutGrid, Sparkles } from 'lucide-react';

import AuthPanel from '@/components/AuthPanel';
import ParallaxBackground from '@/components/ParallaxBackground';
import SettingsMenu from '@/components/SettingsMenu';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import DashboardHero from '@/features/dashboard/DashboardHero';
import { useDashboardLayout } from '@/features/dashboard/hooks/useDashboardLayout';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import type { DashboardBoardProps } from '@/features/dashboard/DashboardBoard';
import type { WidgetVisibilityMenuProps } from '@/features/dashboard/WidgetVisibilityMenu';

const DashboardBoard = dynamic<DashboardBoardProps>(
  () => import('@/features/dashboard/DashboardBoard'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sage-200 border-t-sage-500" />
      </div>
    ),
  },
);

const WidgetVisibilityMenu = dynamic<WidgetVisibilityMenuProps>(
  () => import('@/features/dashboard/WidgetVisibilityMenu'),
  {
    loading: () => (
      <div className="rounded-3xl border border-zen-200/60 bg-surface/80 p-6 text-sm text-sage-600 shadow-medium dark:border-zen-700/40 dark:bg-zen-800/20 dark:text-zen-200">
        Loading widgets…
      </div>
    ),
  },
);

function LoadingScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-sage-200 border-t-sage-600" />
      </div>
    </div>
  );
}

export default function ZenInsightsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ZenInsightsPageContent />
    </Suspense>
  );
}

function ZenInsightsPageContent() {
  const [isEditMode, setIsEditMode] = useState(false);
  const { user, authChecked, signOut } = useAuthSession();
  const searchParams = useSearchParams();
  const demoMode = searchParams?.get('demo') === '1';
  const targetUserId = demoMode ? null : user?.id ?? null;
  const { layout, isLoading, isSaving, error, moveWidget, toggleWidget, resetLayout } = useDashboardLayout(targetUserId);
  const { tasks, status: checklistStatus, syncing: checklistSyncing } = useChecklist(targetUserId);

  const userEmail = useMemo(() => {
    if (demoMode) {
      return 'Demo session';
    }
    return user?.email ?? user?.user_metadata?.email ?? null;
  }, [demoMode, user]);

  const isTasksLoading = checklistStatus === 'loading' || checklistSyncing;

  const completedTasksCount = useMemo(() => {
    if (demoMode) {
      return 18;
    }
    return tasks.filter(task => task.completed).length;
  }, [demoMode, tasks]);

  const nextDueLabel = useMemo(() => {
    if (demoMode) {
      return 'Next due tomorrow at 9:00 AM';
    }

    const nextDueTask = tasks
      .filter(task => !task.completed && task.due_date)
      .sort((a, b) => {
        const dateA = new Date(a.due_date as string).getTime();
        const dateB = new Date(b.due_date as string).getTime();
        return dateA - dateB;
      })[0];

    if (!nextDueTask) {
      return 'No upcoming tasks';
    }

    return `Next due ${new Date(nextDueTask.due_date as string).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }, [demoMode, tasks]);

  if (!authChecked) {
    return <LoadingScreen />;
  }

  if (!user && !demoMode) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
        <ParallaxBackground />
        <div className="relative z-10 flex min-h-screen flex-col">
          <header className="px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-zen-500 to-sage-500 text-white shadow-medium">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-zen-900">Zen Workspace</h1>
                  <p className="text-sm text-zen-600">Your composed control center</p>
                </div>
              </div>
              <div className="w-full sm:w-auto">
                <ThemeSwitcher />
              </div>
            </div>
          </header>

          <main className="flex flex-1 flex-col items-center justify-center gap-12 px-4 pb-12 sm:px-6 lg:flex-row lg:px-8">
            <div className="max-w-xl space-y-4 text-center lg:text-left">
              <h2 className="text-3xl font-semibold text-zen-900">Sign in to unlock Zen Insights</h2>
              <p className="text-base text-zen-600">
                Access tailored dashboard widgets, focus metrics, and sharing controls once you&apos;re signed in.
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-zen-300 bg-surface/80 px-4 py-2 text-sm font-semibold text-zen-600 shadow-small transition hover:border-zen-400 hover:text-zen-700 focus:outline-none focus:ring-2 focus:ring-zen-300 focus:ring-offset-2 focus:ring-offset-[rgb(var(--color-surface))]"
              >
                Back to home
              </Link>
            </div>
            <AuthPanel />
          </main>
        </div>
      </div>
    );
  }

  const boardUserId = demoMode ? null : user?.id ?? null;
  const userName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-sage-50 to-warm-50 dark:from-zen-50 dark:via-zen-100 dark:to-zen-200">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-50 border-b border-zen-200/70 bg-surface/80 backdrop-blur-2xl shadow-soft">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-zen-500 to-sage-500 text-white shadow-medium">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-zen-900">Zen Insights</h1>
                <p className="text-sm text-zen-600">Curate dashboards and highlight meaningful metrics</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-3 lg:justify-end">
              <SettingsMenu
                userEmail={userEmail}
                onSignOut={() => {
                  if (!demoMode) {
                    void signOut();
                  }
                }}
              />
            </div>
          </div>
        </header>

        <main className="flex-1">
          <section className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
            <DashboardHero
              userName={demoMode ? 'Demo User' : userName}
              userId={boardUserId}
              isEditMode={isEditMode}
              isSaving={isSaving}
              onToggleEditMode={() => setIsEditMode(current => !current)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-2xl border border-zen-200/60 bg-surface/80 px-4 py-3 shadow-soft backdrop-blur-sm dark:border-zen-700/40">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-zen-400 to-zen-600 text-white">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-zen-500 dark:text-zen-300">Completed</p>
                  <p className="text-lg font-semibold text-zen-900">{isTasksLoading ? '—' : completedTasksCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-zen-200/60 bg-surface/80 px-4 py-3 shadow-soft backdrop-blur-sm dark:border-zen-700/40">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-warm-400 to-warm-500 text-white">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-zen-500 dark:text-zen-300">Focus</p>
                  <p className="text-lg font-semibold text-zen-900">{isTasksLoading ? 'Syncing…' : nextDueLabel}</p>
                </div>
              </div>
            </div>

            {demoMode ? (
              <div className="rounded-3xl border border-dashed border-sage-300 bg-surface/70 p-4 text-sm text-sage-700 shadow-small backdrop-blur-sm dark:border-zen-700/40 dark:text-zen-200">
                Demo mode: changes are stored locally in this browser.
              </div>
            ) : null}

            {error ? (
              <p className="rounded-3xl border border-red-100 bg-red-50/80 p-4 text-sm text-red-700 shadow-small dark:border-red-900/40 dark:bg-red-900/40 dark:text-red-100">
                {error.message}
              </p>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-3xl border border-zen-200/60 bg-surface/80 p-6 shadow-medium backdrop-blur-sm dark:border-zen-700/40">
                <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-sage-100/80 bg-sage-50/80 p-4 text-sm text-sage-700 dark:border-zen-700/40 dark:bg-zen-800/20 dark:text-zen-200 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface/80 px-3 py-1 text-xs uppercase tracking-wide text-sage-600 dark:text-zen-900">
                      {isEditMode ? 'Edit mode' : 'View mode'}
                    </span>
                    <span>
                      {isEditMode
                        ? 'Drag widgets between columns, reorder them, or hide cards from the menu.'
                        : 'Switch to edit mode to personalize the layout for this dashboard.'}
                    </span>
                  </div>
                  {!isEditMode ? (
                    <button
                      type="button"
                      onClick={() => setIsEditMode(true)}
                      className="inline-flex items-center justify-center rounded-full border border-sage-500 bg-sage-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sage-600 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 focus:ring-offset-[rgb(var(--color-surface))] dark:border-zen-600 dark:bg-zen-700 dark:hover:bg-zen-600 dark:focus:ring-zen-500"
                    >
                      Enter edit mode
                    </button>
                  ) : (
                    <span className="text-xs text-sage-600 dark:text-zen-200">Changes are saved automatically.</span>
                  )}
                </div>
                {isLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-sage-200 border-t-sage-500" />
                  </div>
                ) : null}
                <DashboardBoard userId={boardUserId} layout={layout} moveWidget={moveWidget} isEditable={isEditMode} />
              </div>
              <WidgetVisibilityMenu
                layout={layout}
                onToggle={widgetId => {
                  if (!isEditMode) return;
                  void toggleWidget(widgetId);
                }}
                onReset={() => {
                  if (!isEditMode) return;
                  void resetLayout();
                }}
                isSaving={isSaving}
                isEditable={isEditMode}
                onRequestEditMode={() => setIsEditMode(true)}
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
