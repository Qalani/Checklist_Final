'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DateSelectArg,
  DatesSetArg,
  EventApi,
  EventClickArg,
  EventContentArg,
} from '@fullcalendar/core';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { CalendarEventRecord } from '@/features/calendar/types';
import './fullcalendar.css';

export type CalendarViewType =
  'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';

export interface CalendarViewEvent extends CalendarEventRecord {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

export interface CalendarSelection {
  start: Date;
  end: Date;
  allDay: boolean;
}

export interface CalendarViewProps {
  events: CalendarViewEvent[];
  view: CalendarViewType;
  date: Date;
  onDatesChange: (payload: {
    range: { start: Date; end: Date };
    view: CalendarViewType;
    currentDate: Date;
  }) => void;
  onEventClick?: (event: CalendarEventRecord) => void;
  onSelect?: (selection: CalendarSelection) => void;
  onEventMove?: (
    event: CalendarEventRecord,
    start: Date,
    end: Date,
    allDay: boolean
  ) => Promise<void>;
  loading?: boolean;
}

const VIEW_OPTIONS: Array<{ value: CalendarViewType; label: string }> = [
  { value: 'dayGridMonth', label: 'Month' },
  { value: 'timeGridWeek', label: 'Week' },
  { value: 'timeGridDay', label: 'Day' },
  { value: 'listWeek', label: 'Agenda' },
];

const TYPE_LABELS = {
  task_due: 'Task',
  task_reminder: 'Task reminder',
  note: 'Note',
  zen_reminder: 'Reminder',
  event: 'Event',
};

function localDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultEnd(start: Date, allDay: boolean): Date {
  const end = new Date(start);
  if (allDay) end.setDate(end.getDate() + 1);
  else end.setHours(end.getHours() + 1);
  return end;
}

function canonicalAllDayDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
}

function canMove(event: CalendarEventRecord): boolean {
  return (
    event.type === 'event' &&
    Boolean(
      event.metadata &&
      'canEdit' in event.metadata &&
      event.metadata.canEdit === true
    )
  );
}

function eventLabel(event: CalendarEventRecord): string {
  return `${event.title}, ${event.allDay ? 'all day' : new Date(event.start).toLocaleString()}, ${TYPE_LABELS[event.type]}`;
}

function renderEventContent({ event, timeText, view }: EventContentArg) {
  const record = event.extendedProps.record as CalendarEventRecord;
  const compact = view.type === 'dayGridMonth';
  const agenda = view.type === 'listWeek';
  return (
    <div
      className={`calendar-event-content${compact ? ' calendar-event-compact' : ''}${agenda ? ' calendar-event-agenda' : ''}`}
    >
      {compact && timeText ? (
        <span className="calendar-event-time">{timeText}</span>
      ) : null}
      <span className="calendar-event-title">{event.title}</span>
      {!compact ? (
        <span className="calendar-event-meta">
          {!agenda ? `${timeText || 'All day'} · ` : ''}
          {TYPE_LABELS[record.type]}
          {record.scope === 'shared' ? ' · Shared' : ''}
        </span>
      ) : null}
    </div>
  );
}

export function FullCalendarView({
  events,
  view,
  date,
  onDatesChange,
  onEventClick,
  onSelect,
  onEventMove,
  loading,
}: CalendarViewProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const lastSelectionAt = useRef(0);
  const movingRef = useRef(false);
  const recordsRef = useRef(new Map(events.map((event) => [event.id, event])));
  const clickRef = useRef(onEventClick);
  const eventElementsRef = useRef(
    new Map<
      HTMLElement,
      { id: string; onKeyDown: (event: KeyboardEvent) => void }
    >()
  );
  recordsRef.current = new Map(events.map((event) => [event.id, event]));
  clickRef.current = onEventClick;
  const [title, setTitle] = useState(() =>
    date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  );
  const [anchorDate, setAnchorDate] = useState(() => localDate(date));
  const [activeView, setActiveView] = useState(view);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    eventElementsRef.current.forEach(({ id }, element) => {
      const record = recordsRef.current.get(id);
      if (record) element.setAttribute('aria-label', eventLabel(record));
    });
  }, [events]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (api.view.type !== view) api.changeView(view, date);
    else if (api.getDate().getTime() !== date.getTime()) api.gotoDate(date);
  }, [view, date]);

  const calendarEvents = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        title: event.title,
        start: event.allDay
          ? event.type === 'event'
            ? event.start.slice(0, 10)
            : localDate(event.start)
          : event.start,
        end: event.allDay
          ? event.type === 'event'
            ? event.end.slice(0, 10)
            : localDate(event.end)
          : event.end,
        allDay: event.allDay,
        display: 'block',
        editable: Boolean(onEventMove) && canMove(event),
        classNames: [
          'calendar-event',
          `calendar-event-type-${event.type}`,
          `calendar-event-scope-${event.scope}`,
        ],
        backgroundColor: event.backgroundColor,
        borderColor: event.borderColor,
        textColor: event.textColor,
        extendedProps: { record: event },
      })),
    [events, onEventMove]
  );

  const handleDatesSet = (arg: DatesSetArg) => {
    if (!VIEW_OPTIONS.some((option) => option.value === arg.view.type)) return;
    const currentDate = calendarRef.current?.getApi().getDate() ?? date;
    setTitle(arg.view.title);
    setAnchorDate(localDate(currentDate));
    setActiveView(arg.view.type as CalendarViewType);
    onDatesChange({
      view: arg.view.type as CalendarViewType,
      range: { start: arg.start, end: arg.end },
      currentDate,
    });
  };

  const handleEventClick = (arg: EventClickArg) => {
    arg.jsEvent.preventDefault();
    const record = recordsRef.current.get(arg.event.id);
    if (record) clickRef.current?.(record);
  };

  const handleSelect = (selection: DateSelectArg) => {
    lastSelectionAt.current = Date.now();
    onSelect?.({
      start: selection.start,
      end: selection.end,
      allDay: selection.allDay,
    });
    calendarRef.current?.getApi().unselect();
  };

  const handleMove = async ({
    event,
    revert,
  }: {
    event: EventApi;
    revert: () => void;
  }) => {
    const record = recordsRef.current.get(event.id);
    if (
      !record ||
      !event.start ||
      !onEventMove ||
      !canMove(record) ||
      movingRef.current
    ) {
      revert();
      return;
    }
    movingRef.current = true;
    setMoving(true);
    try {
      const end = event.end ?? defaultEnd(event.start, event.allDay);
      await onEventMove(
        record,
        event.allDay ? canonicalAllDayDate(event.start) : event.start,
        event.allDay ? canonicalAllDayDate(end) : end,
        event.allDay
      );
    } catch {
      revert();
    } finally {
      movingRef.current = false;
      setMoving(false);
    }
  };

  const move = (direction: 'prev' | 'next' | 'today') => {
    const api = calendarRef.current?.getApi();
    if (direction === 'today') api?.today();
    else if (direction === 'prev') api?.prev();
    else api?.next();
  };

  return (
    <section className="calendar-surface" aria-label="Calendar">
      <div className="calendar-toolbar">
        <div className="calendar-toolbar-heading">
          <h2 className="calendar-toolbar-title" aria-live="polite">
            {title}
          </h2>
          <label className="calendar-date-jump">
            <span>Jump to date</span>
            <CalendarDays
              className="calendar-date-icon"
              size={18}
              aria-hidden="true"
            />
            <input
              type="date"
              aria-label="Jump to date"
              value={anchorDate}
              onChange={(event) => {
                if (!event.target.value) return;
                const next = new Date(`${event.target.value}T12:00:00`);
                if (!Number.isNaN(next.getTime()))
                  calendarRef.current?.getApi().gotoDate(next);
              }}
            />
          </label>
        </div>
        <div className="calendar-toolbar-actions">
          <div
            className="calendar-toolbar-controls"
            role="group"
            aria-label="Calendar navigation"
          >
            <button
              type="button"
              onClick={() => move('prev')}
              className="calendar-icon-button"
              aria-label="Previous period"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => move('today')}
              className="calendar-chip"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => move('next')}
              className="calendar-icon-button"
              aria-label="Next period"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <select
            className="calendar-mobile-view"
            aria-label="Calendar view"
            value={activeView}
            onChange={(event) =>
              calendarRef.current?.getApi().changeView(event.target.value)
            }
          >
            {VIEW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div
            className="calendar-toolbar-views"
            role="group"
            aria-label="Change calendar view"
          >
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={activeView === option.value}
                className={`calendar-view-button${activeView === option.value ? ' is-active' : ''}`}
                onClick={() =>
                  calendarRef.current?.getApi().changeView(option.value)
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className="calendar-body"
        data-view={activeView}
        aria-busy={Boolean(loading || moving)}
      >
        {loading || moving ? (
          <div className="calendar-loading-indicator" role="status">
            <Loader2 className="calendar-spinner" size={16} />
            {moving ? 'Saving event…' : 'Loading calendar…'}
          </div>
        ) : null}
        <FullCalendar
          ref={calendarRef}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            interactionPlugin,
          ]}
          headerToolbar={false}
          initialView={view}
          initialDate={date}
          events={calendarEvents}
          firstDay={1}
          height={
            activeView === 'timeGridWeek' || activeView === 'timeGridDay'
              ? 680
              : 'auto'
          }
          selectable={Boolean(onSelect)}
          selectMirror
          selectMinDistance={5}
          selectLongPressDelay={350}
          eventLongPressDelay={350}
          dayMaxEvents={3}
          fixedWeekCount={false}
          eventContent={renderEventContent}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          dateClick={(arg) => {
            if (Date.now() - lastSelectionAt.current < 250) return;
            onSelect?.({
              start: arg.date,
              end: defaultEnd(arg.date, arg.allDay),
              allDay: arg.allDay,
            });
          }}
          select={handleSelect}
          editable={Boolean(onEventMove) && !moving}
          eventAllow={() => !movingRef.current}
          eventDrop={handleMove}
          eventResize={handleMove}
          eventDurationEditable
          eventResizableFromStart
          eventDidMount={({ el, event }) => {
            const id = event.id;
            const record = recordsRef.current.get(id);
            el.tabIndex = 0;
            el.setAttribute('role', 'button');
            if (record) el.setAttribute('aria-label', eventLabel(record));
            const onKeyDown = (key: KeyboardEvent) => {
              // FullCalendar handles Enter on its anchors. Agenda rows use our
              // custom content, so they also need Enter activation here.
              if (
                key.key !== ' ' &&
                !(key.key === 'Enter' && el.tagName === 'TR')
              )
                return;
              key.preventDefault();
              key.stopPropagation();
              const currentRecord = recordsRef.current.get(id);
              if (currentRecord && !key.repeat)
                clickRef.current?.(currentRecord);
            };
            el.addEventListener('keydown', onKeyDown, true);
            eventElementsRef.current.set(el, { id, onKeyDown });
          }}
          eventWillUnmount={({ el }) => {
            const mounted = eventElementsRef.current.get(el);
            if (mounted)
              el.removeEventListener('keydown', mounted.onKeyDown, true);
            eventElementsRef.current.delete(el);
          }}
          slotLabelFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }}
          dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
          views={{ dayGridMonth: { dayHeaderFormat: { weekday: 'short' } } }}
          slotDuration="00:30:00"
          scrollTime="08:00:00"
          allDayText="All day"
          noEventsContent="No events this week. Add an event or choose another date."
          nowIndicator
          moreLinkClick="popover"
          navLinks
          navLinkDayClick={(nextDate) =>
            calendarRef.current?.getApi().changeView('timeGridDay', nextDate)
          }
        />
      </div>
      <p className="calendar-hint">
        {onSelect ? 'Select a date or time to add an event. ' : ''}
        {onEventMove
          ? 'Drag your events to reschedule, or open one to edit.'
          : 'Open an item to see its details.'}
      </p>
    </section>
  );
}

export default FullCalendarView;
