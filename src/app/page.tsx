'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  CalendarClock,
  Check,
  FileText,
  LayoutGrid,
  List as ListIcon,
  PencilLine,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import AuthPanel from '@/components/AuthPanel';
import ParallaxBackground from '@/components/ParallaxBackground';
import SettingsMenu from '@/components/SettingsMenu';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useLists } from '@/features/lists/useLists';
import { useFriends } from '@/features/friends/useFriends';
import { useNotes } from '@/features/notes/useNotes';
import { useAuthSession } from '@/lib/hooks/useAuthSession';

type QuickAccessKey = 'tasks' | 'lists' | 'notes' | 'friends' | 'insights';

interface QuickAccessConfig {
  key: QuickAccessKey;
  customTitle?: string;
}

interface QuickAccessTileDefinition {
  key: QuickAccessKey;
  defaultTitle: string;
  description: string;
  href: string;
  icon: LucideIcon;
  primaryStat: string | number;
  primaryLabel: string;
  secondaryLabel: string;
}

interface QuickAccessTile extends QuickAccessTileDefinition {
  title: string;
}

const QUICK_ACCESS_KEYS: QuickAccessKey[] = ['tasks', 'lists', 'notes', 'friends', 'insights'];

function getDefaultQuickAccessConfig(): QuickAccessConfig[] {
  return QUICK_ACCESS_KEYS.map(key => ({ key }));
}

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
  const [isQuickAccessEditing, setIsQuickAccessEditing] = useState(false);
  const [quickAccessConfig, setQuickAccessConfig] = useState<QuickAccessConfig[]>(() => getDefaultQuickAccessConfig());
  const [quickAccessHydrated, setQuickAccessHydrated] = useState(false);
  const { user, authChecked, signOut } = useAuthSession();
  const searchParams = useSearchParams();
  const demoMode = searchParams?.get('demo') === '1';
  const targetUserId = demoMode ? null : user?.id ?? null;
  const { tasks, status: checklistStatus, syncing: checklistSyncing } = useChecklist(targetUserId);
  const {
    lists,
    status: listsStatus,
    syncing: listsSyncing,
  } = useLists(targetUserId);
  const { friends, status: friendsStatus, syncing: friendsSyncing } = useFriends(targetUserId);
  const {
    notes,
    status: notesStatus,
    syncing: notesSyncing,
  } = useNotes(targetUserId);

  const userEmail = useMemo(() => {
    if (demoMode) {
      return 'Demo session';
    }
    return user?.email ?? user?.user_metadata?.email ?? null;
  }, [demoMode, user]);

  const isTasksLoading = checklistStatus === 'loading' || checklistSyncing;
  const isListsLoading = listsStatus === 'loading' || listsSyncing;
  const isFriendsLoading = friendsStatus === 'loading' || friendsSyncing;
  const isNotesLoading = notesStatus === 'loading' || notesSyncing;

  const activeTasksCount = useMemo(() => {
    if (demoMode) {
      return 4;
    }
    return tasks.filter(task => !task.completed).length;
  }, [demoMode, tasks]);

  const completedTasksCount = useMemo(() => {
    if (demoMode) {
      return 18;
    }
    return tasks.filter(task => task.completed).length;
  }, [demoMode, tasks]);

  const nextDueLabel = useMemo(() => {
    if (demoMode) {
      return 'Next due tomorrow at 9:00 AM';
    }

    const nextDueTask = tasks
      .filter(task => !task.completed && task.due_date)
      .sort((a, b) => {
        const dateA = new Date(a.due_date as string).getTime();
        const dateB = new Date(b.due_date as string).getTime();
        return dateA - dateB;
      })[0];

    if (!nextDueTask) {
      return 'No upcoming tasks';
    }

    return `Next due ${new Date(nextDueTask.due_date as string).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }, [demoMode, tasks]);

  const listCount = demoMode ? 6 : lists.length;
  const notesCount = demoMode ? 12 : notes.length;
  const friendsCount = demoMode ? 3 : friends.length;

  const quickAccessStorageKey = useMemo(
    () => `zen.quickAccess.${demoMode ? 'demo' : user?.id ?? 'anon'}`,
    [demoMode, user?.id],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedConfig = window.localStorage.getItem(quickAccessStorageKey);

    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig) as QuickAccessConfig[];
        const sanitized = parsed.filter(config => QUICK_ACCESS_KEYS.includes(config.key));
        const missingKeys = QUICK_ACCESS_KEYS.filter(
          key => !sanitized.some(config => config.key === key),
        ).map(key => ({ key }));

        setQuickAccessConfig([...sanitized, ...missingKeys]);
      } catch (parseError) {
        console.error('Failed to load quick access preferences', parseError);
        setQuickAccessConfig(getDefaultQuickAccessConfig());
      }
    } else {
      setQuickAccessConfig(getDefaultQuickAccessConfig());
    }

    setQuickAccessHydrated(true);
    setIsQuickAccessEditing(false);
  }, [quickAccessStorageKey]);

  useEffect(() => {
    if (!quickAccessHydrated || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(quickAccessStorageKey, JSON.stringify(quickAccessConfig));
  }, [quickAccessConfig, quickAccessHydrated, quickAccessStorageKey]);

  const quickAccessDefinitions = useMemo<Record<QuickAccessKey, QuickAccessTileDefinition>>(
    () => ({
      tasks: {
        key: 'tasks',
        defaultTitle: 'Zen Tasks',
        description: 'Capture, prioritize, and complete your tasks with a mindful flow.',
        href: '/tasks',
        icon: LayoutGrid,
        primaryStat: isTasksLoading ? '—' : activeTasksCount,
        primaryLabel: 'Active tasks',
        secondaryLabel: isTasksLoading ? 'Syncing tasks…' : nextDueLabel,
      },
      lists: {
        key: 'lists',
        defaultTitle: 'Zen Lists',
        description: 'Curate collections to group ideas, routines, and shared plans.',
        href: '/lists',
        icon: ListIcon,
        primaryStat: isListsLoading ? '—' : listCount,
        primaryLabel: 'Lists saved',
        secondaryLabel: isListsLoading
          ? 'Syncing lists…'
          : listCount > 0
            ? 'Tap to explore your collections'
            : 'Start your first list',
      },
      notes: {
        key: 'notes',
        defaultTitle: 'Zen Notes',
        description: 'Write rich documents, journal entries, and meeting notes with ease.',
        href: '/notes',
        icon: FileText,
        primaryStat: isNotesLoading ? '—' : notesCount,
        primaryLabel: 'Documents saved',
        secondaryLabel: isNotesLoading
          ? 'Syncing notes…'
          : notesCount > 0
            ? 'Return to your most recent document'
            : 'Start your first document',
      },
      friends: {
        key: 'friends',
        defaultTitle: 'Zen Friends',
        description: 'Add people you trust and collaborate in real time.',
        href: '/friends',
        icon: Users,
        primaryStat: isFriendsLoading ? '—' : friendsCount,
        primaryLabel: 'Friends connected',
        secondaryLabel: isFriendsLoading
          ? 'Syncing friends…'
          : friendsCount > 0
            ? 'See what your friends are up to'
            : 'Invite someone new today',
      },
      insights: {
        key: 'insights',
        defaultTitle: 'Zen Insights',
        description: 'Open your customizable widget board and track mindful progress.',
        href: '/zen-insights',
        icon: BarChart3,
        primaryStat: '—',
        primaryLabel: 'Widgets configured',
        secondaryLabel: 'Fine-tune insights and layout',
      },
    }),
    [
      activeTasksCount,
      friendsCount,
      isFriendsLoading,
      isListsLoading,
      isNotesLoading,
      isTasksLoading,
      listCount,
      nextDueLabel,
      notesCount,
    ],
  );

  const configByKey = useMemo(() => {
    const map = new Map<QuickAccessKey, QuickAccessConfig>();
    quickAccessConfig.forEach(config => {
      map.set(config.key, config);
    });
    return map;
  }, [quickAccessConfig]);

  const quickAccessTiles = useMemo<QuickAccessTile[]>(() => {
    const seen = new Set<QuickAccessKey>();
    const tiles: QuickAccessTile[] = [];

    quickAccessConfig.forEach(config => {
      const base = quickAccessDefinitions[config.key];
      if (!base) return;
      const title = config.customTitle?.trim() ? config.customTitle.trim() : base.defaultTitle;
      tiles.push({ ...base, title });
      seen.add(config.key);
    });

    QUICK_ACCESS_KEYS.forEach(key => {
      if (seen.has(key)) {
        return;
      }
      const base = quickAccessDefinitions[key];
      if (!base) {
        return;
      }
      tiles.push({ ...base, title: base.defaultTitle });
    });

    return tiles;
  }, [quickAccessConfig, quickAccessDefinitions]);

  const handleMoveTile = useCallback((key: QuickAccessKey, direction: 'up' | 'down') => {
    setQuickAccessConfig(current => {
      const index = current.findIndex(config => config.key === key);
      if (index === -1) {
        return current;
      }

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }, []);

  const handleTitleChange = useCallback((key: QuickAccessKey, title: string) => {
    setQuickAccessConfig(current =>
      current.map(config => (config.key === key ? { ...config, customTitle: title } : config)),
    );
  }, []);

  const handleResetQuickAccess = useCallback(() => {
    setQuickAccessConfig(getDefaultQuickAccessConfig());
    setIsQuickAccessEditing(false);
  }, []);

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
            <div className="space-y-4 rounded-3xl border border-sage-100 bg-gradient-to-br from-white/90 via-sage-50/80 to-warm-50/70 p-6 shadow-large backdrop-blur-md dark:border-slate-800 dark:from-slate-950/80 dark:via-slate-900/80 dark:to-slate-950/80">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sage-700 shadow-small dark:bg-slate-900/70 dark:text-slate-100">
                <Sparkles className="h-4 w-4" />
                Welcome back
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold text-zen-900 dark:text-white">
                  {demoMode ? 'Demo User' : userName ? `Hi, ${userName}` : 'Welcome to your Zen workspace'}
                </h1>
                <p className="text-sm text-zen-600 dark:text-slate-300">
                  Jump into your favorite tools or open Zen Insights to fine-tune widgets and layout.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-2xl border border-sage-100 bg-white/80 px-4 py-3 shadow-soft backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sage-400 to-sage-500 text-white">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-zen-500 dark:text-slate-400">Completed</p>
                  <p className="text-lg font-semibold text-zen-900 dark:text-white">{isTasksLoading ? '—' : completedTasksCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-sage-100 bg-white/80 px-4 py-3 shadow-soft backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-zen-300 to-zen-400 text-zen-900">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-zen-500 dark:text-slate-400">Focus</p>
                  <p className="text-lg font-semibold text-zen-900 dark:text-white">{isTasksLoading ? 'Syncing…' : nextDueLabel}</p>
                </div>
              </div>
            </div>

            {demoMode ? (
              <div className="rounded-3xl border border-dashed border-sage-300 bg-white/70 p-4 text-sm text-sage-700 shadow-small backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                Demo mode: changes are stored locally in this browser.
              </div>
            ) : null}

            <div className="space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium uppercase tracking-wide text-sage-600 dark:text-slate-300">Quick access</p>
                  <h2 className="text-2xl font-semibold text-zen-900 dark:text-white">Dive into your workspace apps</h2>
                  <p className="text-sm text-zen-500 dark:text-slate-400">
                    Jump straight to tasks, lists, notes, or friends without losing your personalized dashboard.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isQuickAccessEditing ? (
                    <button
                      type="button"
                      onClick={handleResetQuickAccess}
                      className="inline-flex items-center gap-2 rounded-full border border-sage-200 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-sage-600 shadow-small transition hover:border-sage-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-sage-400 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800/70 dark:focus:ring-slate-500 dark:focus:ring-offset-slate-900"
                    >
                      <RotateCcw className="h-4 w-4" /> Reset
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsQuickAccessEditing(current => !current)}
                    className="inline-flex items-center gap-2 rounded-full border border-sage-500 bg-sage-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-small transition hover:bg-sage-600 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:focus:ring-slate-400 dark:focus:ring-offset-slate-900"
                  >
                    {isQuickAccessEditing ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
                    {isQuickAccessEditing ? 'Done editing' : 'Edit quick access'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {quickAccessTiles.map((tile, index) => {
                  const Icon = tile.icon;
                  const config = configByKey.get(tile.key);
                  const customTitle = config?.customTitle ?? '';
                  return (
                    <motion.div
                      key={tile.key}
                      whileHover={{ y: -4, scale: 1.01 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    >
                      {isQuickAccessEditing ? (
                        <div className="group relative h-full overflow-hidden rounded-3xl border border-dashed border-sage-300 bg-white/70 shadow-medium backdrop-blur-sm transition-colors dark:border-slate-700 dark:bg-slate-900/60">
                          <div className="absolute right-4 top-4 flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => handleMoveTile(tile.key, 'up')}
                              disabled={index === 0}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sage-200 bg-white/80 text-sage-600 transition hover:border-sage-300 hover:text-sage-700 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-slate-100 dark:focus:ring-slate-500 dark:focus:ring-offset-slate-900"
                              aria-label={`Move ${tile.title} up`}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveTile(tile.key, 'down')}
                              disabled={index === quickAccessTiles.length - 1}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sage-200 bg-white/80 text-sage-600 transition hover:border-sage-300 hover:text-sage-700 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-slate-100 dark:focus:ring-slate-500 dark:focus:ring-offset-slate-900"
                              aria-label={`Move ${tile.title} down`}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="flex h-full flex-col justify-between">
                            <div className="space-y-4 p-6">
                              <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 text-white shadow-medium">
                                  <Icon className="h-6 w-6" />
                                </div>
                                <div className="flex-1">
                                  <label className="text-xs font-medium uppercase tracking-wide text-sage-600 dark:text-slate-300" htmlFor={`${tile.key}-quick-access-title`}>
                                    Tile name
                                  </label>
                                  <input
                                    id={`${tile.key}-quick-access-title`}
                                    value={customTitle}
                                    onChange={event => handleTitleChange(tile.key, event.target.value)}
                                    placeholder={quickAccessDefinitions[tile.key].defaultTitle}
                                    className="mt-1 w-full rounded-xl border border-sage-200 bg-white/80 px-3 py-2 text-sm text-zen-900 shadow-small transition focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-white dark:focus:border-slate-500 dark:focus:ring-slate-600"
                                  />
                                  <p className="mt-2 text-sm text-zen-600 dark:text-slate-300">{tile.description}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-zen-500 dark:text-slate-400">{tile.primaryLabel}</p>
                                  <p className="text-2xl font-semibold text-zen-900 dark:text-white">{tile.primaryStat}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-zen-500 dark:text-slate-400">What&apos;s next</p>
                                  <p className="text-sm font-medium text-zen-700 dark:text-slate-200">{tile.secondaryLabel}</p>
                                </div>
                              </div>
                            </div>
                            <div className="border-t border-dashed border-sage-200 bg-sage-50/50 px-6 py-4 text-sm text-sage-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                              Drag handles coming soon. Use the arrows to reorder tiles.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={tile.href}
                          className="group block h-full overflow-hidden rounded-3xl border border-sage-100 bg-white/80 shadow-medium backdrop-blur-sm transition-colors hover:border-sage-300 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-600"
                        >
                          <div className="flex h-full flex-col justify-between">
                            <div className="space-y-4 p-6">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 text-white shadow-medium">
                                    <Icon className="h-6 w-6" />
                                  </div>
                                  <div>
                                    <h3 className="text-xl font-semibold text-zen-900 dark:text-white">{tile.title}</h3>
                                    <p className="text-sm text-zen-600 dark:text-slate-300">{tile.description}</p>
                                  </div>
                                </div>
                                <ArrowRight className="h-5 w-5 text-zen-400 transition-transform group-hover:translate-x-1" />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm text-zen-500 dark:text-slate-400">{tile.primaryLabel}</p>
                                  <p className="text-2xl font-semibold text-zen-900 dark:text-white">{tile.primaryStat}</p>
                                </div>
                                <div>
                                  <p className="text-sm text-zen-500 dark:text-slate-400">What&apos;s next</p>
                                  <p className="text-sm font-medium text-zen-700 dark:text-slate-200">{tile.secondaryLabel}</p>
                                </div>
                              </div>
                            </div>
                            <div className="border-t border-sage-100 bg-sage-50/70 px-6 py-4 text-sm text-sage-600 transition-colors group-hover:bg-sage-100/70 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:group-hover:bg-slate-800/80">
                              Tap to explore {tile.title}
                            </div>
                          </div>
                        </Link>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
