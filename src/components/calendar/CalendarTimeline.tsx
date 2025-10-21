'use client';

import { useCallback, useMemo } from 'react';
import {
  Calendar,
  Views,
  dateFnsLocalizer,
  type EventProps,
  type View,
  type EventInteractionArgs,
} from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';

import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

import type { CalendarAccessRole, CalendarAccessScope } from '@/types/calendar';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export type CalendarEventType = 'task' | 'reminder' | 'note';

export interface CalendarTimelineEvent {
  id: string;
  title: string;
  type: CalendarEventType;
  start: Date;
  end: Date;
  allDay?: boolean;
  access: CalendarAccessScope;
  accessRole?: CalendarAccessRole;
  draggable?: boolean;
  description?: string;
  color?: string | null;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}

export interface CalendarTimelineProps {
  events: CalendarTimelineEvent[];
  loading?: boolean;
  view?: View;
  date?: Date;
  min?: Date;
  max?: Date;
  showNowIndicator?: boolean;
  onRangeChange?: (range: Date[] | { start: Date; end: Date }) => void;
  onNavigate?: (date: Date, view: View, action: 'PREV' | 'NEXT' | 'TODAY' | 'DATE') => void;
  onViewChange?: (view: View) => void;
  onEventDrop?: (args: EventInteractionArgs<CalendarTimelineEvent>) => void | Promise<void>;
}

const DnDCalendar = withDragAndDrop<CalendarTimelineEvent>(Calendar);

function sanitizeHex(color: string | null | undefined): string | null {
  if (!color) {
    return null;
  }

  const trimmed = color.trim();
  const hexMatch = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!hexMatch) {
    return null;
  }

  if (hexMatch[1].length === 3) {
    const [r, g, b] = hexMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return trimmed.toLowerCase();
}

function pickTextColor(background: string | null): string {
  const fallbackDark = '#0f172a';
  const fallbackLight = '#ffffff';

  if (!background) {
    return fallbackLight;
  }

  const sanitized = sanitizeHex(background);
  if (!sanitized) {
    return fallbackLight;
  }

  const r = parseInt(sanitized.slice(1, 3), 16) / 255;
  const g = parseInt(sanitized.slice(3, 5), 16) / 255;
  const b = parseInt(sanitized.slice(5, 7), 16) / 255;

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? fallbackDark : fallbackLight;
}

interface EventPalette {
  background: string;
  border: string;
  text: string;
}

function getPalette(event: CalendarTimelineEvent): EventPalette {
  if (event.type === 'task') {
    const base = sanitizeHex((event.color as string | null) ?? (event.metadata?.category_color as string | null));
    const background = base ?? '#7199B6';
    return {
      background,
      border: base ?? 'rgba(113, 153, 182, 0.6)',
      text: pickTextColor(background),
    };
  }

  if (event.type === 'reminder') {
    return {
      background: '#F59E0B',
      border: 'rgba(245, 158, 11, 0.6)',
      text: '#1f2937',
    };
  }

  return {
    background: '#8B5CF6',
    border: 'rgba(139, 92, 246, 0.6)',
    text: '#f9fafb',
  };
}

function EventContent({ event }: EventProps<CalendarTimelineEvent>) {
  const accessLabel = event.access === 'shared' ? 'Shared' : 'Personal';
  return (
    <div className="flex flex-col gap-0.5 leading-tight text-[11px]">
      <span className="font-semibold text-[12px] tracking-tight">{event.title}</span>
      <span className="text-[10px] uppercase tracking-[0.14em] opacity-80">{event.type}</span>
      <span className="text-[10px] uppercase tracking-[0.18em] opacity-65">{accessLabel}</span>
    </div>
  );
}

const scrollToTime = new Date();
scrollToTime.setHours(8, 0, 0, 0);

export function CalendarTimeline({
  events,
  loading = false,
  view,
  date,
  min,
  max,
  showNowIndicator = true,
  onRangeChange,
  onNavigate,
  onViewChange,
  onEventDrop,
}: CalendarTimelineProps) {
  const eventPropGetter = useCallback((event: CalendarTimelineEvent) => {
    const palette = getPalette(event);
    return {
      style: {
        backgroundColor: palette.background,
        borderColor: palette.border,
        color: palette.text,
        borderRadius: '14px',
        borderWidth: '1px',
        borderStyle: 'solid',
        boxShadow: '0 16px 32px rgba(15, 23, 42, 0.12)',
        opacity: event.access === 'shared' ? 0.92 : 1,
        padding: '6px 8px',
      },
    };
  }, []);

  const rangeHandler = useCallback(
    (range: Date[] | { start: Date; end: Date }) => {
      onRangeChange?.(range);
    },
    [onRangeChange],
  );

  const navigateHandler = useCallback(
    (newDate: Date, newView: View, action: 'PREV' | 'NEXT' | 'TODAY' | 'DATE') => {
      onNavigate?.(newDate, newView, action);
    },
    [onNavigate],
  );

  const viewHandler = useCallback(
    (nextView: View) => {
      onViewChange?.(nextView);
    },
    [onViewChange],
  );

  const dropHandler = useCallback(
    (args: EventInteractionArgs<CalendarTimelineEvent>) => {
      if (onEventDrop) {
        onEventDrop(args);
      }
    },
    [onEventDrop],
  );

  const minTime = useMemo(() => {
    if (min) {
      return min;
    }
    const next = new Date();
    next.setHours(6, 0, 0, 0);
    return next;
  }, [min]);

  const maxTime = useMemo(() => {
    if (max) {
      return max;
    }
    const next = new Date();
    next.setHours(22, 0, 0, 0);
    return next;
  }, [max]);

  return (
    <div className="zen-calendar relative h-full">
      <DnDCalendar
        localizer={localizer}
        events={events}
        view={view}
        date={date}
        onRangeChange={rangeHandler}
        onNavigate={navigateHandler}
        onView={viewHandler}
        onEventDrop={dropHandler}
        draggableAccessor={(event) => Boolean(event.draggable)}
        resizableAccessor={() => false}
        components={{ event: EventContent }}
        views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
        showMultiDayTimes
        popup
        selectable={false}
        step={30}
        timeslots={2}
        min={minTime}
        max={maxTime}
        scrollToTime={scrollToTime}
        eventPropGetter={eventPropGetter}
        showNowIndicator={showNowIndicator}
        tooltipAccessor={(event) => event.description ?? event.title}
        longPressThreshold={320}
        culture="en"
      />

      {loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-sm">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-zen-200 border-t-zen-500" aria-label="Loading calendar" />
        </div>
      ) : null}

      <style jsx global>{`
        .zen-calendar .rbc-calendar {
          background-color: rgba(255, 255, 255, 0.9);
          border-radius: 24px;
          padding: 1.25rem;
          border: 1px solid rgba(113, 153, 182, 0.25);
        }

        .zen-calendar .rbc-toolbar {
          margin-bottom: 1rem;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .zen-calendar .rbc-toolbar span.rbc-btn-group {
          border-radius: 9999px;
          overflow: hidden;
          border: 1px solid rgba(113, 153, 182, 0.25);
          background: rgba(255, 255, 255, 0.85);
        }

        .zen-calendar .rbc-toolbar button {
          font-size: 0.8125rem;
          font-weight: 600;
          padding: 0.4rem 0.85rem;
          color: #1f2a37;
          background: transparent;
        }

        .zen-calendar .rbc-toolbar button.rbc-active,
        .zen-calendar .rbc-toolbar button:hover,
        .zen-calendar .rbc-toolbar button:focus {
          background: rgba(113, 153, 182, 0.15);
          color: #0f172a;
        }

        .zen-calendar .rbc-off-range-bg {
          background: rgba(236, 243, 247, 0.6);
        }

        .zen-calendar .rbc-today {
          background: rgba(113, 153, 182, 0.12);
        }

        .zen-calendar .rbc-time-slot,
        .zen-calendar .rbc-day-bg,
        .zen-calendar .rbc-time-view {
          border-color: rgba(113, 153, 182, 0.2);
        }

        .zen-calendar .rbc-month-row {
          border-color: rgba(113, 153, 182, 0.2);
        }

        .zen-calendar .rbc-agenda-table {
          border-color: rgba(113, 153, 182, 0.2);
        }

        .zen-calendar .rbc-agenda-date-cell,
        .zen-calendar .rbc-agenda-time-cell,
        .zen-calendar .rbc-agenda-event-cell {
          border-color: rgba(113, 153, 182, 0.12);
        }
      `}</style>
    </div>
  );
}

export default CalendarTimeline;
