'use client';

import 'temporal-polyfill/global';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScheduleXCalendar, useNextCalendarApp } from '@schedule-x/react';
import {
  createViewDay,
  createViewWeek,
  createViewMonthGrid,
  type CalendarEvent as SXCalendarEvent,
  type CalendarType,
} from '@schedule-x/calendar';
import { createCalendarControlsPlugin } from '@schedule-x/calendar-controls';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import '@schedule-x/theme-default/dist/index.css';
import './schedulex.css';

import type { CalendarEventRecord, CalendarEventType } from '@/features/calendar/types';

export type CalendarViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

export interface CalendarViewEvent extends CalendarEventRecord {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

export interface CalendarViewProps {
  events: CalendarViewEvent[];
  view: CalendarViewType;
  date: Date;
  onDatesChange: (payload: { range: { start: Date; end: Date }; view: CalendarViewType; currentDate: Date }) => void;
  onEventClick?: (event: CalendarEventRecord) => void;
  loading?: boolean;
}

const SX_VIEW_MAP: Record<CalendarViewType, string> = {
  dayGridMonth: 'month-grid',
  timeGridWeek: 'week',
  timeGridDay: 'day',
};

const FC_VIEW_MAP: Record<string, CalendarViewType> = {
  'month-grid': 'dayGridMonth',
  week: 'timeGridWeek',
  day: 'timeGridDay',
};

const VIEW_OPTIONS: Array<{ value: CalendarViewType; label: string }> = [
  { value: 'dayGridMonth', label: 'Month' },
  { value: 'timeGridWeek', label: 'Week' },
  { value: 'timeGridDay', label: 'Day' },
];

const CALENDARS: Record<string, CalendarType> = {
  task_due: {
    colorName: 'task_due',
    lightColors: { main: 'rgba(14,165,233,0.95)', container: 'rgba(14,165,233,0.12)', onContainer: '#0f172a' },
    darkColors: { main: '#38bdf8', container: 'rgba(14,165,233,0.18)', onContainer: '#e2e8f0' },
  },
  task_reminder: {
    colorName: 'task_reminder',
    lightColors: { main: 'rgba(59,130,246,0.9)', container: 'rgba(59,130,246,0.12)', onContainer: '#0f172a' },
    darkColors: { main: '#60a5fa', container: 'rgba(59,130,246,0.18)', onContainer: '#e2e8f0' },
  },
  note: {
    colorName: 'note',
    lightColors: { main: 'rgba(249,115,22,0.92)', container: 'rgba(249,115,22,0.12)', onContainer: '#0f172a' },
    darkColors: { main: '#fb923c', container: 'rgba(249,115,22,0.18)', onContainer: '#e2e8f0' },
  },
  zen_reminder: {
    colorName: 'zen_reminder',
    lightColors: { main: 'rgba(245,158,11,0.95)', container: 'rgba(245,158,11,0.12)', onContainer: '#0f172a' },
    darkColors: { main: '#fbbf24', container: 'rgba(245,158,11,0.18)', onContainer: '#e2e8f0' },
  },
  event: {
    colorName: 'event',
    lightColors: { main: 'rgba(99,102,241,0.95)', container: 'rgba(99,102,241,0.12)', onContainer: '#0f172a' },
    darkColors: { main: '#818cf8', container: 'rgba(99,102,241,0.18)', onContainer: '#e2e8f0' },
  },
};

function toSXEvent(event: CalendarViewEvent): SXCalendarEvent & { _record: CalendarViewEvent } {
  let start: Temporal.ZonedDateTime | Temporal.PlainDate;
  let end: Temporal.ZonedDateTime | Temporal.PlainDate;

  if (event.allDay) {
    start = Temporal.PlainDate.from(event.start.slice(0, 10));
    const endStr = event.end.slice(0, 10);
    // For all-day events, schedule-x end is exclusive so we use same date as start
    end = Temporal.PlainDate.from(endStr);
  } else {
    start = Temporal.Instant.from(event.start).toZonedDateTimeISO('UTC');
    end = Temporal.Instant.from(event.end).toZonedDateTimeISO('UTC');
  }

  return {
    id: event.id,
    title: event.title,
    start,
    end,
    calendarId: event.type as CalendarEventType,
    description: event.description ?? undefined,
    _record: event,
  };
}

function formatViewTitle(rangeStart: Date, view: CalendarViewType): string {
  const locale = 'en-US';
  if (view === 'dayGridMonth') {
    return rangeStart.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }
  if (view === 'timeGridWeek') {
    const weekEnd = new Date(rangeStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    if (rangeStart.getMonth() === weekEnd.getMonth()) {
      return rangeStart.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    }
    const startLabel = rangeStart.toLocaleDateString(locale, { month: 'short' });
    const endLabel = weekEnd.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
    return `${startLabel} – ${endLabel}`;
  }
  return rangeStart.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function ScheduleXCalendarView({
  events,
  view,
  date,
  onDatesChange,
  onEventClick,
  loading,
}: CalendarViewProps) {
  const controlsPlugin = useMemo(() => createCalendarControlsPlugin(), []);
  const eventsPlugin = useMemo(() => createEventsServicePlugin(), []);

  const [activeView, setActiveView] = useState<CalendarViewType>(view);
  const [title, setTitle] = useState(() => formatViewTitle(date, view));

  const onDatesChangeRef = useRef(onDatesChange);
  onDatesChangeRef.current = onDatesChange;

  const onEventClickRef = useRef(onEventClick);
  onEventClickRef.current = onEventClick;

  const initialSXEvents = useMemo(() => events.map(toSXEvent), []);

  const calendar = useNextCalendarApp(
    {
      views: [createViewMonthGrid(), createViewWeek(), createViewDay()],
      defaultView: SX_VIEW_MAP[view],
      selectedDate: Temporal.PlainDate.from(date.toISOString().slice(0, 10)),
      events: initialSXEvents as SXCalendarEvent[],
      calendars: CALENDARS,
      plugins: [controlsPlugin, eventsPlugin],
      callbacks: {
        onRangeUpdate(range) {
          const rangeStart = new Date(range.start.toInstant().epochMilliseconds);
          const rangeEnd = new Date(range.end.toInstant().epochMilliseconds);
          const sxView = controlsPlugin.getView();
          const fcView = FC_VIEW_MAP[sxView] ?? 'dayGridMonth';

          setActiveView(fcView);
          setTitle(formatViewTitle(rangeStart, fcView));

          onDatesChangeRef.current({
            range: { start: rangeStart, end: rangeEnd },
            view: fcView,
            currentDate: rangeStart,
          });
        },
        onEventClick(sxEvent) {
          const record = (sxEvent as { _record?: CalendarViewEvent })._record;
          onEventClickRef.current?.(record ?? (sxEvent as unknown as CalendarEventRecord));
        },
      },
    },
    [controlsPlugin, eventsPlugin],
  );

  // Keep events in sync when they change
  useEffect(() => {
    if (!calendar) return;
    eventsPlugin.set(events.map(toSXEvent) as SXCalendarEvent[]);
  }, [calendar, events, eventsPlugin]);

  const move = (direction: 'prev' | 'next' | 'today') => {
    if (!calendar) return;

    if (direction === 'today') {
      controlsPlugin.setDate(Temporal.Now.plainDateISO());
      return;
    }

    const currentPlain = controlsPlugin.getDate();
    const currentView = controlsPlugin.getView();

    let next: Temporal.PlainDate;
    if (currentView === 'month-grid') {
      next = direction === 'prev' ? currentPlain.subtract({ months: 1 }) : currentPlain.add({ months: 1 });
    } else if (currentView === 'week') {
      next = direction === 'prev' ? currentPlain.subtract({ days: 7 }) : currentPlain.add({ days: 7 });
    } else {
      next = direction === 'prev' ? currentPlain.subtract({ days: 1 }) : currentPlain.add({ days: 1 });
    }

    controlsPlugin.setDate(next);
  };

  const changeView = (nextView: CalendarViewType) => {
    if (!calendar) return;
    controlsPlugin.setView(SX_VIEW_MAP[nextView]);
    setActiveView(nextView);
  };

  return (
    <div className="calendar-surface">
      <div className="calendar-toolbar">
        <div className="calendar-toolbar-left">
          <div className="calendar-toolbar-controls" aria-label="Calendar navigation">
            <button type="button" onClick={() => move('prev')} className="calendar-icon-button" aria-label="Previous period">
              ‹
            </button>
            <button type="button" onClick={() => move('today')} className="calendar-chip">
              Today
            </button>
            <button type="button" onClick={() => move('next')} className="calendar-icon-button" aria-label="Next period">
              ›
            </button>
          </div>
          <div className="calendar-toolbar-title" aria-live="polite">
            {title || 'Calendar'}
          </div>
        </div>
        <div className="calendar-toolbar-views" role="tablist" aria-label="Change calendar view">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={activeView === option.value}
              className={`calendar-view-button ${activeView === option.value ? 'is-active' : ''}`}
              onClick={() => changeView(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="calendar-body sx-body">
        {loading ? <div className="calendar-loading-indicator">Loading calendar…</div> : null}
        <ScheduleXCalendar calendarApp={calendar} />
      </div>
    </div>
  );
}

export default ScheduleXCalendarView;
