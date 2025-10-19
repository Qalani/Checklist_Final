'use client';

import Link from 'next/link';
import { Suspense, useMemo } from 'react';
import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { CheckSquare, ListTodo, StickyNote, Users } from 'lucide-react';

import ParallaxBackground from '@/components/ParallaxBackground';
import SettingsMenu from '@/components/SettingsMenu';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useLists } from '@/features/lists/useLists';
import { useNotes } from '@/features/notes/useNotes';
import { useFriends } from '@/features/friends/useFriends';

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

interface FeatureDefinition {
  key: 'tasks' | 'lists' | 'notes' | 'friends';
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  primary: string;
  secondary: string;
}

function HomePageContent() {
  const searchParams = useSearchParams();
  const demoMode = searchParams?.get('demo') === '1';

  const { user, signOut } = useAuthSession();
  const targetUserId = demoMode ? null : user?.id ?? null;

  const { tasks, status: checklistStatus, syncing: checklistSyncing } = useChecklist(targetUserId);
  const { lists, status: listsStatus, syncing: listsSyncing } = useLists(targetUserId);
  const { notes, status: notesStatus, syncing: notesSyncing } = useNotes(targetUserId);
  const { friends, status: friendsStatus, syncing: friendsSyncing } = useFriends(targetUserId);

  const userEmail = useMemo(() => {
    if (demoMode) {
      return 'Demo session';
    }
    return user?.email ?? user?.user_metadata?.email ?? null;
  }, [demoMode, user]);

  const tasksLoading = checklistStatus === 'loading' || checklistSyncing;
  const listsLoading = listsStatus === 'loading' || listsSyncing;
  const notesLoading = notesStatus === 'loading' || notesSyncing;
  const friendsLoading = friendsStatus === 'loading' || friendsSyncing;

  const openTasks = useMemo(() => {
    if (demoMode) {
      return 4;
    }
    return tasks.filter(task => !task.completed).length;
  }, [demoMode, tasks]);

  const completedTasks = useMemo(() => {
    if (demoMode) {
      return 18;
    }
    return tasks.filter(task => task.completed).length;
  }, [demoMode, tasks]);

  const totalLists = demoMode ? 6 : lists.length;
  const totalNotes = demoMode ? 12 : notes.length;
  const totalFriends = demoMode ? 3 : friends.length;

  const featureCards = useMemo<FeatureDefinition[]>(
    () => [
      {
        key: 'tasks',
        title: 'Tasks',
        description: 'Plan mindful to-dos, schedule focus sessions, and celebrate wins.',
        href: '/tasks',
        icon: CheckSquare,
        primary: tasksLoading ? 'Syncing…' : `${openTasks} active tasks`,
        secondary: tasksLoading ? '' : `${completedTasks} completed`,
      },
      {
        key: 'lists',
        title: 'Lists',
        description: 'Capture routines, rituals, and bucket lists that evolve with you.',
        href: '/lists',
        icon: ListTodo,
        primary: listsLoading ? 'Syncing…' : `${totalLists} curated lists`,
        secondary: '',
      },
      {
        key: 'notes',
        title: 'Notes',
        description: 'Keep grounding reflections and gentle reminders close at hand.',
        href: '/notes',
        icon: StickyNote,
        primary: notesLoading ? 'Syncing…' : `${totalNotes} saved notes`,
        secondary: '',
      },
      {
        key: 'friends',
        title: 'Friends',
        description: 'Share progress with trusted companions and uplift one another.',
        href: '/friends',
        icon: Users,
        primary: friendsLoading ? 'Syncing…' : `${totalFriends} connected friends`,
        secondary: '',
      },
    ],
    [
      completedTasks,
      friendsLoading,
      listsLoading,
      notesLoading,
      openTasks,
      tasksLoading,
      totalFriends,
      totalLists,
      totalNotes,
    ],
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex flex-col gap-6 border-b border-white/50 bg-white/60 px-6 py-6 backdrop-blur-lg dark:border-slate-800/40 dark:bg-slate-950/30 sm:flex-row sm:items-center sm:justify-between lg:px-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zen-500">Zen Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-zen-900 dark:text-white sm:text-4xl">Stay present with the essentials</h1>
            <p className="mt-2 max-w-2xl text-sm text-zen-600 dark:text-slate-300">
              A calmer home screen that keeps tasks, lists, notes, and friends within easy reach so you can stay in flow.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {userEmail ? (
              <span className="hidden text-sm text-zen-500 dark:text-slate-300 sm:inline">{userEmail}</span>
            ) : null}
            <SettingsMenu userEmail={userEmail} onSignOut={signOut} />
          </div>
        </header>

        <main className="flex-1 px-6 pb-16 pt-10 lg:px-12">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
            <section className="space-y-6">
              <h2 className="text-xl font-semibold text-zen-900 dark:text-white">Your mindful toolkit</h2>
              <p className="max-w-3xl text-sm text-zen-600 dark:text-slate-300">
                Each space is tuned for gentle productivity. Choose a card to dive in, or explore everything at your own pace.
              </p>
              <div className="grid gap-6 sm:grid-cols-2">
                {featureCards.map(card => (
                  <FeatureCard key={card.key} card={card} />
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/50 bg-white/60 p-8 text-sm text-zen-600 shadow-soft backdrop-blur-xl dark:border-slate-800/40 dark:bg-slate-950/40 dark:text-slate-200">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-zen-900 dark:text-white">Need a fresh start?</h3>
                  <p className="mt-1 max-w-xl text-sm text-zen-600 dark:text-slate-300">
                    Jump into any workspace to begin curating tasks, reflecting through notes, or connecting with friends.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {featureCards.map(card => (
                    <Link
                      key={card.key}
                      href={card.href}
                      className="inline-flex items-center justify-center rounded-xl border border-zen-200/80 bg-white/80 px-4 py-2 text-sm font-medium text-zen-700 transition hover:border-sage-400 hover:text-sage-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-700"
                    >
                      Go to {card.title}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function FeatureCard({ card }: { card: FeatureDefinition }) {
  const Icon = card.icon;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="group relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-6 shadow-soft backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-lift dark:border-slate-800/40 dark:bg-slate-950/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-zen-200/70 bg-zen-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zen-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
            <Icon className="h-4 w-4" />
            {card.title}
          </div>
          <p className="text-sm text-zen-600 dark:text-slate-300">{card.description}</p>
        </div>
        <Link
          href={card.href}
          className="rounded-full border border-transparent bg-zen-900/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-zen-800/90 dark:bg-white/80 dark:text-slate-900 dark:hover:bg-white"
        >
          Open
        </Link>
      </div>
      <dl className="mt-6 space-y-1 text-sm">
        <div className="text-base font-semibold text-zen-900 dark:text-white">{card.primary}</div>
        {card.secondary ? (
          <div className="text-xs text-zen-500 dark:text-slate-400">{card.secondary}</div>
        ) : null}
      </dl>
      <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
        <div className="absolute inset-0 bg-gradient-to-br from-zen-100/40 via-transparent to-sage-100/50" />
      </div>
    </motion.article>
  );
}
