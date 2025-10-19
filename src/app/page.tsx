'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import AuthPanel from '@/components/AuthPanel';
import ParallaxBackground from '@/components/ParallaxBackground';
import SettingsMenu from '@/components/SettingsMenu';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import DashboardBoard from '@/features/dashboard/DashboardBoard';
import DashboardHero from '@/features/dashboard/DashboardHero';
import WidgetVisibilityMenu from '@/features/dashboard/WidgetVisibilityMenu';
import { useDashboardLayout } from '@/features/dashboard/hooks/useDashboardLayout';
import { useAuthSession } from '@/lib/hooks/useAuthSession';

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

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const [isEditMode, setIsEditMode] = useState(false);
  const { user, authChecked, signOut } = useAuthSession();
  const searchParams = useSearchParams();
  const demoMode = searchParams?.get('demo') === '1';
  const targetUserId = demoMode ? null : user?.id ?? null;
  const { layout, isLoading, isSaving, error, moveWidget, toggleWidget, resetLayout } = useDashboardLayout(targetUserId);

  const userEmail = useMemo(() => {
    if (demoMode) {
      return 'Demo session';
    }
    return user?.email ?? user?.user_metadata?.email ?? null;
  }, [demoMode, user]);

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
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 text-white shadow-medium">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-zen-900">Zen Workspace</h1>
                  <p className="text-sm text-zen-600">Your mindful workspace</p>
                </div>
              </div>
              <div className="w-full sm:w-auto">
                <ThemeSwitcher />
              </div>
            </div>
          </header>

          <main className="flex flex-1 flex-col items-center justify-center gap-12 px-4 pb-12 sm:px-6 lg:flex-row lg:px-8">
            <div className="max-w-xl space-y-4 text-center lg:text-left">
              <h2 className="text-3xl font-semibold text-zen-900">Stay organized with mindful task management</h2>
              <p className="text-base text-zen-600">
                Create an account or sign in to sync your tasks, lists, and categories securely across devices.
              </p>
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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-50 border-b border-zen-200 bg-surface/70 backdrop-blur-xl shadow-soft">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 text-white shadow-medium">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-zen-900">Zen Workspace</h1>
                <p className="text-sm text-zen-600">Your mindful workspace</p>
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

            {demoMode ? (
              <div className="rounded-3xl border border-dashed border-sage-300 bg-white/70 p-4 text-sm text-sage-700 shadow-small backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                Demo mode: changes are stored locally in this browser.
              </div>
            ) : null}

            {error ? (
              <p className="rounded-3xl border border-red-100 bg-red-50/80 p-4 text-sm text-red-700 shadow-small dark:border-red-900/40 dark:bg-red-900/40 dark:text-red-100">
                {error.message}
              </p>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-3xl border border-sage-100 bg-white/80 p-6 shadow-medium backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-sage-100/80 bg-sage-50/80 p-4 text-sm text-sage-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs uppercase tracking-wide text-sage-600 dark:bg-slate-800/80 dark:text-slate-200">
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
          </section>
        </main>
      </div>
    </div>
  );
}
