'use client';

import Link from 'next/link';
import { Suspense, useMemo } from 'react';
import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckSquare, ListTodo, StickyNote, Users } from 'lucide-react';

import ParallaxBackground from '@/components/ParallaxBackground';
import SettingsMenu from '@/components/SettingsMenu';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useLists } from '@/features/lists/useLists';
import { useNotes } from '@/features/notes/useNotes';
import { useFriends } from '@/features/friends/useFriends';

function LoadingScreen() {
  return (
    <div
      className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50 dark:from-[rgb(var(--color-zen-50)_/_0.95)] dark:via-[rgb(var(--color-zen-100)_/_0.85)] dark:to-[rgb(var(--color-sage-100)_/_0.9)]"
    >
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
  accentGradient: string;
  accentText: string;
  badgeBg: string;
  badgeText: string;
  footerBg: string;
  footerHoverBg: string;
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
        accentGradient: 'bg-gradient-to-br from-sage-500 to-sage-600',
        accentText: 'text-white',
        badgeBg: 'bg-sage-100/80 dark:bg-zen-800/30',
        badgeText: 'text-sage-600 dark:text-zen-900',
        footerBg: 'bg-sage-50/80 dark:bg-zen-800/20',
        footerHoverBg: 'group-hover:bg-sage-100/80 dark:group-hover:bg-zen-900/25',
      },
      {
        key: 'lists',
        title: 'Lists',
        description: 'Capture routines, rituals, and bucket lists that evolve with you.',
        href: '/lists',
        icon: ListTodo,
        primary: listsLoading ? 'Syncing…' : `${totalLists} curated lists`,
        secondary: '',
        accentGradient: 'bg-gradient-to-br from-zen-400 to-zen-500',
        accentText: 'text-zen-950',
        badgeBg: 'bg-zen-100/80 dark:bg-zen-800/30',
        badgeText: 'text-zen-500 dark:text-zen-900',
        footerBg: 'bg-zen-50/80 dark:bg-zen-800/20',
        footerHoverBg: 'group-hover:bg-zen-100/80 dark:group-hover:bg-zen-900/25',
      },
      {
        key: 'notes',
        title: 'Notes',
        description: 'Keep grounding reflections and gentle reminders close at hand.',
        href: '/notes',
        icon: StickyNote,
        primary: notesLoading ? 'Syncing…' : `${totalNotes} saved notes`,
        secondary: '',
        accentGradient: 'bg-gradient-to-br from-warm-400 to-warm-500',
        accentText: 'text-white',
        badgeBg: 'bg-warm-100/80 dark:bg-zen-800/30',
        badgeText: 'text-warm-600 dark:text-zen-900',
        footerBg: 'bg-warm-50/80 dark:bg-zen-800/20',
        footerHoverBg: 'group-hover:bg-warm-100/80 dark:group-hover:bg-zen-900/25',
      },
      {
        key: 'friends',
        title: 'Friends',
        description: 'Share progress with trusted companions and uplift one another.',
        href: '/friends',
        icon: Users,
        primary: friendsLoading ? 'Syncing…' : `${totalFriends} connected friends`,
        secondary: '',
        accentGradient: 'bg-gradient-to-br from-zen-500 to-sage-500',
        accentText: 'text-white',
        badgeBg: 'bg-zen-100/80 dark:bg-zen-800/30',
        badgeText: 'text-zen-600 dark:text-zen-900',
        footerBg: 'bg-zen-50/80 dark:bg-zen-800/20',
        footerHoverBg: 'group-hover:bg-zen-100/80 dark:group-hover:bg-zen-900/25',
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
    <div
      className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50 dark:from-[rgb(var(--color-zen-50)_/_0.95)] dark:via-[rgb(var(--color-zen-100)_/_0.85)] dark:to-[rgb(var(--color-sage-100)_/_0.9)]"
    >
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex flex-col gap-6 border-b border-zen-200/60 bg-surface/70 px-6 py-6 backdrop-blur-lg sm:flex-row sm:items-center sm:justify-between lg:px-12 dark:border-zen-700/40">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zen-500">Zen Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-zen-900 sm:text-4xl">Stay present with the essentials</h1>
            <p className="mt-2 max-w-2xl text-sm text-zen-600 dark:text-zen-200">
              A calmer home screen that keeps tasks, lists, notes, and friends within easy reach so you can stay in flow.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {userEmail ? <span className="hidden text-sm text-zen-500 dark:text-zen-200 sm:inline">{userEmail}</span> : null}
            <SettingsMenu userEmail={userEmail} onSignOut={signOut} />
          </div>
        </header>

        <main className="flex-1 px-6 pb-16 pt-10 lg:px-12">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
            <section className="space-y-6">
              <h2 className="text-xl font-semibold text-zen-900">Your mindful toolkit</h2>
              <p className="max-w-3xl text-sm text-zen-600 dark:text-zen-200">
                Each space is tuned for gentle productivity. Choose a card to dive in, or explore everything at your own pace.
              </p>
              <div className="grid gap-6 sm:grid-cols-2">
                {featureCards.map(card => (
                  <FeatureCard key={card.key} card={card} />
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-zen-200/60 bg-surface/70 p-8 text-sm text-zen-600 shadow-soft backdrop-blur-xl dark:border-zen-700/40 dark:text-zen-200">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-zen-900">Need a fresh start?</h3>
                  <p className="mt-1 max-w-xl text-sm text-zen-600 dark:text-zen-200">
                    Jump into any workspace to begin curating tasks, reflecting through notes, or connecting with friends.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {featureCards.map(card => (
                    <Link
                      key={card.key}
                      href={card.href}
                      className="inline-flex items-center justify-center rounded-xl border border-zen-200/80 bg-surface/80 px-4 py-2 text-sm font-medium text-zen-700 transition hover:border-sage-400 hover:text-sage-600 dark:border-zen-700/50 dark:text-zen-200"
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
    <Link
      href={card.href}
      className="group block h-full rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--color-surface))]"
      aria-label={`Go to ${card.title}`}
    >
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex h-full flex-col overflow-hidden rounded-3xl border border-zen-200/60 bg-surface/70 shadow-soft backdrop-blur-xl transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lift dark:border-zen-700/40"
      >
        <div className="flex flex-1 flex-col justify-between gap-6 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.accentGradient} ${card.accentText} shadow-medium transition group-hover:scale-[1.02]`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${card.badgeBg} ${card.badgeText}`}>
                  {card.title}
                </div>
                <p className="mt-3 text-sm text-zen-600 dark:text-zen-200">{card.description}</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-zen-300 transition-transform group-hover:translate-x-1 dark:text-zen-400" />
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="text-lg font-semibold text-zen-900">{card.primary}</div>
            {card.secondary ? <div className="text-xs text-zen-500 dark:text-zen-300">{card.secondary}</div> : null}
          </dl>
        </div>
        <div className={`border-t border-zen-200/50 px-6 py-4 text-sm text-zen-600 transition-colors dark:border-zen-700/40 dark:text-zen-200 ${card.footerBg} ${card.footerHoverBg}`}>
          Tap to explore {card.title}
        </div>
      </motion.article>
    </Link>
  );
}
