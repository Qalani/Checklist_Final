'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, List as ListIcon, Sparkles, CalendarClock, ArrowRight, Users } from 'lucide-react';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ParallaxBackground from '@/components/ParallaxBackground';
import AuthPanel from '@/components/AuthPanel';
import QuickStats from '@/components/QuickStats';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useLists } from '@/features/lists/useLists';
import { useFriends } from '@/features/friends/useFriends';

function LoadingScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sage-200 border-t-sage-600" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user, authChecked, signOut } = useAuthSession();
  const {
    tasks,
    categories,
    status: checklistStatus,
    syncing: checklistSyncing,
  } = useChecklist(user?.id ?? null);
  const {
    lists,
    status: listsStatus,
    syncing: listsSyncing,
  } = useLists(user?.id ?? null);
  const {
    friends,
    incomingRequests,
    status: friendsStatus,
    syncing: friendsSyncing,
  } = useFriends(user?.id ?? null);

  const isTasksLoading = checklistStatus === 'loading' || checklistSyncing;
  const isListsLoading = listsStatus === 'loading' || listsSyncing;
  const isFriendsLoading = friendsStatus === 'loading' || friendsSyncing;

  const activeTasksCount = useMemo(() => tasks.filter(task => !task.completed).length, [tasks]);
  const completedTasksCount = useMemo(() => tasks.filter(task => task.completed).length, [tasks]);

  const nextDueTask = useMemo(() => {
    return tasks
      .filter(task => !task.completed && task.due_date)
      .sort((a, b) => {
        const dateA = new Date(a.due_date as string).getTime();
        const dateB = new Date(b.due_date as string).getTime();
        return dateA - dateB;
      })[0];
  }, [tasks]);

  const nextDueLabel = nextDueTask
    ? `Next due ${new Date(nextDueTask.due_date as string).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'No upcoming tasks';

  if (!authChecked) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
        <ParallaxBackground />
        <div className="relative z-10 flex min-h-screen flex-col">
          <header className="px-4 sm:px-6 lg:px-8 py-6">
            <div className="max-w-7xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 flex items-center justify-center shadow-medium">
                  <Sparkles className="w-5 h-5 text-white" />
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

          <main className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 px-4 sm:px-6 lg:px-8 pb-12">
            <div className="max-w-xl text-center lg:text-left space-y-4">
              <h2 className="text-3xl font-semibold text-zen-900">
                Stay organized with mindful task management
              </h2>
              <p className="text-zen-600 text-base">
                Create an account or sign in to sync your tasks, lists, and categories securely across devices.
              </p>
            </div>
            <AuthPanel />
          </main>
        </div>
      </div>
    );
  }

  const featureTiles = [
    {
      key: 'tasks',
      title: 'Tasks',
      description: 'Capture, prioritize, and complete your tasks with a mindful flow.',
      href: '/tasks',
      icon: LayoutGrid,
      primaryStat: isTasksLoading ? '—' : activeTasksCount,
      primaryLabel: 'Active tasks',
      secondaryLabel: isTasksLoading ? 'Syncing tasks…' : nextDueLabel,
    },
    {
      key: 'lists',
      title: 'Lists',
      description: 'Curate collections to group ideas, routines, and shared plans.',
      href: '/lists',
      icon: ListIcon,
      primaryStat: isListsLoading ? '—' : lists.length,
      primaryLabel: 'Lists saved',
      secondaryLabel: isListsLoading
        ? 'Syncing lists…'
        : lists.length > 0
          ? 'Tap to explore your collections'
          : 'Start your first list',
    },
    {
      key: 'friends',
      title: 'Friends',
      description: 'Add people you trust and collaborate in real time.',
      href: '/friends',
      icon: Users,
      primaryStat: isFriendsLoading ? '—' : friends.length,
      primaryLabel: 'Friends connected',
      secondaryLabel: isFriendsLoading
        ? 'Syncing friends…'
        : incomingRequests.length > 0
          ? `${incomingRequests.length} pending invitations`
          : 'Invite someone new today',
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-surface/70 border-b border-zen-200 shadow-soft">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 flex items-center justify-center shadow-medium">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-zen-900">Zen Tasks</h1>
                  <p className="text-sm text-zen-600">Your mindful workspace</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 justify-start lg:justify-end">
                <ThemeSwitcher />
                <button
                  type="button"
                  onClick={() => {
                    void signOut();
                  }}
                  className="px-4 py-2 rounded-lg bg-zen-900 text-white text-sm font-medium shadow-soft hover:bg-zen-800 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
              <div className="space-y-4 lg:col-span-3">
                <p className="text-sm text-zen-500">Welcome back</p>
                <h2 className="text-3xl font-semibold text-zen-900">
                  Create calm across your work and life with a single dashboard.
                </h2>
                <p className="text-zen-600 max-w-xl">
                  Jump back into tasks or start planning with lists. Your workspace keeps everything synced and easy to find.
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-3 rounded-2xl bg-surface/80 border border-zen-200 px-4 py-3 shadow-soft">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sage-400 to-sage-500 flex items-center justify-center text-white">
                      <LayoutGrid className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-zen-500">Completed</p>
                      <p className="text-lg font-semibold text-zen-900">{isTasksLoading ? '—' : completedTasksCount}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl bg-surface/80 border border-zen-200 px-4 py-3 shadow-soft">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zen-300 to-zen-400 flex items-center justify-center text-zen-900">
                      <CalendarClock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-zen-500">Focus</p>
                      <p className="text-lg font-semibold text-zen-900">{isTasksLoading ? 'Syncing…' : nextDueLabel}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="rounded-3xl bg-surface/80 border border-zen-200 shadow-soft overflow-hidden">
                  <div className="border-b border-zen-200 px-5 py-4">
                    <h3 className="text-sm font-semibold text-zen-500 uppercase tracking-wide">Snapshot</h3>
                  </div>
                  <div className="p-5">
                    <QuickStats tasks={tasks} categories={categories} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {featureTiles.map(tile => {
                const Icon = tile.icon;
                return (
                  <motion.div
                    key={tile.key}
                    whileHover={{ y: -4, scale: 1.01 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  >
                    <Link
                      href={tile.href}
                      className="group block h-full rounded-3xl bg-surface/80 border border-zen-200 shadow-soft overflow-hidden"
                    >
                      <div className="flex h-full flex-col justify-between">
                        <div className="p-6 space-y-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 flex items-center justify-center text-white shadow-medium">
                                <Icon className="w-6 h-6" />
                              </div>
                              <div>
                                <h3 className="text-xl font-semibold text-zen-900">{tile.title}</h3>
                                <p className="text-sm text-zen-600">{tile.description}</p>
                              </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-zen-400 transition-transform group-hover:translate-x-1" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-zen-500">{tile.primaryLabel}</p>
                              <p className="text-2xl font-semibold text-zen-900">{tile.primaryStat}</p>
                            </div>
                            <div>
                              <p className="text-sm text-zen-500">What&apos;s next</p>
                              <p className="text-sm font-medium text-zen-700">{tile.secondaryLabel}</p>
                            </div>
                          </div>
                        </div>
                        <div className="px-6 py-4 bg-zen-50/60 text-sm text-zen-500 border-t border-zen-200">
                          Tap to open the {tile.title.toLowerCase()} workspace
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
