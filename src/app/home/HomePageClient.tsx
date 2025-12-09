'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bell, CalendarDays, CheckSquare, ListTodo, Sparkles, StickyNote, Users } from 'lucide-react';

import AuthPanel from '@/components/AuthPanel';
import SettingsMenu from '@/components/SettingsMenu';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useFriendsOverview } from '@/features/home/hooks/useFriendsOverview';
import { useListsOverview } from '@/features/home/hooks/useListsOverview';
import { useNotesOverview } from '@/features/home/hooks/useNotesOverview';
import { useRemindersOverview } from '@/features/home/hooks/useRemindersOverview';
import { useTasksOverview } from '@/features/home/hooks/useTasksOverview';
import type { FeatureCardProps } from '@/features/home/components/FeatureCard';
import { FeatureCard } from '@/features/home/components/FeatureCard';
import { useNotificationPermission } from '@/lib/hooks/useNotificationPermission';

function LoadingScreen() {
  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-zen-200 border-t-zen-500" />
    </div>
  );
}

export default function HomePageClient() {
  const searchParams = useSearchParams();
  const demoMode = searchParams?.get('demo') === '1';

  const { user, authChecked, signOut } = useAuthSession();
  const targetUserId = demoMode ? null : user?.id ?? null;

  const tasksOverview = useTasksOverview(targetUserId, demoMode);
  const listsOverview = useListsOverview(targetUserId, demoMode);
  const notesOverview = useNotesOverview(targetUserId, demoMode);
  const friendsOverview = useFriendsOverview(targetUserId, demoMode);
  const remindersOverview = useRemindersOverview(targetUserId, demoMode);
  const { permission: notificationPermission, statusMessage: notificationStatus, requestPermission } =
    useNotificationPermission();

  const userEmail = useMemo(() => {
    if (demoMode) {
      return 'Demo session';
    }
    return user?.email ?? user?.user_metadata?.email ?? null;
  }, [demoMode, user]);

  const tasksLoading = tasksOverview.loading;
  const listsLoading = listsOverview.loading;
  const notesLoading = notesOverview.loading;
  const friendsLoading = friendsOverview.loading;
  const remindersLoading = remindersOverview.loading;

  const featureCards = useMemo<FeatureCardProps[]>(
    () => [
      {
        key: 'calendar',
        title: 'Calendar',
        description: 'Visualise tasks, reminders, and notes on a shared timeline.',
        href: '/calendar',
        icon: CalendarDays,
        primary: tasksLoading
          ? 'Syncing…'
          : tasksOverview.nextDueTask
            ? `Next: ${tasksOverview.nextDueTask.title}`
            : 'No upcoming due dates',
        secondary:
          tasksOverview.nextDueTask?.due_date
            ? new Date(tasksOverview.nextDueTask.due_date).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Stay in control at a glance',
        accentGradient: 'bg-gradient-to-br from-zen-500 to-warm-500',
        accentText: 'text-white',
        badgeBg: 'bg-zen-100/80 dark:bg-zen-800/40',
        badgeText: 'text-zen-600 dark:text-zen-900',
        footerBg: 'bg-zen-50/80 dark:bg-zen-800/25',
        footerHoverBg: 'group-hover:bg-zen-100/80 dark:group-hover:bg-zen-900/25',
      },
      {
        key: 'reminders',
        title: 'Zen Reminders',
        description: 'Schedule gentle nudges to pause, breathe, and reset throughout your day.',
        href: '/reminders',
        icon: Bell,
        primary: remindersLoading
          ? 'Syncing…'
          : remindersOverview.upcomingReminder
            ? `Next: ${remindersOverview.upcomingReminder.title}`
            : 'No reminders scheduled',
        secondary: remindersLoading
          ? ''
          : remindersOverview.upcomingReminder?.remind_at
            ? new Date(remindersOverview.upcomingReminder.remind_at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : `${remindersOverview.totalReminders} saved reminders`,
        accentGradient: 'bg-gradient-to-br from-sage-500 to-zen-500',
        accentText: 'text-white',
        badgeBg: 'bg-sage-100/80 dark:bg-zen-800/40',
        badgeText: 'text-sage-700 dark:text-zen-900',
        footerBg: 'bg-sage-50/80 dark:bg-zen-800/25',
        footerHoverBg: 'group-hover:bg-sage-100/80 dark:group-hover:bg-zen-900/25',
      },
      {
        key: 'tasks',
        title: 'Tasks',
        description: 'Orchestrate priorities with calm confidence and crystal-clear visibility.',
        href: '/tasks',
        icon: CheckSquare,
        primary: tasksLoading ? 'Syncing…' : `${tasksOverview.openTasks} active tasks`,
        secondary: tasksLoading ? '' : `${tasksOverview.completedTasks} completed`,
        accentGradient: 'bg-gradient-to-br from-zen-500 to-zen-600',
        accentText: 'text-white',
        badgeBg: 'bg-zen-100/80 dark:bg-zen-800/40',
        badgeText: 'text-zen-600 dark:text-zen-900',
        footerBg: 'bg-zen-50/80 dark:bg-zen-800/25',
        footerHoverBg: 'group-hover:bg-zen-100/80 dark:group-hover:bg-zen-900/25',
      },
      {
        key: 'lists',
        title: 'Lists',
        description: 'Design polished rituals, runbooks, and checklists that evolve with your goals.',
        href: '/lists',
        icon: ListTodo,
        primary: listsLoading ? 'Syncing…' : `${listsOverview.totalLists} curated lists`,
        secondary: '',
        accentGradient: 'bg-gradient-to-br from-sage-400 to-sage-500',
        accentText: 'text-zen-900',
        badgeBg: 'bg-sage-100/80 dark:bg-zen-800/40',
        badgeText: 'text-sage-700 dark:text-zen-900',
        footerBg: 'bg-sage-50/80 dark:bg-zen-800/25',
        footerHoverBg: 'group-hover:bg-sage-100/80 dark:group-hover:bg-zen-900/25',
      },
      {
        key: 'notes',
        title: 'Notes',
        description: 'Capture layered insights, decisions, and reflections in a soothing editor.',
        href: '/notes',
        icon: StickyNote,
        primary: notesLoading ? 'Syncing…' : `${notesOverview.totalNotes} saved notes`,
        secondary: '',
        accentGradient: 'bg-gradient-to-br from-warm-400 to-warm-500',
        accentText: 'text-white',
        badgeBg: 'bg-warm-100/80 dark:bg-zen-800/40',
        badgeText: 'text-warm-600 dark:text-zen-900',
        footerBg: 'bg-warm-50/80 dark:bg-zen-800/25',
        footerHoverBg: 'group-hover:bg-warm-100/80 dark:group-hover:bg-zen-900/25',
      },
      {
        key: 'friends',
        title: 'Friends',
        description: 'Nurture accountability and momentum with the people who keep you grounded.',
        href: '/friends',
        icon: Users,
        primary: friendsLoading ? 'Syncing…' : `${friendsOverview.totalFriends} connected friends`,
        secondary: '',
        accentGradient: 'bg-gradient-to-br from-zen-500 to-sage-500',
        accentText: 'text-white',
        badgeBg: 'bg-zen-100/80 dark:bg-zen-800/40',
        badgeText: 'text-zen-600 dark:text-zen-900',
        footerBg: 'bg-zen-50/80 dark:bg-zen-800/25',
        footerHoverBg: 'group-hover:bg-zen-100/80 dark:group-hover:bg-zen-900/25',
      },
    ],
    [
      friendsLoading,
      friendsOverview.totalFriends,
      listsLoading,
      listsOverview.totalLists,
      notesLoading,
      notesOverview.totalNotes,
      remindersLoading,
      remindersOverview.totalReminders,
      remindersOverview.upcomingReminder,
      tasksLoading,
      tasksOverview.completedTasks,
      tasksOverview.nextDueTask,
      tasksOverview.openTasks,
    ],
  );

  if (!authChecked && !demoMode) {
    return <LoadingScreen />;
  }

  if (!user && !demoMode) {
    return <SignedOutLanding />;
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="flex flex-col gap-6 border-b border-zen-200/60 bg-surface/70 px-6 py-6 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between lg:px-12 dark:border-zen-700/40">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zen-500">Zen Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold text-zen-900 sm:text-4xl">Find clarity in your day</h1>
          <p className="mt-2 max-w-2xl text-sm text-zen-600 dark:text-zen-200">
            A composed control center for mindful teams and focused individuals. Glide between priorities, reflections, and
            relationships without the noise.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {userEmail ? <span className="hidden text-sm text-zen-500 dark:text-zen-200 sm:inline">{userEmail}</span> : null}
          <SettingsMenu
            userEmail={userEmail}
            onSignOut={signOut}
            notificationPermission={notificationPermission}
            onRequestNotificationPermission={() => {
              void requestPermission();
            }}
          />
        </div>
      </header>

      {notificationStatus ? (
        <div className="mx-6 mt-4 rounded-2xl border border-zen-200/70 bg-warm-50/80 px-4 py-3 text-sm text-zen-700 shadow-soft lg:mx-12 dark:border-zen-700/40 dark:bg-zen-900/60 dark:text-zen-100">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-zen-100 px-2 py-1 text-xs font-semibold text-zen-600 dark:bg-zen-800/80 dark:text-zen-100">
              Notifications
            </div>
            <div className="space-y-2">
              <p>{notificationStatus}</p>
              <p className="text-xs text-zen-500 dark:text-zen-300">
                If notifications stay blocked, open your browser&apos;s site settings (usually behind the lock icon) and allow alerts for Zen
                Workspace.
              </p>
              {notificationPermission === 'default' || notificationPermission === 'denied' ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void requestPermission();
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-zen-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-zen-700 transition hover:border-zen-400 hover:text-zen-900 dark:border-zen-700/60 dark:bg-zen-900/80 dark:text-zen-100"
                  >
                    Retry permission
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <main className="flex-1 px-6 pb-16 pt-10 lg:px-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
          <section className="space-y-6">
            <h2 className="text-xl font-semibold text-zen-900">Your Zen toolkit</h2>
            <p className="max-w-3xl text-sm text-zen-600 dark:text-zen-200">
              Every workspace pairs poised visuals with purposeful structure. Select a card to dive straight in, or move at a
              measured pace—either way, your focus stays unruffled.
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
                <h3 className="text-lg font-semibold text-zen-900">Ready for a composed reset?</h3>
                <p className="mt-1 max-w-xl text-sm text-zen-600 dark:text-zen-200">
                  Step into any workspace to rebalance priorities, capture nuanced thinking, or spark momentum with your
                  inner circle.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {featureCards.map(card => (
                  <Link
                    key={card.key}
                    href={card.href}
                    className="inline-flex items-center justify-center rounded-xl border border-zen-200/80 bg-surface/80 px-4 py-2 text-sm font-medium text-zen-700 transition hover:border-zen-400 hover:text-zen-600 dark:border-zen-700/50 dark:text-zen-200"
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
  );
}

function SignedOutLanding() {
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="px-6 py-6 lg:px-12">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-zen-500 to-sage-500 text-white shadow-medium">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zen-500">Zen Workspace</p>
              <p className="text-sm text-zen-600 dark:text-zen-200">Composed productivity for mindful teams</p>
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-12 px-6 pb-16 pt-4 sm:px-8 lg:flex-row lg:px-12">
        <div className="max-w-xl space-y-6 text-center lg:text-left">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold text-zen-900 sm:text-4xl">Sign in to continue</h1>
            <p className="text-sm text-zen-600 dark:text-zen-200">
              Access serene task boards, curated rituals, and shared notes—everything you need to keep momentum with ease.
            </p>
          </div>

          <ul className="grid gap-3 text-left text-sm text-zen-600 dark:text-zen-200">
            <li className="flex items-center gap-3 rounded-2xl border border-zen-200/60 bg-surface/70 px-4 py-3 shadow-soft backdrop-blur-sm dark:border-zen-700/40">
              <CheckSquare className="h-4 w-4 text-zen-500" />
              <span>Track mindful tasks and celebrate progress with calming visuals.</span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl border border-zen-200/60 bg-surface/70 px-4 py-3 shadow-soft backdrop-blur-sm dark:border-zen-700/40">
              <ListTodo className="h-4 w-4 text-sage-500" />
              <span>Design living checklists that adapt to your rituals and workflows.</span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl border border-zen-200/60 bg-surface/70 px-4 py-3 shadow-soft backdrop-blur-sm dark:border-zen-700/40">
              <StickyNote className="h-4 w-4 text-warm-500" />
              <span>Capture nuanced notes and reflections alongside your priorities.</span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl border border-zen-200/60 bg-surface/70 px-4 py-3 shadow-soft backdrop-blur-sm dark:border-zen-700/40">
              <Bell className="h-4 w-4 text-sage-500" />
              <span>Set Zen reminders to breathe, stretch, or recenter when it matters most.</span>
            </li>
            <li className="flex items-center gap-3 rounded-2xl border border-zen-200/60 bg-surface/70 px-4 py-3 shadow-soft backdrop-blur-sm dark:border-zen-700/40">
              <Users className="h-4 w-4 text-zen-500" />
              <span>Invite trusted collaborators to stay in sync and accountable.</span>
            </li>
          </ul>

          <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-start">
            <Link
              href="/?demo=1"
              className="inline-flex items-center justify-center rounded-full border border-zen-300 bg-surface/80 px-4 py-2 text-sm font-semibold text-zen-600 shadow-small transition hover:border-zen-400 hover:text-zen-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--color-surface))]"
            >
              Preview a guided demo
            </Link>
            <span className="text-xs text-zen-500 dark:text-zen-300">No account yet? Explore the interface first.</span>
          </div>
        </div>

        <AuthPanel />
      </main>
    </div>
  );
}

export function HomePageFallback() {
  return <LoadingScreen />;
}
