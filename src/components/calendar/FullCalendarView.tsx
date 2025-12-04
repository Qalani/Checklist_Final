'use client';

import { useEffect, useRef } from 'react';
import type { DatesSetArg, EventClickArg, EventContentArg } from '@fullcalendar/core';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import './fullcalendar.css';

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

const VIEW_OPTIONS: Array<{ value: CalendarViewType; label: string }> = [
  { value: 'dayGridMonth', label: 'Month' },
  { value: 'timeGridWeek', label: 'Week' },
  { value: 'timeGridDay', label: 'Day' },
];

function renderEventContent(arg: EventContentArg) {
  const { event, timeText } = arg;
  const record = event.extendedProps.record as CalendarEventRecord | undefined;
  const isTaskEvent = record?.type === 'task_due' || record?.type === 'task_reminder';
  const type = (record?.type ?? 'event') as CalendarEventType;

  return (
    <div className="fc-event-wrapper" data-event-type={type}>
      <div className="fc-event-main-row">
        <span className="fc-event-indicator" aria-hidden style={{ backgroundColor: event.backgroundColor }} />
        <span className="fc-event-title">{event.title}</span>
      </div>
      <div className="fc-event-time-row">
        {timeText ? <span className="fc-event-time">{timeText}</span> : <span className="fc-event-time">All day</span>}
        <span className="fc-event-pill" data-event-scope={record?.scope}>
          {type.replace('_', ' ')}
        </span>
      </div>
      {!isTaskEvent && record?.description ? (
        <p className="fc-event-description" title={record.description}>
          {record.description}
        </p>
      ) : null}
    </div>
  );
}

export function FullCalendarView({ events, view, date, onDatesChange, onEventClick, loading }: CalendarViewProps) {
  const calendarRef = useRef<FullCalendar | null>(null);

  const activeLabel = calendarRef.current?.getApi().view?.title ?? '';

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) {
      return;
    }

    if (api.view.type !== view) {
      api.changeView(view, date);
    } else {
      api.gotoDate(date);
    }
  }, [view, date]);

  const handleDatesSet = (arg: DatesSetArg) => {
    if (!VIEW_OPTIONS.some(option => option.value === arg.view.type)) {
      return;
    }

    onDatesChange({
      view: arg.view.type as CalendarViewType,
      range: { start: arg.start, end: arg.end },
      currentDate: arg.view.currentStart,
    });
  };

  const handleEventClick = (arg: EventClickArg) => {
    if (onEventClick) {
      const record = arg.event.extendedProps.record as CalendarEventRecord | undefined;
      onEventClick(record ?? (arg.event.toPlainObject() as CalendarEventRecord));
    }
  };

  const changeView = (nextView: CalendarViewType) => {
    const api = calendarRef.current?.getApi();
    if (!api) return;

    api.changeView(nextView);
  };

  const move = (direction: 'prev' | 'next' | 'today') => {
    const api = calendarRef.current?.getApi();
    if (!api) return;

    if (direction === 'today') {
      api.today();
      return;
    }

    if (direction === 'prev') {
      api.prev();
      return;
    }

    api.next();
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
            {activeLabel || 'Calendar'}
          </div>
        </div>
        <div className="calendar-toolbar-views" role="tablist" aria-label="Change calendar view">
          {VIEW_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              className={`calendar-view-button ${view === option.value ? 'is-active' : ''}`}
              onClick={() => changeView(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="calendar-body">
        {loading ? <div className="calendar-loading-indicator">Loading calendar…</div> : null}
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          headerToolbar={false}
          initialView={view}
          initialDate={date}
          events={events.map(event => ({
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            display: 'block',
            classNames: [
              'calendar-event',
              `calendar-event-type-${event.type}`,
              `calendar-event-scope-${event.scope}`,
            ],
            backgroundColor: event.backgroundColor,
            borderColor: event.borderColor,
            textColor: event.textColor,
            extendedProps: {
              description: event.description,
              scope: event.scope,
              metadata: event.metadata,
              type: event.type,
              record: event,
            },
          }))}
          height="auto"
          selectable
          selectMirror
          dayMaxEvents
          eventContent={renderEventContent}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          slotLabelFormat={{ hour: 'numeric', minute: '2-digit' }}
          dayHeaderFormat={{ weekday: 'short' }}
          buttonText={{ today: 'Today' }}
          nowIndicator
          stickyHeaderDates
          progressiveEventRendering
        />
      </div>
    </div>
  );
}

export default FullCalendarView;
