'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import AuthPanel from '@/components/AuthPanel';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useDashboardLayout } from '@/features/dashboard/hooks/useDashboardLayout';
import DashboardBoard from '@/features/dashboard/DashboardBoard';
import WidgetVisibilityMenu from '@/features/dashboard/WidgetVisibilityMenu';
import { useAuthSession } from '@/lib/hooks/useAuthSession';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(() => searchParams?.get('demo') === '1');
  const { user, authChecked } = useAuthSession();

  useEffect(() => {
    const demoParam = searchParams?.get('demo');
    if (demoParam === '1') {
      setIsDemoMode(true);
    } else if (demoParam === '0') {
      setIsDemoMode(false);
    }
  }, [searchParams]);

  const targetUserId = isDemoMode ? null : user?.id ?? null;
  const {
    layout,
    isLoading,
    isSaving,
    error,
    moveWidget,
    toggleWidget,
    resetLayout,
  } = useDashboardLayout(targetUserId);

  const boardUserId = isDemoMode ? null : user?.id ?? null;

  const updateDemoQueryParam = useCallback(
    (nextDemo: boolean) => {
      const current = new URLSearchParams(searchParams?.toString() ?? '');
      if (nextDemo) {
        current.set('demo', '1');
      } else {
        current.delete('demo');
      }

      const queryString = current.toString();
      router.replace(`/dashboard${queryString ? `?${queryString}` : ''}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleToggleDemoMode = useCallback(() => {
    setIsEditMode(false);
    setIsDemoMode(prev => {
      const next = !prev;
      updateDemoQueryParam(next);
      return next;
    });
  }, [updateDemoQueryParam]);

  const modeBadgeLabel = useMemo(() => {
    if (isDemoMode) {
      return 'Demo mode';
    }
    return isEditMode ? 'Edit mode' : 'View mode';
  }, [isDemoMode, isEditMode]);

  if (!authChecked) {
    return <LoadingScreen />;
  }

  if (!user && !isDemoMode) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(88,180,141,0.12),_transparent_60%)]" />
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-16">
          <div className="max-w-xl space-y-4 text-center">
            <h1 className="text-3xl font-semibold text-zen-900">Craft your mindful dashboard</h1>
            <p className="text-zen-600">
              Sign in to sync your personalized layout across devices, or explore the interactive demo to try the
              new editing experience instantly.
            </p>
          </div>
          <div className="flex w-full max-w-3xl flex-col gap-6 rounded-3xl border border-sage-100 bg-white/90 p-8 shadow-large backdrop-blur-sm lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 space-y-3 text-left">
              <h2 className="text-xl font-semibold text-zen-900">Sign in for a persistent workspace</h2>
              <p className="text-sm text-zen-600">
                Save layouts, widget visibility, and productivity insights that travel with you everywhere you log in.
              </p>
              <div className="mt-4">
                <AuthPanel />
              </div>
            </div>
            <div className="flex-1 space-y-4 rounded-2xl bg-sage-50/80 p-6 text-left dark:bg-slate-900/60">
              <h2 className="text-lg font-semibold text-zen-900 dark:text-white">Just browsing?</h2>
              <p className="text-sm text-zen-600 dark:text-slate-300">
                Launch the demo dashboard to see the new editable layout with sample data. All changes stay on this
                device.
              </p>
              <button
                type="button"
                onClick={handleToggleDemoMode}
                className="inline-flex items-center justify-center rounded-full border border-sage-500 bg-sage-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sage-600 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2"
              >
                Preview the dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50 py-12 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4">
        <header className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-sage-100 bg-white/70 p-6 shadow-medium backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60 lg:flex-row lg:items-center">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-sage-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sage-600 dark:bg-slate-800/60 dark:text-slate-200">
              {modeBadgeLabel}
              {isSaving ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sage-500 dark:text-slate-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-sage-500" /> Saving
                </span>
              ) : null}
            </div>
            <h1 className="text-3xl font-semibold text-zen-900 dark:text-white">Your mindful workspace</h1>
            <p className="max-w-2xl text-sm text-zen-500 dark:text-slate-300">
              Arrange widgets, toggle their visibility, and keep the layout that matches your flow. Changes are saved
              automatically for signed-in users and stored locally in demo mode.
            </p>
            {error ? <p className="text-sm text-red-600">{error.message}</p> : null}
            {isDemoMode ? (
              <p className="text-xs font-medium text-sage-600 dark:text-slate-300">
                Demo mode is active. Try the editing tools with curated sample data—no account required.
              </p>
            ) : null}
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
            <button
              type="button"
              onClick={handleToggleDemoMode}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                isDemoMode
                  ? 'border-sage-500 text-sage-600 hover:bg-sage-50 focus:ring-sage-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
                  : 'border-sage-300 text-sage-700 hover:bg-sage-50 focus:ring-sage-400 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {isDemoMode ? 'Exit Demo' : 'Preview Demo'}
            </button>
            <ThemeSwitcher />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border border-sage-100 bg-white/70 p-6 shadow-medium backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60">
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-sage-100/70 bg-sage-50/70 p-4 text-sm text-sage-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 font-medium">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs uppercase tracking-wide text-sage-600 dark:bg-slate-800/80 dark:text-slate-200">
                  {modeBadgeLabel}
                </span>
                <span>
                  {isDemoMode
                    ? 'Experiment freely—demo updates stay on this device.'
                    : isEditMode
                      ? 'Reorder widgets and adjust visibility. Exit edit mode when you are finished.'
                      : 'Dashboard editing is locked. Enter edit mode to rearrange widgets.'}
                </span>
              </div>
              {!isEditMode && !isDemoMode ? (
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
            <DashboardBoard
              userId={boardUserId}
              layout={layout}
              moveWidget={moveWidget}
              isEditable={isEditMode || isDemoMode}
              isDemoMode={isDemoMode}
            />
          </div>
          <WidgetVisibilityMenu
            layout={layout}
            onToggle={widgetId => {
              if (!isEditMode && !isDemoMode) return;
              void toggleWidget(widgetId);
            }}
            onReset={() => {
              if (!isEditMode && !isDemoMode) return;
              void resetLayout();
            }}
            isSaving={isSaving}
            isEditable={isEditMode || isDemoMode}
            isDemoMode={isDemoMode}
            onRequestEditMode={() => setIsEditMode(true)}
          />
        </div>
      </div>
    </div>
  );
}
