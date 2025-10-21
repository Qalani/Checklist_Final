'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCcw,
} from 'lucide-react';

import ParallaxBackground from '@/components/ParallaxBackground';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ZenPageHeader from '@/components/ZenPageHeader';
import AccountSummary from '@/components/AccountSummary';
import { CalendarTimeline } from '@/components/calendar/CalendarTimeline';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useCalendarData } from '@/features/calendar/useCalendarData';
import type { CalendarEventRecord, CalendarScope, CalendarTaskMetadata } from '@/features/calendar/types';
import { supabase } from '@/lib/supabase';
import { getNextReminderOccurrence } from '@/utils/reminders';

type View = 'month' | 'week' | 'day';

type StatusMessage = { type: 'success' | 'error'; message: string } | null;

function computeRange(view: View, referenceDate: Date): { start: Date; end: Date } {
  if (view === 'month') {
    const start = startOfWeek(startOfMonth(referenceDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(referenceDate), { weekStartsOn: 1 });
    return { start, end };
  }
  if (view === 'week') {
    const start = startOfWeek(referenceDate, { weekStartsOn: 1 });
    const end = endOfWeek(referenceDate, { weekStartsOn: 1 });
    return { start, end };
  }
  const start = startOfDay(referenceDate);
  const end = addDays(start, 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start, end };
}

function shiftDate(view: View, currentDate: Date, direction: 'prev' | 'next'): Date {
  if (view === 'month') {
    return direction === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1);
  }
  if (view === 'week') {
    return direction === 'next' ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1);
  }
  return direction === 'next' ? addDays(currentDate, 1) : subDays(currentDate, 1);
}

function isTaskMetadata(metadata: unknown): metadata is CalendarTaskMetadata {
  return Boolean(
    metadata &&
      typeof metadata === 'object' &&
      'taskId' in (metadata as Record<string, unknown>) &&
      'canEdit' in (metadata as Record<string, unknown>),
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const { user, authChecked, signOut } = useAuthSession();
  const [view, setView] = useState<View>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentRange, setCurrentRange] = useState<{ start: Date; end: Date }>(() => computeRange('month', new Date()));
  const [scope, setScope] = useState<CalendarScope>('all');
  const [status, setStatus] = useState<StatusMessage>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authChecked) {
      return;
    }
    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timer = window.setTimeout(() => {
      setStatus(null);
    }, 4000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [status]);

  const { events, isLoading, isValidating, error, refresh } = useCalendarData(user?.id ?? null, {
    start: currentRange.start,
    end: currentRange.end,
    scope,
    pause: !authChecked,
  });

  const userEmail = useMemo(() => user?.email ?? user?.user_metadata?.email ?? null, [user]);

  const handleRangeChange = useCallback((range: { start: Date; end: Date }) => {
    setCurrentRange(range);
  }, []);

  const handleViewChange = useCallback(
    (nextView: View) => {
      setView(nextView);
      const recalculatedRange = computeRange(nextView, currentDate);
      setCurrentRange(recalculatedRange);
    },
    [currentDate],
  );

  const handleNavigate = useCallback(
    (nextDate: Date) => {
      setCurrentDate(nextDate);
      const recalculatedRange = computeRange(view, nextDate);
      setCurrentRange(recalculatedRange);
    },
    [view],
  );

  const navigateBy = useCallback(
    (direction: 'prev' | 'next') => {
      setCurrentDate((previous) => {
        const updated = shiftDate(view, previous, direction);
        const recalculatedRange = computeRange(view, updated);
        setCurrentRange(recalculatedRange);
        return updated;
      });
    },
    [view],
  );

  const jumpToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setCurrentRange(computeRange(view, today));
  }, [view]);

  const handleEventDrop = useCallback(
    async ({ record, start }: { record: CalendarEventRecord; start: Date }) => {
      if (record.type !== 'task_due') {
        return;
      }

      const metadata = record.metadata;
      if (!isTaskMetadata(metadata)) {
        setStatus({ type: 'error', message: 'Unable to reschedule this task.' });
        return;
      }

      if (!metadata.canEdit) {
        setStatus({ type: 'error', message: 'You do not have permission to reschedule this task.' });
        return;
      }

      const dueIso = new Date(start).toISOString();
      const updates: Record<string, unknown> = { due_date: dueIso };

      if (metadata.reminder) {
        const reminder = metadata.reminder;
        const reminderLike = {
          due_date: dueIso,
          reminder_minutes_before: reminder.minutesBefore ?? null,
          reminder_recurrence: reminder.recurrence ?? null,
          reminder_next_trigger_at: reminder.nextTriggerAt ?? null,
          reminder_snoozed_until: reminder.snoozedUntil ?? null,
          reminder_timezone: reminder.timezone ?? null,
        };
        const nextReminder = getNextReminderOccurrence(reminderLike, { from: new Date() });
        updates.reminder_next_trigger_at = nextReminder ? nextReminder.toISOString() : null;
      } else {
        updates.reminder_next_trigger_at = null;
      }

      setReschedulingId(record.entityId);
      try {
        const { error: updateError } = await supabase
          .from('tasks')
          .update(updates)
          .eq('id', metadata.taskId);

        if (updateError) {
          throw new Error(updateError.message || 'Unable to reschedule this task.');
        }

        setStatus({ type: 'success', message: 'Task due date updated.' });
        await refresh();
      } catch (updateError) {
        const message =
          updateError instanceof Error ? updateError.message : 'Unable to reschedule this task.';
        setStatus({ type: 'error', message });
      } finally {
        setReschedulingId(null);
      }
    },
    [refresh],
  );

  const statusMessage = status ?? (error ? { type: 'error', message: error } : null);
  const busy = isLoading || isValidating || reschedulingId !== null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-sage-50 to-warm-50 dark:from-[rgb(var(--color-zen-50)_/_0.92)] dark:via-[rgb(var(--color-zen-100)_/_0.82)] dark:to-[rgb(var(--color-sage-100)_/_0.85)]">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <ZenPageHeader
          title="Calendar"
          subtitle="Merge tasks, reminders, and notes into a single flow. Drag to rebalance your schedule."
          icon={CalendarIcon}
          backHref="/"
          backLabel="Overview"
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void refresh();
                }}
                className="inline-flex items-center gap-2 rounded-full border border-zen-200 bg-surface/80 px-3 py-1.5 text-xs font-semibold text-zen-600 transition-colors hover:border-zen-400 hover:text-zen-700 dark:border-zen-700/40 dark:text-zen-200"
                disabled={busy}
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${isValidating ? 'animate-spin' : ''}`} />
                Sync
              </button>
              <ThemeSwitcher />
            </div>
          }
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <AccountSummary
              email={userEmail}
              statusText="Calendar workspace"
              syncing={isValidating}
              syncingLabel="Updating"
              onSignOut={signOut}
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-1 rounded-full border border-zen-200/80 bg-surface/70 p-1 shadow-soft dark:border-zen-700/40">
                {(['month', 'week', 'day'] as View[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleViewChange(option)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      view === option
                        ? 'bg-zen-500 text-white shadow-soft'
                        : 'text-zen-600 hover:bg-zen-100 dark:text-zen-200 dark:hover:bg-zen-800/40'
                    }`}
                  >
                    {option === 'month' ? 'Month' : option === 'week' ? 'Week' : 'Day'}
                  </button>
                ))}
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-zen-200/80 bg-surface/70 p-1 shadow-soft dark:border-zen-700/40">
                <button
                  type="button"
                  onClick={() => navigateBy('prev')}
                  className="rounded-full p-2 text-zen-600 transition-colors hover:bg-zen-100 dark:text-zen-200 dark:hover:bg-zen-800/40"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={jumpToToday}
                  className="inline-flex items-center gap-1 rounded-full bg-zen-500 px-3 py-1 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-zen-600"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => navigateBy('next')}
                  className="rounded-full p-2 text-zen-600 transition-colors hover:bg-zen-100 dark:text-zen-200 dark:hover:bg-zen-800/40"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-zen-200/80 bg-surface/70 p-1 shadow-soft dark:border-zen-700/40">
                {(['all', 'personal', 'shared'] as CalendarScope[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setScope(option)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      scope === option
                        ? 'bg-sage-500 text-white shadow-soft'
                        : 'text-zen-600 hover:bg-zen-100 dark:text-zen-200 dark:hover:bg-zen-800/40'
                    }`}
                  >
                    <Filter className="h-3 w-3" />
                    {option === 'all'
                      ? 'All'
                      : option === 'personal'
                      ? 'Personal'
                      : 'Shared'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {statusMessage ? (
            <div
              className={`mb-4 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm shadow-soft ${
                statusMessage.type === 'success'
                  ? 'border-sage-300/70 bg-sage-50 text-sage-700'
                  : 'border-warm-300/70 bg-warm-50 text-warm-700'
              }`}
            >
              {statusMessage.type === 'success' ? '✔️' : '⚠️'} {statusMessage.message}
            </div>
          ) : null}

          <div className="rounded-3xl border border-zen-200/70 bg-surface/85 p-4 shadow-large backdrop-blur-xl dark:border-zen-700/40">
            <CalendarTimeline
              date={currentDate}
              view={view}
              events={events}
              isLoading={isLoading}
              onRangeChange={handleRangeChange}
              onViewChange={handleViewChange}
              onNavigate={handleNavigate}
              onEventDrop={handleEventDrop}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
