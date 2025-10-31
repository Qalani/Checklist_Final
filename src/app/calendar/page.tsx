'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Calendar as CalendarIcon, Filter, RefreshCcw } from 'lucide-react';

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

export default function CalendarPage() {
  const router = useRouter();
  const { user, authChecked } = useAuthSession();
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

  const handleDatesChange = useCallback(({ range, view, currentDate }: DatesChangePayload) => {
    setRange({ start: new Date(range.start), end: new Date(range.end) });
    setView(view);
    setCurrentDate(new Date(currentDate));
  }, []);

  const handleEventClick = useCallback((event: CalendarEventRecord) => {
    setSelectedEvent(event);
  }, []);

  const handleScopeChange = useCallback((nextScope: CalendarScope) => {
    setScope(nextScope);
    setSelectedEvent(null);
  }, []);

  const currentLabel = useMemo(() => format(currentDate, view === 'dayGridMonth' ? 'MMMM yyyy' : 'PPPP'), [currentDate, view]);

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-zen-50 via-white to-zen-100 dark:from-zen-950 dark:via-zen-900 dark:to-zen-950">
      <ParallaxBackground />
      <ThemeSwitcher />
      <ZenPageHeader
        title="Harmonic calendar"
        subtitle="A grounded view of your commitments, rituals, and shared moments."
        icon={CalendarIcon}
        actions={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
        footer={<AccountSummary />}
      />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-200/80">{currentLabel}</div>
              {isLoading ? (
                <span className="text-xs font-semibold uppercase tracking-wide text-zen-400 dark:text-zen-500">Loading…</span>
              ) : null}
              {error ? (
                <span className="text-xs font-semibold text-red-500">{error.message ?? 'Unable to load calendar.'}</span>
              ) : null}
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
          <aside className="space-y-4 rounded-3xl border border-zen-200/70 bg-white/80 p-6 shadow-xl backdrop-blur-lg dark:border-zen-800/60 dark:bg-zen-950/60">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-200/70">Event focus</h2>
            {selectedEvent ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-semibold text-zen-900 dark:text-zen-50">{selectedEvent.title}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-zen-400 dark:text-zen-500">{selectedEvent.type.split('_').join(' ')}</span>
                </div>
                <p className="text-sm text-zen-600 dark:text-zen-200/80">{selectedEvent.description ?? 'No additional description provided.'}</p>
                <div className="rounded-2xl bg-zen-100/70 p-3 text-xs font-semibold text-zen-600 shadow-inner dark:bg-zen-800/40 dark:text-zen-200">
                  {formatEventTime(selectedEvent)}
                </div>
                <dl className="grid grid-cols-1 gap-3 text-xs text-zen-500 dark:text-zen-300">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide">Scope</dt>
                    <dd className="capitalize text-zen-600 dark:text-zen-100">{selectedEvent.scope}</dd>
                  </div>
                  {isTaskMetadata(selectedEvent.metadata) ? (
                    <div>
                      <dt className="font-semibold uppercase tracking-wide">Reminder</dt>
                      <dd className="text-zen-600 dark:text-zen-100">
                        {selectedEvent.metadata.reminder?.minutesBefore
                          ? `${selectedEvent.metadata.reminder.minutesBefore} minutes before`
                          : 'No reminder configured'}
                      </dd>
                    </div>
                  ) : null}
                  {isUserEventMetadata(selectedEvent.metadata) ? (
                    <div>
                      <dt className="font-semibold uppercase tracking-wide">Location</dt>
                      <dd className="text-zen-600 dark:text-zen-100">
                        {selectedEvent.metadata.location ? selectedEvent.metadata.location : 'Not specified'}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-zen-500 dark:text-zen-300">
                <p>Select an event from the calendar to see details and context here.</p>
                <p>This panel updates in real time with Supabase live events, so shared edits appear instantly.</p>
              </div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
