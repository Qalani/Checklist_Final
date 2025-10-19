'use client';

import { Suspense, useState } from 'react';

import AuthPanel from '@/components/AuthPanel';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useDashboardLayout } from '@/features/dashboard/hooks/useDashboardLayout';
import DashboardBoard from '@/features/dashboard/DashboardBoard';
import WidgetVisibilityMenu from '@/features/dashboard/WidgetVisibilityMenu';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useSearchParams } from 'next/navigation';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-sage-200 border-t-sage-500" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const [isEditMode, setIsEditMode] = useState(false);
  const { user, authChecked } = useAuthSession();
  const searchParams = useSearchParams();
  const demoMode = searchParams?.get('demo') === '1';
  const targetUserId = demoMode ? null : user?.id ?? null;
  const { layout, isLoading, isSaving, error, moveWidget, toggleWidget, resetLayout } = useDashboardLayout(targetUserId);

  if (!authChecked) {
    return <LoadingScreen />;
  }

  if (!user && !demoMode) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(88,180,141,0.15),_transparent_60%)]" />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-8 px-4">
          <div className="max-w-lg space-y-4 text-center">
            <h1 className="text-3xl font-semibold text-zen-900">Personalize your Zen dashboard</h1>
            <p className="text-zen-600">Sign in to customize widgets, track productivity, and save your layout preferences.</p>
          </div>
          <div className="w-full max-w-md rounded-3xl border border-sage-100 bg-white/90 p-6 shadow-large backdrop-blur-sm">
            <AuthPanel />
          </div>
        </div>
      </div>
    );
  }

  const boardUserId = demoMode ? null : user?.id ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4">
        <header className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-sage-100 bg-white/70 p-6 shadow-medium backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-sage-600 dark:text-slate-300">Dashboard</p>
            <h1 className="mt-1 text-3xl font-semibold text-zen-900 dark:text-white">Your mindful workspace</h1>
            <p className="mt-2 max-w-2xl text-sm text-zen-500 dark:text-slate-300">
              View your personalized overview here. When you&apos;re ready to rearrange widgets or update their visibility, switch into edit mode and we&apos;ll save the changes automatically.
            </p>
            {demoMode ? (
              <p className="mt-2 text-xs font-medium text-sage-600 dark:text-slate-300">Demo mode: changes are stored locally in this browser.</p>
            ) : null}
            {error ? <p className="mt-2 text-sm text-red-600">{error.message}</p> : null}
          </div>
          <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
            <button
              type="button"
              onClick={() => {
                setIsEditMode(prev => !prev);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                isEditMode
                  ? 'border-sage-600 bg-sage-600 text-white hover:bg-sage-700 focus:ring-sage-500'
                  : 'border-sage-300 text-sage-700 hover:bg-sage-50 focus:ring-sage-400 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
              aria-pressed={isEditMode}
            >
              {isEditMode ? 'Done Editing' : 'Edit Dashboard'}
            </button>
            <ThemeSwitcher />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border border-sage-100 bg-white/70 p-6 shadow-medium backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60">
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-sage-100/70 bg-sage-50/70 p-4 text-sm text-sage-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-medium">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs uppercase tracking-wide text-sage-600 dark:bg-slate-800/80 dark:text-slate-200">
                  {isEditMode ? 'Edit mode' : 'View mode'}
                </span>
                <span>
                  {isEditMode
                    ? 'Reorder widgets and adjust visibility. Exit edit mode when you are finished.'
                    : 'Dashboard editing is locked. Enter edit mode to rearrange widgets.'}
                </span>
              </div>
              {!isEditMode ? (
                <button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="inline-flex items-center justify-center rounded-full border border-sage-500 bg-sage-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sage-600 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900"
                >
                  Enter edit mode
                </button>
              ) : (
                <span className="text-xs text-sage-600 dark:text-slate-300">Changes are saved automatically.</span>
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
      </div>
    </div>
  );
}
