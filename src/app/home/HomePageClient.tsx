'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckSquare,
  Leaf,
  ListTodo,
  Sparkles,
  StickyNote,
  Users,
} from 'lucide-react';

import AuthPanel from '@/components/AuthPanel';
import SettingsMenu from '@/components/SettingsMenu';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useFriendsOverview } from '@/features/home/hooks/useFriendsOverview';
import { useListsOverview } from '@/features/home/hooks/useListsOverview';
import { useNotesOverview } from '@/features/home/hooks/useNotesOverview';
import { useRemindersOverview } from '@/features/home/hooks/useRemindersOverview';
import { useTasksOverview } from '@/features/home/hooks/useTasksOverview';
import { FeatureCard, type FeatureCardProps } from '@/features/home/components/FeatureCard';
import { useNotificationPermission } from '@/lib/hooks/useNotificationPermission';

function LoadingScreen() {
  return (
    <div
      role="status"
      aria-label="Loading your workspace"
      className="flex min-h-screen items-center justify-center"
    >
      <div className="h-8 w-8 rounded-full border-2 border-zen-200 border-t-sage-600 motion-safe:animate-spin" />
    </div>
  );
}

export default function HomePageClient() {
  const searchParams = useSearchParams();
  const demoMode = searchParams?.get('demo') === '1';
  const { user, authChecked, signOut } = useAuthSession();
  const targetUserId = demoMode ? null : (user?.id ?? null);
  const tasksOverview = useTasksOverview(targetUserId, demoMode);
  const listsOverview = useListsOverview(targetUserId, demoMode);
  const notesOverview = useNotesOverview(targetUserId, demoMode);
  const friendsOverview = useFriendsOverview(targetUserId, demoMode);
  const remindersOverview = useRemindersOverview(targetUserId, demoMode);
  const {
    permission: notificationPermission,
    statusMessage: notificationStatus,
    requestPermission,
  } = useNotificationPermission();
  const userEmail = demoMode ? 'Demo session' : (user?.email ?? user?.user_metadata?.email ?? null);
  const initials = demoMode ? 'ZW' : (userEmail?.slice(0, 2).toUpperCase() ?? 'ZW');
  const withDemo = (path: string) => (demoMode ? `${path}?demo=1` : path);

  const featureCards = useMemo<FeatureCardProps[]>(
    () => [
      {
        key: 'tasks',
        title: 'Tasks',
        description: 'Make room for what matters. One task at a time.',
        href: '/tasks',
        icon: CheckSquare,
        tone: 'blue',
        loading: tasksOverview.loading,
        primary: `${tasksOverview.openTasks} active task${tasksOverview.openTasks === 1 ? '' : 's'}`,
        secondary: `${tasksOverview.completedTasks} completed${tasksOverview.overdueTasks > 0 ? ` · ${tasksOverview.overdueTasks} overdue` : ''}`,
        footerText: tasksOverview.openTasks === 0 ? 'Add your first task' : 'View tasks',
      },
      {
        key: 'calendar',
        title: 'Calendar',
        description: 'See your tasks and reminders together in one place.',
        href: '/calendar',
        icon: CalendarDays,
        tone: 'lavender',
        loading: tasksOverview.loading,
        primary: tasksOverview.nextDueTask ? tasksOverview.nextDueTask.title : 'A little breathing room',
        secondary: tasksOverview.nextDueTask?.due_date
          ? `Next due ${new Date(tasksOverview.nextDueTask.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : 'No upcoming due dates',
        footerText: 'Open calendar',
      },
      {
        key: 'reminders',
        title: 'Zen Reminders',
        description: 'Gentle nudges to pause, reset, and keep your rhythm.',
        href: '/reminders',
        icon: Bell,
        tone: 'mint',
        loading: remindersOverview.loading,
        primary: `${remindersOverview.totalReminders} saved reminder${remindersOverview.totalReminders === 1 ? '' : 's'}`,
        secondary: remindersOverview.upcomingReminder
          ? `Next: ${remindersOverview.upcomingReminder.title}`
          : 'Your next pause is up to you',
        footerText: remindersOverview.totalReminders === 0 ? 'Set a reminder' : 'View reminders',
      },
      {
        key: 'lists',
        title: 'Lists',
        description: 'A simple home for plans, routines, and everything in between.',
        href: '/lists',
        icon: ListTodo,
        tone: 'mint',
        loading: listsOverview.loading,
        primary: `${listsOverview.totalLists} list${listsOverview.totalLists === 1 ? '' : 's'}`,
        secondary: 'Bring a little order to your everyday',
        footerText: listsOverview.totalLists === 0 ? 'Create a list' : 'Explore lists',
      },
      {
        key: 'notes',
        title: 'Notes',
        description: 'Catch a thought. Clear your mind. Come back when you need it.',
        href: '/notes',
        icon: StickyNote,
        tone: 'lavender',
        loading: notesOverview.loading,
        primary: `${notesOverview.totalNotes} saved note${notesOverview.totalNotes === 1 ? '' : 's'}`,
        secondary: 'A space for ideas and reflections',
        footerText: notesOverview.totalNotes === 0 ? 'Write your first note' : 'Open notes',
      },
      {
        key: 'friends',
        title: 'Friends',
        description: 'Share the journey with the people who keep you grounded.',
        href: '/friends',
        icon: Users,
        tone: 'blue',
        loading: friendsOverview.loading,
        primary: `${friendsOverview.totalFriends} connection${friendsOverview.totalFriends === 1 ? '' : 's'}`,
        secondary: 'A little support goes a long way',
        footerText: friendsOverview.totalFriends === 0 ? 'Invite a friend' : 'Connect with friends',
      },
    ],
    [tasksOverview, listsOverview, notesOverview, friendsOverview, remindersOverview]
  );

  if (!authChecked && !demoMode) return <LoadingScreen />;
  if (!user && !demoMode) return <SignedOutLanding />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-zen-100 bg-surface">
        <div className="mx-auto flex min-h-20 max-w-[1280px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-2.5 text-sm font-medium text-zen-700">
            <Leaf aria-hidden="true" className="h-4 w-4 text-sage-700" />
            <span>Overview</span>
            {demoMode && (
              <span className="ml-1 rounded-md bg-warm-100 px-2 py-1 text-xs text-warm-700">Demo</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-zen-700 md:block" suppressHydrationWarning>
              {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' })}
            </span>
            <span className="mx-1 hidden h-5 w-px bg-zen-100 md:block" aria-hidden="true" />
            <SettingsMenu
              userEmail={userEmail}
              onSignOut={signOut}
              notificationPermission={notificationPermission}
              onRequestNotificationPermission={() => {
                void requestPermission();
              }}
            />
            <span
              title={userEmail ?? 'Your account'}
              aria-label={userEmail ?? 'Your account'}
              className="hidden h-10 w-10 items-center justify-center rounded-full bg-warm-100 text-xs font-semibold text-warm-700 sm:flex"
            >
              {initials}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-5 pb-10 pt-10 sm:px-8 sm:pt-12 lg:px-10">
        <section
          className="mb-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end"
          aria-labelledby="home-heading"
        >
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-sage-700">
              Your space to focus
            </p>
            <h1
              id="home-heading"
              className="font-display text-[28px] font-semibold leading-tight tracking-[-0.045em] text-zen-900 sm:text-[36px]"
            >
              Find clarity in your day<span className="text-sage-600">.</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-zen-700 sm:text-[15px]">
              A calmer place for your plans, thoughts, and everyday progress.
            </p>
          </div>
          <Link
            href={withDemo('/tasks')}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-3 self-start rounded-xl bg-sage-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-sage-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600 focus-visible:ring-offset-4 sm:self-auto"
          >
            View my tasks <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </section>

        {notificationStatus?.startsWith('Unable to') && (
          <div
            role="status"
            className="mb-6 flex items-start gap-3 rounded-xl border border-zen-100 bg-surface p-4 text-sm text-zen-700"
          >
            <Bell aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sage-700" />
            <p>{notificationStatus} You can manage alerts in Settings.</p>
          </div>
        )}

        <section
          aria-label="Your day at a glance"
          className="day-overview mb-10 grid rounded-2xl border border-sage-100 bg-sage-50 sm:grid-cols-3"
        >
          <Link
            href={withDemo('/tasks')}
            className="day-overview-item rounded-t-2xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-600 sm:rounded-l-2xl sm:rounded-tr-none sm:p-6"
          >
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-sage-700">
              <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" /> On your plate
            </p>
            <p className="text-sm font-semibold text-zen-900">
              {tasksOverview.loading
                ? 'Loading tasks…'
                : `${tasksOverview.openTasks} task${tasksOverview.openTasks === 1 ? '' : 's'} to focus on`}
            </p>
            <p className="mt-1.5 text-xs text-zen-700">
              {tasksOverview.loading
                ? 'Getting your latest progress'
                : tasksOverview.overdueTasks > 0
                  ? `${tasksOverview.overdueTasks} overdue · take it one step at a time`
                  : 'At your pace. You’ve got this.'}
            </p>
          </Link>
          <Link
            href={withDemo('/calendar')}
            className="day-overview-item border-t border-sage-100 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-600 sm:border-l sm:border-t-0 sm:p-6"
          >
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-sage-700">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Next on the calendar
            </p>
            <p className="text-sm font-semibold text-zen-900">
              {tasksOverview.loading
                ? 'Checking your calendar…'
                : (tasksOverview.nextDueTask?.title ?? 'Nothing scheduled')}
            </p>
            <p className="mt-1.5 text-xs text-zen-700">
              {!tasksOverview.loading && tasksOverview.nextDueTask?.due_date
                ? new Date(tasksOverview.nextDueTask.due_date).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Space to plan what comes next'}
            </p>
          </Link>
          <Link
            href={withDemo('/reminders')}
            className="day-overview-item rounded-b-2xl border-t border-sage-100 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-600 sm:rounded-r-2xl sm:rounded-bl-none sm:border-l sm:border-t-0 sm:p-6"
          >
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-sage-700">
              <Leaf className="h-3.5 w-3.5" aria-hidden="true" /> A moment to reset
            </p>
            <p className="text-sm font-semibold text-zen-900">
              {remindersOverview.loading
                ? 'Checking reminders…'
                : (remindersOverview.upcomingReminder?.title ?? 'Make time for a pause')}
            </p>
            <p className="mt-1.5 text-xs text-zen-700">
              {!remindersOverview.loading && remindersOverview.upcomingReminder?.remind_at
                ? new Date(remindersOverview.upcomingReminder.remind_at).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Set a gentle reminder for yourself'}
            </p>
          </Link>
        </section>

        <section aria-labelledby="workspace-heading">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="workspace-heading" className="text-lg font-semibold tracking-[-0.025em] text-zen-900">
              Your workspace
            </h2>
            <p className="text-xs text-zen-700">A place for everything on your mind.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((card) => (
              <FeatureCard key={card.key} card={{ ...card, href: withDemo(card.href) }} />
            ))}
          </div>
        </section>

        <Link
          href={withDemo('/zen-insights')}
          className="group mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-warm-100 bg-warm-50 px-6 py-5 transition-colors hover:border-warm-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-600 focus-visible:ring-offset-4 sm:flex-row sm:items-center"
        >
          <div className="flex items-center gap-4">
            <Sparkles aria-hidden="true" className="h-5 w-5 shrink-0 text-warm-700" />
            <div>
              <h2 className="text-sm font-semibold text-zen-900">A wider view of your progress</h2>
              <p className="mt-1 text-xs leading-relaxed text-zen-700">
                Notice your patterns and find a rhythm that works for you.
              </p>
            </div>
          </div>
          <span className="inline-flex min-h-8 shrink-0 items-center gap-3 text-sm font-medium text-warm-700">
            Explore insights <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
          </span>
        </Link>
        <p className="mt-8 text-center text-xs text-zen-700">A little more clarity. A little less noise.</p>
      </main>
    </div>
  );
}

function SignedOutLanding() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="px-6 py-6 lg:px-12">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-zen-500 to-sage-500 text-white shadow-medium">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zen-500">Zen Workspace</p>
              <p className="text-sm text-zen-600 dark:text-zen-200">
                Composed productivity for mindful teams
              </p>
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
            <h1 className="font-display font-semibold text-3xl text-zen-900 sm:text-4xl">
              Sign in to continue
            </h1>
            <p className="text-sm text-zen-600 dark:text-zen-200">
              Access serene task boards, curated rituals, and shared notes—everything you need to keep
              momentum with ease.
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
            <span className="text-xs text-zen-500 dark:text-zen-300">
              No account yet? Explore the interface first.
            </span>
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
