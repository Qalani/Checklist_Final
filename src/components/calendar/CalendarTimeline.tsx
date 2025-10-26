'use client';

import {
  useCallback,
  useMemo,
  type ComponentType,
  type ReactNode,
  type CSSProperties,
} from 'react';
import {
  Calendar,
  dateFnsLocalizer,
  type CalendarProps,
  type DateHeaderProps,
  type Event,
  type HeaderProps,
  type SlotInfo,
  type View,
} from 'react-big-calendar';
import withDragAndDrop, { type EventInteractionArgs } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay, isSameDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { CalendarCheck, Bell, CalendarDays, StickyNote, Users } from 'lucide-react';

import type {
  CalendarEventRecord,
  CalendarNoteMetadata,
  CalendarTaskMetadata,
  CalendarUserEventMetadata,
  CalendarZenReminderMetadata,
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

function CalendarHeaderCell({ date, localizer }: HeaderProps) {
  const isToday = localizer.isSameDate(date, new Date());
  const weekdayLabel = localizer.format(date, 'weekdayFormat');
  const dayOfMonthLabel = localizer.format(date, 'dateFormat');

  return (
    <span
      role="columnheader"
      aria-sort="none"
      className="calendar-header-cell"
      data-today={isToday ? 'true' : undefined}
    >
      <span className="calendar-header-cell-day">{weekdayLabel}</span>
      <span className="calendar-header-cell-date">{dayOfMonthLabel}</span>
    </span>
  );
}

function CalendarMonthDateHeader({ date, drilldownView, onDrillDown }: DateHeaderProps) {
  const isToday = localizer.isSameDate(date, new Date());
  const dayOfMonthLabel = format(date, 'd', { locale: enUS });
  const accessibleLabel = format(date, 'EEEE MMMM d', { locale: enUS });

  const content = (
    <span className="calendar-month-date" data-today={isToday ? 'true' : undefined}>
      <span className="calendar-month-date-number">{dayOfMonthLabel}</span>
    </span>
  );

  if (!drilldownView) {
    return (
      <span aria-label={accessibleLabel} className="calendar-month-date-wrapper">
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      className="rbc-button-link calendar-month-date-button"
      onClick={onDrillDown}
    >
      {content}
    </button>
  );
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const FALLBACK_COLOR_BY_TYPE: Record<CalendarEventRecord['type'], string> = {
  task_due: '#2563eb',
  task_reminder: '#f97316',
  note: '#8b5cf6',
  zen_reminder: '#0ea5e9',
  event: '#6366f1',
};

const WHITE: RgbColor = { r: 255, g: 255, b: 255 };
const BLACK: RgbColor = { r: 15, g: 23, b: 42 };

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(input?: string | null): RgbColor | null {
  if (!input) {
    return null;
  }

  const value = input.trim();
  if (!value.startsWith('#')) {
    return null;
  }

  const hex = value.slice(1);
  if (hex.length === 3) {
    const [r, g, b] = hex.split('');
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    } satisfies RgbColor;
  }

  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    } satisfies RgbColor;
  }

  return null;
}

function mixColor(color: RgbColor, target: RgbColor, amount: number): RgbColor {
  return {
    r: clampChannel(color.r + (target.r - color.r) * amount),
    g: clampChannel(color.g + (target.g - color.g) * amount),
    b: clampChannel(color.b + (target.b - color.b) * amount),
  } satisfies RgbColor;
}

function toRgba(color: RgbColor, alpha = 1): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function relativeLuminance(color: RgbColor): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function computeEventPalette(record: CalendarEventRecord): CSSProperties {
  const metadata = record.metadata;
  const taskMetadata = isTaskMetadata(metadata) ? (metadata as CalendarTaskMetadata) : null;

  const baseHex = taskMetadata?.categoryColor ?? FALLBACK_COLOR_BY_TYPE[record.type];
  const parsedBase = parseHexColor(baseHex) ?? parseHexColor(FALLBACK_COLOR_BY_TYPE[record.type]) ?? {
    r: 79,
    g: 70,
    b: 229,
  };

  const luminance = relativeLuminance(parsedBase);
  const foreground = luminance > 0.55 ? '#0f172a' : '#f8fafc';
  const muted = luminance > 0.55
    ? toRgba(mixColor(parsedBase, BLACK, 0.45), 0.88)
    : toRgba(mixColor(parsedBase, WHITE, 0.65), 0.92);
  const subtle = luminance > 0.55
    ? toRgba(mixColor(parsedBase, BLACK, 0.35), 0.8)
    : toRgba(mixColor(parsedBase, WHITE, 0.78), 0.88);
  const outline = luminance > 0.55 ? 'rgba(15, 23, 42, 0.28)' : 'rgba(255, 255, 255, 0.35)';

  const background = toRgba(mixColor(parsedBase, WHITE, 0.12), 0.92);
  const border = toRgba(mixColor(parsedBase, BLACK, 0.2), 0.75);

  return {
    backgroundColor: background,
    border: `1px solid ${border}`,
    borderRadius: '18px',
    boxShadow: '0 18px 45px rgba(15, 23, 42, 0.18)',
    color: foreground,
    padding: '10px 12px',
    backdropFilter: 'blur(6px)',
    '--calendar-event-foreground': foreground,
    '--calendar-event-muted': muted,
    '--calendar-event-subtle': subtle,
    '--calendar-event-border-contrast': outline,
  } as CSSProperties & Record<string, string>;
}

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

function isZenReminderMetadata(metadata: unknown): metadata is CalendarZenReminderMetadata {
  return Boolean(
    metadata &&
      typeof metadata === 'object' &&
      'reminderId' in (metadata as Record<string, unknown>),
  );
}

function isUserEventMetadata(metadata: unknown): metadata is CalendarUserEventMetadata {
  return Boolean(
    metadata &&
      typeof metadata === 'object' &&
      'eventId' in (metadata as Record<string, unknown>) &&
      'canEdit' in (metadata as Record<string, unknown>),
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
  const isZenReminder = record.type === 'zen_reminder';
  const isNote = record.type === 'note';
  const isCalendarEvent = record.type === 'event';

  const reminderMetadata = isZenReminderMetadata(metadata) ? (metadata as CalendarZenReminderMetadata) : null;
  const eventMetadata = isUserEventMetadata(metadata) ? (metadata as CalendarUserEventMetadata) : null;

  const Icon = isCalendarEvent ? CalendarDays : isNote ? StickyNote : isReminder || isZenReminder ? Bell : CalendarCheck;
  const categoryLabel = isCalendarEvent
    ? 'Event'
    : taskMetadata?.category ?? (isReminder ? 'Reminder' : isZenReminder ? 'Zen Reminder' : isNote ? 'Note' : 'Task');
  const showShared = record.scope === 'shared';

  const locationLabel = isCalendarEvent ? eventMetadata?.location ?? null : null;
  const importLabel = isCalendarEvent ? eventMetadata?.importSource ?? null : null;

  return (
    <div className="calendar-event-content flex flex-col gap-1 text-xs leading-tight">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold leading-tight">
          <Icon className="calendar-event-icon h-4 w-4" />
          <span className="calendar-event-title">{record.title}</span>
        </span>
        {showShared ? <Users className="calendar-event-icon-muted h-3.5 w-3.5" /> : null}
      </div>
      <div className="calendar-event-meta flex items-center justify-between gap-2 text-[11px] font-medium">
        <span className="inline-flex items-center gap-1 truncate">
          {categoryLabel}
          {taskMetadata?.categoryColor ? (
            <span
              className="ml-1 inline-flex h-2 w-2 rounded-full"
              style={{
                backgroundColor: taskMetadata.categoryColor,
                boxShadow: '0 0 0 2px var(--calendar-event-border-contrast)',
              }}
            />
          ) : null}
        </span>
        {!event.allDay && event.start ? (
          <span className="calendar-event-time font-semibold">
            {event.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : null}
      </div>
      {isCalendarEvent && locationLabel ? (
        <div className="calendar-event-tag text-[10px] font-semibold uppercase tracking-wide">
          {locationLabel}
        </div>
      ) : null}
      {isCalendarEvent && importLabel ? (
        <div className="calendar-event-subtle text-[10px]">Imported from {importLabel}</div>
      ) : null}
      {isNote ? (
        (() => {
          const updatedAt = noteMetadata?.updatedAt ?? noteMetadata?.createdAt;
          if (!updatedAt) {
            return null;
          }
          return (
            <p className="calendar-event-subtle text-[10px]">
              Updated {new Date(updatedAt).toLocaleString([], { month: 'short', day: 'numeric' })}
            </p>
          );
        })()
      ) : null}
      {isZenReminder ? (
        (() => {
          if (!reminderMetadata?.timezone) {
            return null;
          }
          return (
            <p className="calendar-event-subtle text-[10px]">
              {reminderMetadata.timezone}
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
    const style = computeEventPalette(record);

    return {
      style,
    };
  }, []);

  const draggableAccessor = useCallback((event: TimelineEvent) => {
    const record = event.resource;
    if (record.type === 'task_due') {
      const metadata = record.metadata;
      if (!isTaskMetadata(metadata)) {
        return false;
      }
      return Boolean(metadata.canEdit);
    }
    if (record.type === 'event') {
      const metadata = record.metadata;
      if (!isUserEventMetadata(metadata)) {
        return false;
      }
      return Boolean(metadata.canEdit);
    }
    return false;
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
      if (!onSelectDate || !event.start) {
        return;
      }
      onSelectDate(new Date(event.start));
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

  const calendarHeight = useMemo(() => {
    if (view === 'month') {
      return 720;
    }
    if (view === 'week') {
      return 840;
    }
    return 680;
  }, [view]);

  return (
    <div className="calendar-shell relative overflow-visible bg-transparent p-0 ring-0 dark:bg-transparent sm:overflow-hidden sm:rounded-3xl sm:border sm:border-zen-200/70 sm:bg-surface/80 sm:p-4 sm:shadow-xl sm:ring-1 sm:ring-black/5 sm:backdrop-blur-sm dark:sm:border-zen-700/40 dark:sm:bg-zen-950/40">
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-br from-zen-100/75 via-transparent to-zen-50/60 dark:from-zen-700/30 dark:via-transparent dark:to-zen-900/40 sm:block" />
      <div className="pointer-events-none absolute -right-24 -top-24 hidden h-72 w-72 rounded-full bg-zen-200/45 blur-3xl dark:bg-zen-700/30 sm:block" />
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
        components={{
          event: EventContent,
          dateCellWrapper: DateCellWrapper,
          header: CalendarHeaderCell,
          month: { dateHeader: CalendarMonthDateHeader },
        }}
        eventPropGetter={eventPropGetter}
        dayPropGetter={dayPropGetter}
        slotPropGetter={slotPropGetter}
        dayLayoutAlgorithm="no-overlap"
        showAllEvents
        style={{ height: calendarHeight }}
      />
      {isLoading ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-surface/70 backdrop-blur-md">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-zen-200 border-t-zen-500" />
        </div>
      ) : null}
    </div>
  );
}
