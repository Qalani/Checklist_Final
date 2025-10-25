'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addDays,
  addMonths,
  addWeeks,
  format,
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
import { CalendarDayPlanner } from '@/components/calendar/CalendarDayPlanner';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useCalendarData } from '@/features/calendar/useCalendarData';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useLists } from '@/features/lists/useLists';
import { useNotes } from '@/features/notes/useNotes';
import { useZenReminders } from '@/features/reminders/useZenReminders';
import type { CalendarEventRecord, CalendarScope, CalendarTaskMetadata } from '@/features/calendar/types';
import type { Category, Task } from '@/types';
import { supabase } from '@/lib/supabase';
import { getNextReminderOccurrence } from '@/utils/reminders';

type CalendarView = 'month' | 'week' | 'day';

type StatusMessage = { type: 'success' | 'error'; message: string } | null;

function computeRange(view: CalendarView, referenceDate: Date): { start: Date; end: Date } {
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

function shiftDate(view: CalendarView, currentDate: Date, direction: 'prev' | 'next'): Date {
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
  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
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

  useEffect(() => {
    setSelectedDate((previous) => {
      const startTime = currentRange.start.getTime();
      const endTime = currentRange.end.getTime();
      const previousTime = previous.getTime();
      if (previousTime < startTime || previousTime > endTime) {
        return new Date(currentDate.getTime());
      }
      return previous;
    });
  }, [currentDate, currentRange.end, currentRange.start]);

  const { events, isLoading, isValidating, error, refresh } = useCalendarData(user?.id ?? null, {
    start: currentRange.start,
    end: currentRange.end,
    scope,
    pause: !authChecked,
  });

  const { categories, saveTask, createCategory } = useChecklist(user?.id ?? null);
  const { createList } = useLists(user?.id ?? null);
  const { createNote } = useNotes(user?.id ?? null);
  const { createReminder } = useZenReminders(user?.id ?? null);

  const userEmail = useMemo(() => user?.email ?? user?.user_metadata?.email ?? null, [user]);

  const handleRangeChange = useCallback((range: { start: Date; end: Date }) => {
    setCurrentRange(range);
  }, []);

  const handleViewChange = useCallback(
    (nextView: CalendarView) => {
      setView(nextView);
      const recalculatedRange = computeRange(nextView, currentDate);
      setCurrentRange(recalculatedRange);
      setSelectedDate((previous) => {
        const candidate = previous ?? new Date(currentDate.getTime());
        const startTime = recalculatedRange.start.getTime();
        const endTime = recalculatedRange.end.getTime();
        const candidateTime = candidate.getTime();
        if (candidateTime < startTime || candidateTime > endTime) {
          return new Date(currentDate.getTime());
        }
        return candidate;
      });
    },
    [currentDate],
  );

  const handleNavigate = useCallback(
    (nextDate: Date) => {
      const normalized = new Date(nextDate.getTime());
      setCurrentDate(normalized);
      const recalculatedRange = computeRange(view, normalized);
      setCurrentRange(recalculatedRange);
      setSelectedDate(normalized);
    },
    [view],
  );

  const navigateBy = useCallback(
    (direction: 'prev' | 'next') => {
      setCurrentDate((previous) => {
        const updated = shiftDate(view, previous, direction);
        const normalized = new Date(updated.getTime());
        const recalculatedRange = computeRange(view, normalized);
        setCurrentRange(recalculatedRange);
        setSelectedDate(normalized);
        return normalized;
      });
    },
    [view],
  );

  const jumpToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setCurrentRange(computeRange(view, today));
    setSelectedDate(today);
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

  const handleSelectDate = useCallback(
    (nextDate: Date) => {
      const normalized = new Date(nextDate.getTime());
      setSelectedDate(normalized);
      setCurrentDate(normalized);
      setCurrentRange(computeRange(view, normalized));
    },
    [view],
  );

  const handlePlannerTaskCreate = useCallback(
    async (taskInput: Partial<Task>): Promise<{ success: boolean; error?: string }> => {
      const result = await saveTask(taskInput, null);
      if (result && 'error' in result && result.error) {
        const message = result.error;
        setStatus({ type: 'error', message });
        return { success: false, error: message };
      }

      const dueDateSource = taskInput.due_date ? new Date(taskInput.due_date) : selectedDate;
      const dueLabel = Number.isNaN(dueDateSource.getTime())
        ? 'the selected day'
        : format(dueDateSource, 'MMM d, yyyy');
      setStatus({ type: 'success', message: `Task scheduled for ${dueLabel}.` });

      try {
        await refresh();
      } catch (error) {
        console.error('Failed to refresh calendar after creating task', error);
      }

      return { success: true };
    },
    [refresh, saveTask, selectedDate],
  );

  const handlePlannerListCreate = useCallback(
    async (
      input: { name: string; description?: string; createdAt?: string },
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await createList(input);
      if (result && 'error' in result && result.error) {
        const message = result.error;
        setStatus({ type: 'error', message });
        return { success: false, error: message };
      }

      const label = format(selectedDate, 'MMM d, yyyy');
      setStatus({ type: 'success', message: `List created for ${label}.` });

      return { success: true };
    },
    [createList, selectedDate],
  );

  const handlePlannerNoteCreate = useCallback(
    async (
      input: { title?: string; content?: string; timestamp?: string },
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await createNote(input);
      if (result && 'error' in result && result.error) {
        const message = result.error;
        setStatus({ type: 'error', message });
        return { success: false, error: message };
      }

      let noteDate = selectedDate;
      if (result && 'note' in result && result.note) {
        const stamp = result.note.updated_at ?? result.note.created_at;
        if (stamp) {
          const parsed = new Date(stamp);
          if (!Number.isNaN(parsed.getTime())) {
            noteDate = parsed;
          }
        }
      } else if (input.timestamp) {
        const parsed = new Date(input.timestamp);
        if (!Number.isNaN(parsed.getTime())) {
          noteDate = parsed;
        }
      }

      const noteLabel = format(noteDate, 'MMM d, yyyy');
      setStatus({ type: 'success', message: `Note saved for ${noteLabel}.` });

      try {
        await refresh();
      } catch (error) {
        console.error('Failed to refresh calendar after creating note', error);
      }

      return { success: true };
    },
    [createNote, refresh, selectedDate],
  );

  const handlePlannerReminderCreate = useCallback(
    async (
      input: { title: string; description?: string; remindAt: string; timezone?: string | null },
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await createReminder(input);
      if (result && 'error' in result && result.error) {
        const message = result.error;
        setStatus({ type: 'error', message });
        return { success: false, error: message };
      }

      const remindDate = new Date(input.remindAt);
      const label = Number.isNaN(remindDate.getTime())
        ? 'the selected time'
        : format(remindDate, "MMM d, yyyy 'at' HH:mm");
      setStatus({ type: 'success', message: `Zen reminder scheduled for ${label}.` });

      try {
        await refresh();
      } catch (error) {
        console.error('Failed to refresh calendar after creating reminder', error);
      }

      return { success: true };
    },
    [createReminder, refresh],
  );

  const handlePlannerCategoryCreate = useCallback(
    async (
      input: { name: string; color: string },
    ): Promise<{ success: boolean; error?: string; category?: Category }> => {
      try {
        const category = await createCategory(input);
        return { success: true, category };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to create category. Please try again.';
        setStatus({ type: 'error', message });
        return { success: false, error: message };
      }
    },
    [createCategory],
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
                {(['month', 'week', 'day'] as CalendarView[]).map((option) => (
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
              onSelectDate={handleSelectDate}
              selectedDate={selectedDate}
            />
          </div>
          <CalendarDayPlanner
            date={selectedDate}
            categories={categories}
            onCreateTask={handlePlannerTaskCreate}
            onCreateList={handlePlannerListCreate}
            onCreateNote={handlePlannerNoteCreate}
            onCreateCategory={handlePlannerCategoryCreate}
            onCreateReminder={handlePlannerReminderCreate}
          />
        </main>
      </div>
    </div>
  );
}
