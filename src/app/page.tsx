'use client';

import Link from 'next/link';
import { ArrowRight, LayoutGrid, List, Sparkles } from 'lucide-react';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ParallaxBackground from '@/components/ParallaxBackground';
import AuthPanel from '@/components/AuthPanel';
import QuickStats from '@/components/QuickStats';
import { useSupabaseAuth } from '@/lib/hooks/useSupabaseAuth';
import { useChecklist } from '@/features/checklist/useChecklist';

export default function HomePage() {
  const { user, authChecked } = useSupabaseAuth();
  const { tasks, categories, status, error: checklistError, syncing } = useChecklist(user?.id ?? null);

  const isChecklistLoading = status === 'idle' || status === 'loading';
  const activeTasks = tasks.filter(task => !task.completed).length;
  const completedTasks = tasks.filter(task => task.completed).length;
  const tasksSummary = isChecklistLoading
    ? syncing
      ? 'Syncing tasks…'
      : 'Loading tasks…'
    : `${activeTasks} active • ${completedTasks} completed`;

  if (!authChecked) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
        <ParallaxBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-sage-200 border-t-sage-600" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
        <ParallaxBackground />
        <div className="relative z-10 flex min-h-screen flex-col">
          <header className="px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 shadow-medium">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-zen-900">Zen Tasks</h1>
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
                Create an account or sign in to sync your tasks and categories securely across devices.
              </p>
            </div>
            <AuthPanel />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 min-h-screen">
        <header className="border-b border-zen-200 bg-surface/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 shadow-medium">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-zen-900">Zen Tasks</h1>
                <p className="text-sm text-zen-600">Choose where to focus today</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              {syncing && (
                <span className="rounded-full bg-sage-100 px-3 py-1 text-xs font-medium text-sage-700 shadow-soft">
                  Syncing changes…
                </span>
              )}
              <ThemeSwitcher />
            </div>
          </div>
        </header>

        <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
          <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
            <div className="space-y-4">
              <h2 className="text-3xl font-semibold text-zen-900">Welcome back</h2>
              <p className="text-base text-zen-600">
                Pick a workspace tile to jump straight into tasks or explore the brand new lists experience.
              </p>
            </div>
            {!isChecklistLoading && (
              <div className="rounded-3xl border border-zen-200 bg-surface/80 p-6 shadow-soft">
                <p className="text-xs font-semibold uppercase tracking-wide text-zen-500">Today’s momentum</p>
                <h3 className="mt-2 text-2xl font-semibold text-zen-900">{activeTasks} active tasks</h3>
                <p className="mt-1 text-sm text-zen-600">
                  You have completed {completedTasks} tasks so far. Keep the flow going!
                </p>
              </div>
            )}
          </section>

          {checklistError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {checklistError}
            </div>
          )}

          <section className="grid gap-6 md:grid-cols-2">
            <Link
              href="/tasks"
              className="group relative overflow-hidden rounded-3xl border border-zen-200 bg-surface/80 p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-medium"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sage-100/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex h-full flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 text-white shadow-medium">
                      <LayoutGrid className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-sage-600">Core workspace</p>
                      <h3 className="text-xl font-semibold text-zen-900">Tasks</h3>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-medium text-sage-600">
                    Open
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
                <p className="text-sm text-zen-600">
                  Capture ideas, prioritize mindfully, and schedule gentle reminders to keep your commitments balanced.
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-zen-500">
                  <span className="rounded-full bg-sage-100 px-3 py-1 text-sage-700 shadow-soft">{tasksSummary}</span>
                  <span className="rounded-full bg-zen-100 px-3 py-1 text-zen-600 shadow-soft">Drag-and-drop layouts</span>
                </div>
              </div>
            </Link>

            <Link
              href="/lists"
              className="group relative overflow-hidden rounded-3xl border border-zen-200 bg-surface/80 p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-medium"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warm-100/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex h-full flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-warm-500 to-warm-600 text-white shadow-medium">
                      <List className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-warm-600">New</p>
                      <h3 className="text-xl font-semibold text-zen-900">Lists</h3>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-medium text-warm-600">
                    Preview
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
                <p className="text-sm text-zen-600">
                  Build flexible collections for recipes, reading queues, packing plans, and everything else in your world.
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-zen-500">
                  <span className="rounded-full bg-warm-100 px-3 py-1 text-warm-700 shadow-soft">Early access</span>
                  <span className="rounded-full bg-zen-100 px-3 py-1 text-zen-600 shadow-soft">Cross-device sync</span>
                </div>
              </div>
            </Link>
          </section>

          {!isChecklistLoading && (
            <section className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-zen-900">Productivity snapshot</h3>
                <p className="text-sm text-zen-600">A quick glance at how your tasks and categories are evolving.</p>
              </div>
              <QuickStats tasks={tasks} categories={categories} />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
