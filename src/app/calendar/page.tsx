'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, compareAsc } from 'date-fns';
import { Calendar as CalendarIcon, ExternalLink, Filter, RefreshCcw, X } from 'lucide-react';

import ParallaxBackground from '@/components/ParallaxBackground';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ZenPageHeader from '@/components/ZenPageHeader';
import AccountSummary from '@/components/AccountSummary';
import type { CalendarViewType, CalendarViewEvent, CalendarViewProps } from '@/components/calendar/FullCalendarView';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useCalendarData } from '@/features/calendar/useCalendarData';
import type {
  CalendarEventRecord,
  CalendarEventType,
  CalendarScope,
  CalendarTaskMetadata,
  CalendarUserEventMetadata,
} from '@/features/calendar/types';

const FullCalendarViewNoSSR = dynamic<CalendarViewProps>(async () => {
  const mod = await import('@/components/calendar/FullCalendarView');
  return mod.FullCalendarView;
}, { ssr: false });

type RangeState = { start: Date; end: Date };

type DatesChangePayload = {
  range: RangeState;
  view: CalendarViewType;
  currentDate: Date;
};

const EVENT_COLORS: Record<CalendarEventType, { background: string; border: string; text: string }> = {
  task_due: { background: 'rgba(14, 165, 233, 0.95)', border: 'rgba(14, 165, 233, 0.2)', text: '#ffffff' },
  task_reminder: { background: 'rgba(59, 130, 246, 0.9)', border: 'rgba(37, 99, 235, 0.25)', text: '#ffffff' },
  note: { background: 'rgba(249, 115, 22, 0.92)', border: 'rgba(249, 115, 22, 0.2)', text: '#ffffff' },
  zen_reminder: { background: 'rgba(245, 158, 11, 0.95)', border: 'rgba(245, 158, 11, 0.25)', text: '#ffffff' },
  event: { background: 'rgba(99, 102, 241, 0.95)', border: 'rgba(129, 140, 248, 0.25)', text: '#ffffff' },
};

function isTaskMetadata(metadata: CalendarEventRecord['metadata']): metadata is CalendarTaskMetadata {
  return Boolean(metadata && typeof metadata === 'object' && 'taskId' in metadata);
}

function isUserEventMetadata(metadata: CalendarEventRecord['metadata']): metadata is CalendarUserEventMetadata {
  return Boolean(metadata && typeof metadata === 'object' && 'eventId' in metadata);
}

function mapEventToView(record: CalendarEventRecord): CalendarViewEvent {
  const palette = EVENT_COLORS[record.type] ?? {
    background: 'rgba(148, 163, 184, 0.9)',
    border: 'rgba(148, 163, 184, 0.3)',
    text: '#0f172a',
  };
  return {
    ...record,
    backgroundColor: palette.background,
    borderColor: palette.border,
    textColor: palette.text,
  };
}

function formatEventTime(event: CalendarEventRecord) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (event.allDay) {
    return format(start, 'EEEE, MMMM d, yyyy');
  }
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${format(start, 'EEEE, MMMM d')} · ${format(start, 'p')} – ${format(end, 'p')}`;
  }
  return `${format(start, 'EEE, MMM d p')} → ${format(end, 'EEE, MMM d p')}`;
}

function EventDialog({
  event,
  onClose,
  onOpenTask,
}: {
  event: CalendarEventRecord | null;
  onClose: () => void;
  onOpenTask: (taskId?: string) => void;
}) {
  const isTaskEvent = event?.type === 'task_due' || event?.type === 'task_reminder';
  const taskMetadata = isTaskMetadata(event?.metadata) ? event?.metadata : null;

  useEffect(() => {
    if (!event) return;

    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [event, onClose]);

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-zen-900/50 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-zen-200/70 bg-white/95 p-6 shadow-2xl backdrop-blur-lg dark:border-zen-800/70 dark:bg-zen-900/95"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
              {event.scope} · {event.type.split('_').join(' ')}
            </p>
            <h3 className="text-xl font-semibold text-zen-900 dark:text-zen-50">{event.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zen-200/80 bg-white/80 text-zen-500 shadow-sm transition hover:border-zen-300 hover:text-zen-800 dark:border-zen-700/60 dark:bg-zen-900/70 dark:text-zen-300 dark:hover:text-zen-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3 text-sm text-zen-700 dark:text-zen-200">
          <div className="rounded-2xl bg-zen-100/70 p-3 text-xs font-semibold text-zen-700 shadow-inner dark:bg-zen-800/40 dark:text-zen-100">
            {formatEventTime(event)}
          </div>
          <p className="leading-relaxed text-zen-600 dark:text-zen-200/90">
            {event.description ?? 'No additional details provided yet.'}
          </p>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zen-200/70 bg-white/80 p-3 text-xs font-semibold text-zen-600 shadow-sm dark:border-zen-800/70 dark:bg-zen-950/60 dark:text-zen-100">
              <dt className="text-[10px] uppercase tracking-wide text-zen-400 dark:text-zen-500">Scope</dt>
              <dd className="capitalize text-sm font-semibold">{event.scope}</dd>
            </div>
            {taskMetadata ? (
              <div className="rounded-2xl border border-zen-200/70 bg-white/80 p-3 text-xs font-semibold text-zen-600 shadow-sm dark:border-zen-800/70 dark:bg-zen-950/60 dark:text-zen-100">
                <dt className="text-[10px] uppercase tracking-wide text-zen-400 dark:text-zen-500">Reminder</dt>
                <dd className="text-sm font-semibold">
                  {taskMetadata.reminder?.minutesBefore
                    ? `${taskMetadata.reminder.minutesBefore} minutes before`
                    : 'No reminder configured'}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {isTaskEvent ? (
            <button
              type="button"
              onClick={() => onOpenTask(taskMetadata?.taskId)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl"
            >
              Go to task
              <ExternalLink className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full border border-zen-200/80 bg-white/90 px-4 py-2 text-sm font-semibold text-zen-600 shadow-sm transition hover:border-zen-300 hover:text-zen-800 dark:border-zen-700/60 dark:bg-zen-900/80 dark:text-zen-200 dark:hover:text-zen-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const { user, authChecked, signOut } = useAuthSession();
  const [scope, setScope] = useState<CalendarScope>('all');
  const [view, setView] = useState<CalendarViewType>('dayGridMonth');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [range, setRange] = useState<RangeState>(() => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }));
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventRecord | null>(null);

  useEffect(() => {
    if (!authChecked) {
      return;
    }
    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  const { events = [], isLoading, isValidating, error, refresh } = useCalendarData(user?.id ?? null, {
    start: range.start,
    end: range.end,
    scope,
    pause: !authChecked,
  });

  const calendarEvents = useMemo(() => events.map((event) => mapEventToView(event)), [events]);

  const upcomingHighlights = useMemo(
    () =>
      [...events]
        .sort((a, b) => compareAsc(new Date(a.start), new Date(b.start)))
        .filter((event) => new Date(event.end) >= new Date())
        .slice(0, 6),
    [events],
  );

  const handleDatesChange = useCallback(({ range, view, currentDate }: DatesChangePayload) => {
    setRange((previousRange) => {
      const startChanged = previousRange.start.getTime() !== range.start.getTime();
      const endChanged = previousRange.end.getTime() !== range.end.getTime();

      if (!startChanged && !endChanged) {
        return previousRange;
      }

      return { start: new Date(range.start), end: new Date(range.end) };
    });

    setView((previousView) => (previousView === view ? previousView : view));

    setCurrentDate((previousDate) => {
      const nextDateTime = currentDate.getTime();
      return previousDate.getTime() === nextDateTime ? previousDate : new Date(currentDate);
    });
  }, []);

  const handleEventClick = useCallback((event: CalendarEventRecord) => {
    setSelectedEvent(event);
  }, []);

  const handleScopeChange = useCallback((nextScope: CalendarScope) => {
    setScope(nextScope);
    setSelectedEvent(null);
  }, []);

  const handleOpenTask = useCallback(
    (taskId?: string) => {
      if (taskId) {
        router.push(`/tasks?taskId=${taskId}`);
      } else {
        router.push('/tasks');
      }
      setSelectedEvent(null);
    },
    [router],
  );

  const statusChips = [
    isLoading ? 'Syncing calendar' : null,
    isValidating && !isLoading ? 'Refreshing' : null,
    error ? 'Unable to load calendar' : null,
  ].filter(Boolean);

  const currentLabel = useMemo(() => format(currentDate, view === 'dayGridMonth' ? 'MMMM yyyy' : 'PPPP'), [currentDate, view]);

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-zen-50 via-white to-zen-100 dark:from-zen-950 dark:via-zen-900 dark:to-zen-950">
      <ParallaxBackground />
      <ZenPageHeader
        title="Harmonic calendar"
        subtitle="A grounded view of your commitments, rituals, and shared moments."
        icon={CalendarIcon}
        backHref="/"
        backLabel="Overview"
        actions={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ThemeSwitcher />
            <div className="flex items-center gap-2 rounded-full border border-zen-200/70 bg-white/70 px-3 py-2 text-sm font-medium text-zen-600 shadow-soft backdrop-blur-sm dark:border-zen-700/60 dark:bg-zen-900/60 dark:text-zen-200">
              <Filter className="h-4 w-4" />
              <select
                className="bg-transparent text-sm font-semibold focus:outline-none"
                value={scope}
                onChange={(event) => handleScopeChange(event.target.value as CalendarScope)}
              >
                <option value="all">All spaces</option>
                <option value="personal">Personal</option>
                <option value="shared">Shared</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => refresh()}
              className="inline-flex items-center gap-2 rounded-full border border-zen-200/80 bg-white/80 px-3 py-2 text-sm font-semibold text-zen-600 shadow-soft transition hover:border-zen-300 hover:text-zen-800 dark:border-zen-700/60 dark:bg-zen-900/60 dark:text-zen-200 dark:hover:text-zen-50"
              aria-label="Refresh calendar"
            >
              <RefreshCcw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        }
        footer={
          <AccountSummary
            email={user?.email ?? undefined}
            syncing={isValidating}
            onSignOut={signOut}
          />
        }
      />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className="grid gap-6 xl:grid-cols-[1.7fr,1fr]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-zen-200/70 bg-white/80 px-4 py-3 shadow-soft backdrop-blur-lg dark:border-zen-800/60 dark:bg-zen-950/70">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">Visible range</p>
                <p className="text-lg font-semibold text-zen-900 dark:text-zen-50">{currentLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {statusChips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-2 rounded-full border border-zen-200/70 bg-zen-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zen-600 dark:border-zen-800/60 dark:bg-zen-900/70 dark:text-zen-100"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <FullCalendarViewNoSSR
              events={calendarEvents}
              view={view}
              date={currentDate}
              loading={isLoading && events.length === 0}
              onDatesChange={handleDatesChange}
              onEventClick={handleEventClick}
            />
          </div>
          <aside className="space-y-4 rounded-3xl border border-zen-200/70 bg-white/85 p-6 shadow-xl backdrop-blur-lg dark:border-zen-800/60 dark:bg-zen-950/70">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">Up next</p>
                <h2 className="text-lg font-semibold text-zen-900 dark:text-zen-50">Upcoming highlights</h2>
              </div>
              <div className="rounded-full bg-zen-100 px-3 py-1 text-xs font-semibold text-zen-600 dark:bg-zen-900/60 dark:text-zen-100">
                {upcomingHighlights.length} items
              </div>
            </div>
            <div className="space-y-3">
              {upcomingHighlights.length === 0 ? (
                <p className="text-sm text-zen-500 dark:text-zen-300">No upcoming events in this range yet.</p>
              ) : (
                upcomingHighlights.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => handleEventClick(event)}
                    className="w-full rounded-2xl border border-zen-200/70 bg-gradient-to-br from-white via-zen-50 to-zen-100 px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zen-300 hover:shadow-md dark:border-zen-800/60 dark:from-zen-900 dark:via-zen-900/90 dark:to-zen-800"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold uppercase tracking-wide text-zen-400 dark:text-zen-500">
                          {event.type.replace('_', ' ')} · {event.scope}
                        </span>
                        <span className="text-base font-semibold text-zen-900 dark:text-zen-50">{event.title}</span>
                        <span className="text-sm font-medium text-zen-600 dark:text-zen-200">{formatEventTime(event)}</span>
                      </div>
                      <span className="rounded-full bg-zen-100 px-3 py-1 text-xs font-semibold text-zen-600 dark:bg-zen-800/70 dark:text-zen-100">
                        {event.allDay ? 'All day' : 'Timed'}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>
        </section>
      </main>
      <EventDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} onOpenTask={handleOpenTask} />
    </div>
  );
}
