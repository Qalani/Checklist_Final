'use client';

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
              Arrange widgets to match your flow. Drag cards to new slots, toggle visibility, and we&apos;ll remember your layout for next time.
            </p>
            {demoMode ? (
              <p className="mt-2 text-xs font-medium text-sage-600 dark:text-slate-300">Demo mode: changes are stored locally in this browser.</p>
            ) : null}
            {error ? <p className="mt-2 text-sm text-red-600">{error.message}</p> : null}
          </div>
          <ThemeSwitcher />
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border border-sage-100 bg-white/70 p-6 shadow-medium backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-sage-200 border-t-sage-500" />
              </div>
            ) : null}
            <DashboardBoard userId={boardUserId} layout={layout} moveWidget={moveWidget} />
          </div>
          <WidgetVisibilityMenu
            layout={layout}
            onToggle={widgetId => {
              void toggleWidget(widgetId);
            }}
            onReset={() => {
              void resetLayout();
            }}
            isSaving={isSaving}
          />
        </div>
      </div>
    </div>
  );
}
