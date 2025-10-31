'use client';

import { useEffect, useRef } from 'react';
import type { EventClickArg, DatesSetArg, EventContentArg } from '@fullcalendar/core';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';

import '@fullcalendar/core/index.css';
import '@fullcalendar/daygrid/index.css';
import '@fullcalendar/timegrid/index.css';
import '@fullcalendar/list/index.css';
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

const VIEW_OPTIONS: CalendarViewType[] = ['dayGridMonth', 'timeGridWeek', 'timeGridDay'];

function renderEventContent(arg: EventContentArg) {
  const { event, timeText } = arg;
  const { description, type } = event.extendedProps as { description?: string | null; type: CalendarEventType };

  return (
    <div className="fc-event-wrapper" data-event-type={type}>
      <div className="fc-event-main-title">{event.title}</div>
      {timeText ? <div className="fc-event-main-time">{timeText}</div> : null}
      {description ? <div className="fc-event-main-desc">{description}</div> : null}
    </div>
  );
}

export function FullCalendarView({ events, view, date, onDatesChange, onEventClick, loading }: CalendarViewProps) {
  const calendarRef = useRef<FullCalendar | null>(null);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) {
      return;
    }
    if (api.view.type !== view) {
      api.changeView(view, date);
    }
  }, [view, date]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) {
      return;
    }
    const current = api.getDate();
    if (current.getTime() !== date.getTime()) {
      api.gotoDate(date);
    }
  }, [date]);

  const handleDatesSet = (arg: DatesSetArg) => {
    if (!VIEW_OPTIONS.includes(arg.view.type as CalendarViewType)) {
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

  return (
    <div className="calendar-view-shell">
      {loading ? <div className="calendar-loading-indicator">Loading calendar…</div> : null}
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        initialView={view}
        initialDate={date}
        events={events.map((event) => ({
          id: event.id,
          title: event.title,
          start: event.start,
          end: event.end,
          allDay: event.allDay,
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
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        height="auto"
        selectable
        selectMirror
        eventContent={renderEventContent}
        datesSet={handleDatesSet}
        eventClick={handleEventClick}
        slotLabelFormat={{ hour: 'numeric', minute: '2-digit' }}
        dayHeaderFormat={{ weekday: 'short' }}
        buttonText={{
          today: 'Today',
          month: 'Month',
          week: 'Week',
          day: 'Day',
        }}
      />
    </div>
  );
}

export default FullCalendarView;
