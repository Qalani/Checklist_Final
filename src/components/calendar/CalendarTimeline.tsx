'use client';

import { useCallback, useMemo, type ComponentType } from 'react';
import { Calendar, dateFnsLocalizer, type Event, type View } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { CalendarCheck, Bell, StickyNote, Users } from 'lucide-react';

import type {
  CalendarEventRecord,
  CalendarNoteMetadata,
  CalendarTaskMetadata,
} from '@/features/calendar/types';

import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import './calendar.css';

interface CalendarTimelineProps {
  date: Date;
  view: View;
  events: CalendarEventRecord[];
  isLoading?: boolean;
  onRangeChange?: (range: { start: Date; end: Date }) => void;
  onViewChange?: (view: View) => void;
  onNavigate?: (date: Date) => void;
  onEventDrop?: (payload: { record: CalendarEventRecord; start: Date; end: Date; isAllDay: boolean }) => void;
}

interface TimelineEvent extends Event {
  resource: CalendarEventRecord;
}

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

const DragAndDropCalendar = withDragAndDrop<TimelineEvent>(Calendar as unknown as ComponentType);

function isTaskMetadata(metadata: unknown): metadata is CalendarTaskMetadata {
  return Boolean(
    metadata &&
      typeof metadata === 'object' &&
      'taskId' in (metadata as Record<string, unknown>) &&
      'canEdit' in (metadata as Record<string, unknown>),
  );
}

function isNoteMetadata(metadata: unknown): metadata is CalendarNoteMetadata {
  return Boolean(
    metadata &&
      typeof metadata === 'object' &&
      'noteId' in (metadata as Record<string, unknown>),
  );
}

function normalizeRange(input: Date[] | { start: Date; end: Date }): { start: Date; end: Date } {
  if (Array.isArray(input)) {
    if (input.length === 0) {
      const now = new Date();
      return { start: now, end: now };
    }
    const sorted = [...input].sort((a, b) => a.getTime() - b.getTime());
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  }
  return input;
}

function EventContent({ event }: { event: TimelineEvent }) {
  const record = event.resource;
  const metadata = record.metadata;
  const taskMetadata = isTaskMetadata(metadata) ? (metadata as CalendarTaskMetadata) : null;
  const noteMetadata = isNoteMetadata(metadata) ? (metadata as CalendarNoteMetadata) : null;
  const isReminder = record.type === 'task_reminder';
  const isNote = record.type === 'note';

  const Icon = isNote ? StickyNote : isReminder ? Bell : CalendarCheck;
  const categoryLabel = taskMetadata?.category ?? (isReminder ? 'Reminder' : isNote ? 'Note' : 'Task');
  const showShared = record.scope === 'shared';

  return (
    <div className="flex flex-col gap-1 text-xs leading-tight text-zen-900 dark:text-zen-900">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 font-medium">
          <Icon className="h-3.5 w-3.5" />
          <span className="truncate">{record.title}</span>
        </span>
        {showShared ? <Users className="h-3 w-3 text-zen-700 dark:text-zen-700" /> : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-zen-700/80 dark:text-zen-700">
        <span className="truncate">
          {categoryLabel}
          {taskMetadata?.categoryColor ? (
            <span
              className="ml-1 inline-flex h-2 w-2 rounded-full"
              style={{ backgroundColor: taskMetadata.categoryColor }}
            />
          ) : null}
        </span>
        {!event.allDay ? (
          <span>
            {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : null}
      </div>
      {isNote ? (
        (() => {
          const updatedAt = noteMetadata?.updatedAt ?? noteMetadata?.createdAt;
          if (!updatedAt) {
            return null;
          }
          return (
            <p className="text-[10px] text-zen-600/80 dark:text-zen-700">
              Updated {new Date(updatedAt).toLocaleString([], { month: 'short', day: 'numeric' })}
            </p>
          );
        })()
      ) : null}
    </div>
  );
}

export function CalendarTimeline({
  date,
  view,
  events,
  isLoading = false,
  onRangeChange,
  onViewChange,
  onNavigate,
  onEventDrop,
}: CalendarTimelineProps) {
  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    return events.map((record) => {
      const startDate = new Date(record.start);
      const endDate = new Date(record.end);
      if (endDate.getTime() <= startDate.getTime()) {
        endDate.setTime(startDate.getTime() + 30 * 60 * 1000);
      }
      return {
        id: record.id,
        title: record.title,
        start: startDate,
        end: endDate,
        allDay: record.allDay,
        resource: record,
      } satisfies TimelineEvent;
    });
  }, [events]);

  const eventPropGetter = useCallback((event: TimelineEvent) => {
    const record = event.resource;
    let background = 'rgba(var(--color-zen-200), 0.9)';
    let border = 'rgba(var(--color-zen-400), 0.55)';
    let color = 'rgb(var(--color-zen-900))';

    if (record.type === 'task_reminder') {
      background = 'rgba(var(--color-warm-200), 0.85)';
      border = 'rgba(var(--color-warm-400), 0.55)';
    } else if (record.type === 'note') {
      background = 'rgba(var(--color-warm-100), 0.85)';
      border = 'rgba(var(--color-warm-300), 0.45)';
    }

    if (record.scope === 'shared') {
      background = 'rgba(var(--color-sage-200), 0.85)';
      border = 'rgba(var(--color-sage-500), 0.55)';
    }

    return {
      style: {
        backgroundColor: background,
        border: `1px solid ${border}`,
        borderRadius: '14px',
        color,
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.08)',
        padding: '8px 10px',
      },
    };
  }, []);

  const draggableAccessor = useCallback((event: TimelineEvent) => {
    const record = event.resource;
    if (record.type !== 'task_due') {
      return false;
    }
    const metadata = record.metadata;
    if (!isTaskMetadata(metadata)) {
      return false;
    }
    return Boolean(metadata.canEdit);
  }, []);

  const handleRangeChange = useCallback(
    (range: Date[] | { start: Date; end: Date }) => {
      if (!onRangeChange) {
        return;
      }
      const normalized = normalizeRange(range);
      onRangeChange(normalized);
    },
    [onRangeChange],
  );

  const handleEventDrop = useCallback(
    (payload: { event: TimelineEvent; start: Date; end: Date; isAllDay: boolean }) => {
      if (!onEventDrop) {
        return;
      }
      const record = payload.event.resource;
      onEventDrop({ record, start: payload.start, end: payload.end, isAllDay: payload.isAllDay });
    },
    [onEventDrop],
  );

  const handleViewChange = useCallback(
    (nextView: View) => {
      onViewChange?.(nextView);
    },
    [onViewChange],
  );

  const handleNavigate = useCallback(
    (nextDate: Date) => {
      onNavigate?.(nextDate);
    },
    [onNavigate],
  );

  return (
    <div className="relative">
      <DragAndDropCalendar
        date={date}
        view={view}
        events={timelineEvents}
        localizer={localizer}
        onRangeChange={handleRangeChange}
        onView={handleViewChange}
        onNavigate={handleNavigate}
        onEventDrop={handleEventDrop}
        draggableAccessor={draggableAccessor}
        resizableAccessor={() => false}
        selectable={false}
        popup
        longPressThreshold={150}
        className="calendar-timeline"
        components={{ event: EventContent }}
        eventPropGetter={eventPropGetter}
        dayLayoutAlgorithm="no-overlap"
        showAllEvents
      />
      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-zen-200 border-t-zen-500" />
        </div>
      ) : null}
      {!isLoading && timelineEvents.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl border border-zen-200/70 bg-surface/90 px-6 py-4 text-sm text-zen-600 shadow-soft dark:border-zen-700/40 dark:text-zen-200">
            No calendar events in this range yet.
          </div>
        </div>
      ) : null}
    </div>
  );
}
