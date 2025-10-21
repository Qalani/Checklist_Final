'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { endOfMonth, format, isValid, startOfMonth } from 'date-fns';
import { CalendarClock, CheckSquare, Filter, StickyNote, Users, Bell, RefreshCw, User } from 'lucide-react';
import { Views, type View } from 'react-big-calendar';

import CalendarTimeline, { type CalendarTimelineEvent } from '@/components/calendar/CalendarTimeline';
import ParallaxBackground from '@/components/ParallaxBackground';
import ZenPageHeader from '@/components/ZenPageHeader';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { supabase } from '@/lib/supabase';
import { useChecklist } from '@/features/checklist/useChecklist';
import { useNotes } from '@/features/notes/useNotes';
import type { CalendarAggregationResponse } from '@/types/calendar';
import type { Task } from '@/types';

interface StatusMessage {
  type: 'success' | 'error';
  message: string;
}

function formatDateParam(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function useBrowserTimeZone(): string {
  return useMemo(() => {
    if (typeof Intl !== 'undefined') {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return tz || 'UTC';
    }
    return 'UTC';
  }, []);
}

interface FilterToggleProps {
  active: boolean;
  onToggle: () => void;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
}

function FilterToggle({ active, onToggle, label, description, icon: Icon, accent }: FilterToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`group flex flex-1 min-w-[12rem] items-start gap-3 rounded-3xl border px-4 py-3 text-left transition hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-400 focus-visible:ring-offset-2 ${
        active
          ? 'border-transparent bg-gradient-to-br from-zen-500/90 to-zen-600 text-white shadow-medium'
          : 'border-zen-200/70 bg-surface/70 text-zen-600 hover:border-zen-300/80'
      }`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? 'bg-white/20' : accent}`}>
        <Icon className={`h-5 w-5 ${active ? 'text-white' : 'text-zen-900/90'}`} />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold tracking-tight">{label}</span>
        <span className={`text-xs leading-snug ${active ? 'text-white/90' : 'text-zen-500'}`}>{description}</span>
      </span>
    </button>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const { user, authChecked } = useAuthSession();
  const userId = user?.id ?? null;

  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date }>(() => {
    const today = new Date();
    return {
      start: startOfMonth(today),
      end: endOfMonth(today),
    };
  });
  const [showPersonal, setShowPersonal] = useState(true);
  const [showShared, setShowShared] = useState(true);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  const timeZone = useBrowserTimeZone();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const { tasks, saveTask } = useChecklist(userId);
  const { notes } = useNotes(userId);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setAccessToken(data.session?.access_token ?? null);
      })
      .catch(() => {
        if (!isMounted) return;
        setAccessToken(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setAccessToken(session?.access_token ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setStatusMessage(null);
    }, 4800);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [statusMessage]);

  const rangeStartParam = formatDateParam(visibleRange.start);
  const rangeEndParam = formatDateParam(visibleRange.end);
  const shouldFetchAggregation = Boolean(user && accessToken);

  const {
    data: aggregation,
    error: aggregationError,
    isValidating,
    mutate: mutateAggregation,
  } = useSWR<CalendarAggregationResponse>(
    shouldFetchAggregation
      ? ['calendar-aggregation', rangeStartParam, rangeEndParam, timeZone, accessToken]
      : null,
    async ([, from, to, tz, token]) => {
      const params = new URLSearchParams({ from, to, timezone: tz as string });
      const response = await fetch(`/api/calendar?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token as string}`,
        },
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && typeof (payload as { error?: unknown }).error === 'string'
            ? ((payload as { error: string }).error as string)
            : 'Unable to load calendar data.';
        throw new Error(message);
      }

      return payload as CalendarAggregationResponse;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    },
  );

  const tasksSignature = useMemo(
    () =>
      tasks
        .map((task) => `${task.id}:${task.updated_at ?? ''}:${task.due_date ?? ''}:${task.completed ? '1' : '0'}`)
        .join('|'),
    [tasks],
  );

  const notesSignature = useMemo(
    () => notes.map((note) => `${note.id}:${note.updated_at ?? ''}`).join('|'),
    [notes],
  );

  useEffect(() => {
    if (!mutateAggregation || !shouldFetchAggregation) {
      return;
    }
    void mutateAggregation();
  }, [mutateAggregation, notesSignature, shouldFetchAggregation, tasksSignature]);

  const totals = useMemo(() => {
    if (!aggregation) {
      return { tasks: 0, reminders: 0, notes: 0 };
    }

    return aggregation.days.reduce(
      (acc, day) => {
        acc.tasks += day.tasks.filter((task) => {
          if (task.access === 'personal' && !showPersonal) return false;
          if (task.access === 'shared' && !showShared) return false;
          return true;
        }).length;
        acc.reminders += day.reminders.filter((reminder) => {
          if (reminder.access === 'personal' && !showPersonal) return false;
          if (reminder.access === 'shared' && !showShared) return false;
          return true;
        }).length;
        acc.notes += showPersonal ? day.notes.length : 0;
        return acc;
      },
      { tasks: 0, reminders: 0, notes: 0 },
    );
  }, [aggregation, showPersonal, showShared]);

  const events = useMemo<CalendarTimelineEvent[]>(() => {
    if (!aggregation) {
      return [];
    }

    const items: CalendarTimelineEvent[] = [];
    const hour = 60 * 60 * 1000;
    const halfHour = 30 * 60 * 1000;

    for (const day of aggregation.days) {
      for (const task of day.tasks) {
        if (task.access === 'personal' && !showPersonal) continue;
        if (task.access === 'shared' && !showShared) continue;
        if (!task.due_date) continue;
        const start = new Date(task.due_date);
        if (!isValid(start)) continue;
        const end = new Date(start.getTime() + hour);
        items.push({
          id: task.id,
          title: task.title,
          type: 'task',
          start,
          end,
          access: task.access,
          accessRole: task.access_role,
          draggable: ['owner', 'editor'].includes(task.access_role),
          color: task.category_color,
          referenceId: task.id,
          description: task.category ? `${task.category}${task.completed ? ' · completed' : ''}` : undefined,
          metadata: {
            category_color: task.category_color,
            due_date: task.due_date,
            completed: task.completed,
          },
        });
      }

      for (const reminder of day.reminders) {
        if (reminder.access === 'personal' && !showPersonal) continue;
        if (reminder.access === 'shared' && !showShared) continue;
        const start = new Date(reminder.scheduled_for);
        if (!isValid(start)) continue;
        const end = new Date(start.getTime() + halfHour);
        items.push({
          id: `reminder:${reminder.id}`,
          title: `${reminder.title} reminder`,
          type: 'reminder',
          start,
          end,
          access: reminder.access,
          accessRole: reminder.access_role,
          draggable: false,
          color: reminder.category_color ?? null,
          referenceId: reminder.task_id,
          description: `Reminder scheduled for ${format(start, 'PPpp')}`,
          metadata: {
            scheduled_for: reminder.scheduled_for,
            timezone: reminder.timezone,
          },
        });
      }

      if (showPersonal) {
        for (const note of day.notes) {
          const updated = new Date(note.updated_at);
          if (!isValid(updated)) continue;
          const end = new Date(updated.getTime() + halfHour);
          items.push({
            id: `note:${note.id}`,
            title: note.title,
            type: 'note',
            start: updated,
            end,
            access: 'personal',
            accessRole: 'owner',
            draggable: false,
            description: note.summary ?? undefined,
            metadata: {
              summary: note.summary,
            },
          });
        }
      }
    }

    return items;
  }, [aggregation, showPersonal, showShared]);

  const handleRangeChange = useCallback((range: Date[] | { start: Date; end: Date }) => {
    if (Array.isArray(range)) {
      if (!range.length) {
        return;
      }
      const start = range[0];
      const end = range[range.length - 1];
      if (!isValid(start) || !isValid(end)) {
        return;
      }
      setVisibleRange({ start, end });
      return;
    }

    if (range && range.start && range.end) {
      if (!isValid(range.start) || !isValid(range.end)) {
        return;
      }
      setVisibleRange({ start: range.start, end: range.end });
    }
  }, []);

  const handleNavigate = useCallback((newDate: Date) => {
    if (isValid(newDate)) {
      setCurrentDate(newDate);
    }
  }, []);

  const handleViewChange = useCallback((nextView: View) => {
    setCurrentView(nextView);
  }, []);

  const handleEventDrop = useCallback(
    async ({ event, start }: { event: CalendarTimelineEvent; start: Date }) => {
      if (event.type !== 'task') {
        return;
      }

      const targetTask = tasks.find((task) => task.id === event.id);
      if (!targetTask) {
        setStatusMessage({ type: 'error', message: 'Unable to locate the task to update.' });
        return;
      }

      if (targetTask.access_role && !['owner', 'editor'].includes(targetTask.access_role)) {
        setStatusMessage({ type: 'error', message: 'You do not have permission to reschedule this task.' });
        return;
      }

      const newDueDate = new Date(start);
      if (!isValid(newDueDate)) {
        setStatusMessage({ type: 'error', message: 'Please drop the task onto a valid date.' });
        return;
      }

      const updates: Partial<Task> = {
        due_date: newDueDate.toISOString(),
      };

      if (targetTask.reminder_minutes_before != null) {
        const trigger = newDueDate.getTime() - targetTask.reminder_minutes_before * 60_000;
        updates.reminder_next_trigger_at = new Date(trigger).toISOString();
        updates.reminder_snoozed_until = null;
      }

      if (targetTask.reminder_recurrence) {
        updates.reminder_recurrence = {
          ...targetTask.reminder_recurrence,
          start_at: newDueDate.toISOString(),
        };
      }

      setUpdatingEventId(targetTask.id);
      const result = await saveTask(updates, targetTask);
      setUpdatingEventId(null);

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        setStatusMessage({ type: 'error', message: result.error });
        return;
      }

      setStatusMessage({ type: 'success', message: 'Task due date updated.' });
      if (mutateAggregation) {
        void mutateAggregation();
      }
    },
    [mutateAggregation, saveTask, tasks],
  );

  const rangeSummary = useMemo(() => {
    const startLabel = format(visibleRange.start, 'MMM d');
    const endLabel = format(visibleRange.end, 'MMM d, yyyy');
    return `${startLabel} — ${endLabel}`;
  }, [visibleRange]);

  const timelineLoading = (!aggregation && isValidating) || isValidating || Boolean(updatingEventId);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-sage-50 to-warm-50 dark:from-[rgb(var(--color-zen-50)_/_0.9)] dark:via-[rgb(var(--color-zen-100)_/_0.82)] dark:to-[rgb(var(--color-sage-100)_/_0.85)]">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <ZenPageHeader
          title="Calendar"
          subtitle="Synchronise tasks, reminders, and notes on a shared timeline."
          icon={CalendarClock}
          backHref="/tasks"
          backLabel="Tasks"
          footer={
            <span className="inline-flex items-center gap-2 rounded-full border border-zen-200/70 bg-surface/70 px-3 py-1 text-xs text-zen-600">
              <Filter className="h-3.5 w-3.5" />
              {rangeSummary}
            </span>
          }
          actions={
            <button
              type="button"
              onClick={() => {
                if (mutateAggregation) {
                  void mutateAggregation();
                }
              }}
              className="inline-flex items-center gap-2 rounded-full border border-zen-200/70 bg-surface/80 px-3 py-2 text-sm font-medium text-zen-600 transition hover:border-zen-300 hover:text-zen-800"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          }
        />

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          {statusMessage ? (
            <div
              className={`flex items-start gap-3 rounded-3xl border px-4 py-3 text-sm shadow-soft ${
                statusMessage.type === 'success'
                  ? 'border-zen-200/70 bg-zen-50/80 text-zen-700'
                  : 'border-red-200/70 bg-red-50/80 text-red-700'
              }`}
            >
              <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/60 text-xs font-semibold uppercase tracking-widest text-zen-500">
                {statusMessage.type === 'success' ? 'OK' : '!'}
              </span>
              <span>{statusMessage.message}</span>
            </div>
          ) : null}

          {aggregationError ? (
            <div className="rounded-3xl border border-red-200/70 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-soft">
              {aggregationError.message || 'Unable to load calendar data. Please try again.'}
            </div>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-12">
            <div className="grid gap-4 sm:grid-cols-3 lg:col-span-7">
              <div className="rounded-3xl border border-zen-200/70 bg-surface/80 p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-zen-500 to-zen-600 text-white shadow-medium">
                    <CheckSquare className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zen-500">Tasks</p>
                    <p className="text-2xl font-semibold text-zen-900">{totals.tasks}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-zen-200/70 bg-surface/80 p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-warm-400 to-warm-500 text-white shadow-medium">
                    <Bell className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zen-500">Reminders</p>
                    <p className="text-2xl font-semibold text-zen-900">{totals.reminders}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-zen-200/70 bg-surface/80 p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-400 to-sage-500 text-zen-900 shadow-medium">
                    <StickyNote className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zen-500">Notes</p>
                    <p className="text-2xl font-semibold text-zen-900">{totals.notes}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="flex flex-col gap-3 rounded-3xl border border-zen-200/70 bg-surface/80 p-4 shadow-soft">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zen-500">Filters</p>
                <div className="flex flex-wrap gap-3">
                  <FilterToggle
                    active={showPersonal}
                    onToggle={() => setShowPersonal((prev) => !prev)}
                    label="Personal timeline"
                    description="Show items owned by you, including private notes."
                    icon={User}
                    accent="bg-zen-100/80"
                  />
                  <FilterToggle
                    active={showShared}
                    onToggle={() => setShowShared((prev) => !prev)}
                    label="Shared with me"
                    description="Highlight collaborative tasks and reminders."
                    icon={Users}
                    accent="bg-sage-100/80"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="flex-1">
            <div className="min-h-[700px] rounded-[32px] border border-zen-200/60 bg-surface/90 p-4 shadow-soft">
              <CalendarTimeline
                events={events}
                loading={timelineLoading}
                view={currentView}
                date={currentDate}
                onRangeChange={handleRangeChange}
                onNavigate={(date) => handleNavigate(date)}
                onViewChange={handleViewChange}
                onEventDrop={({ event, start }) => handleEventDrop({ event, start })}
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
