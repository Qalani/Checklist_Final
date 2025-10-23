'use client';

import { useCallback, useMemo, type ComponentType, type ReactNode } from 'react';
import {
  Calendar,
  dateFnsLocalizer,
  type CalendarProps,
  type Event,
  type View,
  type SlotInfo,
} from 'react-big-calendar';
import withDragAndDrop, { type EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay, isSameDay } from 'date-fns';
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

type CalendarView = 'month' | 'week' | 'day';

interface CalendarTimelineProps {
  date: Date;
  view: CalendarView;
  events: CalendarEventRecord[];
  isLoading?: boolean;
  onRangeChange?: (range: { start: Date; end: Date }) => void;
  onViewChange?: (view: CalendarView) => void;
  onNavigate?: (date: Date) => void;
  onEventDrop?: (payload: { record: CalendarEventRecord; start: Date; end: Date; isAllDay: boolean }) => void;
  onSelectDate?: (date: Date) => void;
  selectedDate?: Date | null;
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

const DragAndDropCalendar = withDragAndDrop<TimelineEvent>(
  Calendar as ComponentType<CalendarProps<TimelineEvent, object>>,
);

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
    <div className="flex flex-col gap-1 text-xs leading-tight text-white">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold leading-tight">
          <Icon className="h-4 w-4 text-white/80" />
          <span className="calendar-event-title text-white">{record.title}</span>
        </span>
        {showShared ? <Users className="h-3.5 w-3.5 text-white/75" /> : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-white/80">
        <span className="inline-flex items-center gap-1 truncate">
          {categoryLabel}
          {taskMetadata?.categoryColor ? (
            <span
              className="ml-1 inline-flex h-2 w-2 rounded-full"
              style={{
                backgroundColor: taskMetadata.categoryColor,
                boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.35)',
              }}
            />
          ) : null}
        </span>
        {!event.allDay && event.start ? (
          <span className="font-semibold text-white">{event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        ) : null}
      </div>
      {isNote ? (
        (() => {
          const updatedAt = noteMetadata?.updatedAt ?? noteMetadata?.createdAt;
          if (!updatedAt) {
            return null;
          }
          return (
            <p className="text-[10px] text-white/70">
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
  onSelectDate,
  selectedDate = null,
}: CalendarTimelineProps) {
  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    return events.map((record) => {
      const startDate = new Date(record.start);
      const endDate = new Date(record.end);
      if (endDate.getTime() <= startDate.getTime()) {
        endDate.setTime(startDate.getTime() + 30 * 60 * 1000);
      }
      return {
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

    let backgroundColor = 'rgba(var(--color-zen-500), 0.92)';
    let backgroundImage = 'linear-gradient(135deg, rgba(var(--color-zen-500), 0.95), rgba(var(--color-zen-400), 0.86))';
    let border = 'rgba(var(--color-zen-400), 0.55)';

    if (record.type === 'task_reminder') {
      backgroundColor = 'rgba(var(--color-warm-500), 0.94)';
      backgroundImage = 'linear-gradient(135deg, rgba(var(--color-warm-500), 0.96), rgba(var(--color-warm-400), 0.84))';
      border = 'rgba(var(--color-warm-400), 0.6)';
    } else if (record.type === 'note') {
      backgroundColor = 'rgba(var(--color-warm-400), 0.92)';
      backgroundImage = 'linear-gradient(135deg, rgba(var(--color-warm-400), 0.94), rgba(var(--color-warm-300), 0.82))';
      border = 'rgba(var(--color-warm-300), 0.6)';
    }

    if (record.scope === 'shared') {
      backgroundColor = 'rgba(var(--color-sage-500), 0.94)';
      backgroundImage = 'linear-gradient(135deg, rgba(var(--color-sage-500), 0.96), rgba(var(--color-sage-400), 0.84))';
      border = 'rgba(var(--color-sage-400), 0.65)';
    }

    return {
      style: {
        backgroundColor,
        backgroundImage,
        border: `1px solid ${border}`,
        borderRadius: '18px',
        color: 'white',
        boxShadow: '0 18px 45px rgba(15, 23, 42, 0.18)',
        padding: '10px 12px',
        backdropFilter: 'blur(6px)',
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
    (payload: EventInteractionArgs<TimelineEvent>) => {
      if (!onEventDrop) {
        return;
      }
      const record = payload.event.resource;
      const nextStart = new Date(payload.start);
      const nextEnd = new Date(payload.end);
      onEventDrop({ record, start: nextStart, end: nextEnd, isAllDay: Boolean(payload.isAllDay) });
    },
    [onEventDrop],
  );

  const handleViewChange = useCallback(
    (nextView: View) => {
      if (!onViewChange) {
        return;
      }
      if (nextView === 'month' || nextView === 'week' || nextView === 'day') {
        onViewChange(nextView);
      }
    },
    [onViewChange],
  );

  const handleNavigate = useCallback(
    (nextDate: Date) => {
      onNavigate?.(nextDate);
    },
    [onNavigate],
  );

  const handleSelectSlot = useCallback(
    (slotInfo: SlotInfo) => {
      if (!onSelectDate) {
        return;
      }
      const nextDate = new Date(slotInfo.start);
      onSelectDate(nextDate);
    },
    [onSelectDate],
  );

  const handleSelectEvent = useCallback(
    (event: TimelineEvent) => {
      onSelectDate?.(new Date(event.start));
    },
    [onSelectDate],
  );

  const dayPropGetter = useCallback(
    (value: Date) => {
      if (!selectedDate) {
        return {};
      }
      return isSameDay(value, selectedDate) ? { className: 'calendar-selected-day' } : {};
    },
    [selectedDate],
  );

  const slotPropGetter = useCallback(
    (value: Date) => {
      if (!selectedDate) {
        return {};
      }
      return isSameDay(value, selectedDate) ? { className: 'calendar-selected-slot' } : {};
    },
    [selectedDate],
  );

  const DateCellWrapper = useMemo(() => {
    return function CalendarDateCellWrapper({ value, children }: { value: Date; children?: ReactNode }) {
      const isSelected = selectedDate ? isSameDay(value, selectedDate) : false;
      return (
        <div className={isSelected ? 'calendar-selected-date-cell' : undefined}>{children}</div>
      );
    };
  }, [selectedDate]);

  return (
    <div className="calendar-shell relative overflow-hidden rounded-3xl border border-zen-200/70 bg-surface/80 p-4 shadow-xl ring-1 ring-black/5 backdrop-blur-sm dark:border-zen-700/40 dark:bg-zen-950/40">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-zen-100/75 via-transparent to-zen-50/60 dark:from-zen-700/30 dark:via-transparent dark:to-zen-900/40" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-zen-200/45 blur-3xl dark:bg-zen-700/30" />
      <DragAndDropCalendar
        date={date}
        view={view}
        views={['month', 'week', 'day']}
        events={timelineEvents}
        localizer={localizer}
        onRangeChange={handleRangeChange}
        onView={handleViewChange}
        onNavigate={handleNavigate}
        onEventDrop={handleEventDrop}
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        draggableAccessor={draggableAccessor}
        resizableAccessor={() => false}
        selectable="ignoreEvents"
        popup
        longPressThreshold={150}
        className="calendar-timeline relative z-10"
        components={{ event: EventContent, dateCellWrapper: DateCellWrapper }}
        eventPropGetter={eventPropGetter}
        dayPropGetter={dayPropGetter}
        slotPropGetter={slotPropGetter}
        dayLayoutAlgorithm="no-overlap"
        showAllEvents
      />
      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-surface/70 backdrop-blur-md">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-zen-200 border-t-zen-500" />
        </div>
      ) : null}
    </div>
  );
}
