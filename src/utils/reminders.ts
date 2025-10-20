import type { ReminderRecurrence, ReminderFrequency, Task } from '@/types';

const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_DAY = 86_400_000;

export interface ReminderScheduleLike {
  due_date?: string | null;
  reminder_minutes_before?: number | null;
  reminder_recurrence?: ReminderRecurrence | null;
  reminder_next_trigger_at?: string | null;
  reminder_last_trigger_at?: string | null;
  reminder_snoozed_until?: string | null;
  reminder_timezone?: string | null;
}

type ReminderLike = ReminderScheduleLike | Task;

function parseDateLike(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function uniqueSortedNumbers(values: number[], min: number, max: number): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value >= min && value <= max))).sort(
    (a, b) => a - b,
  );
}

function daysInMonth(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0).getDate();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MILLISECONDS_PER_DAY);
}

function addMonthsPreserveTime(date: Date, months: number, day: number): Date {
  const next = new Date(date.getTime());
  const hours = next.getHours();
  const minutes = next.getMinutes();
  const seconds = next.getSeconds();
  const ms = next.getMilliseconds();

  next.setHours(0, 0, 0, 0);
  next.setMonth(next.getMonth() + months, 1);

  const limit = daysInMonth(next);
  const targetDay = Math.max(1, Math.min(day, limit));
  next.setDate(targetDay);
  next.setHours(hours, minutes, seconds, ms);

  return next;
}

export function normalizeReminderRecurrence(
  recurrence?: ReminderRecurrence | null,
): ReminderRecurrence | null {
  if (!recurrence) {
    return null;
  }

  const frequency = recurrence.frequency ?? 'once';
  if (!['once', 'daily', 'weekly', 'monthly'].includes(frequency)) {
    return null;
  }

  const interval = recurrence.interval && Number.isFinite(recurrence.interval)
    ? Math.max(1, Math.floor(recurrence.interval))
    : 1;

  const sanitized: ReminderRecurrence = { frequency: frequency as ReminderFrequency, interval };

  if (recurrence.start_at) {
    const parsedStart = parseDateLike(recurrence.start_at);
    if (parsedStart) {
      sanitized.start_at = parsedStart.toISOString();
    }
  }

  if (recurrence.end_at) {
    const parsedEnd = parseDateLike(recurrence.end_at);
    if (parsedEnd) {
      sanitized.end_at = parsedEnd.toISOString();
    }
  }

  if (frequency === 'weekly') {
    const weekdays = Array.isArray(recurrence.weekdays) ? recurrence.weekdays : [];
    sanitized.weekdays = uniqueSortedNumbers(weekdays, 0, 6);
  } else if (frequency === 'monthly') {
    const monthdays = Array.isArray(recurrence.monthdays) ? recurrence.monthdays : [];
    sanitized.monthdays = uniqueSortedNumbers(monthdays, 1, 31);
  }

  return sanitized;
}

function advanceOccurrence(current: Date, recurrence: ReminderRecurrence | null): Date | null {
  if (!recurrence || recurrence.frequency === 'once') {
    return null;
  }

  const interval = Math.max(1, recurrence.interval ?? 1);

  switch (recurrence.frequency) {
    case 'daily':
      return addDays(current, interval);
    case 'weekly': {
      const weekdays = recurrence.weekdays && recurrence.weekdays.length > 0 ? recurrence.weekdays : [current.getDay()];
      const sorted = uniqueSortedNumbers(weekdays, 0, 6);
      const currentDay = current.getDay();

      for (const day of sorted) {
        if (day > currentDay) {
          return addDays(current, day - currentDay);
        }
      }

      const firstDay = sorted[0];
      const daysToAdd = (7 - currentDay + firstDay) + 7 * (interval - 1);
      return addDays(current, daysToAdd);
    }
    case 'monthly': {
      const monthdays = recurrence.monthdays && recurrence.monthdays.length > 0 ? recurrence.monthdays : [current.getDate()];
      const sorted = uniqueSortedNumbers(monthdays, 1, 31);
      const currentDay = current.getDate();

      for (const day of sorted) {
        if (day > currentDay) {
          const candidate = new Date(current.getTime());
          candidate.setDate(day);
          return candidate;
        }
      }

      const monthsToAdd = interval;
      const nextMonth = addMonthsPreserveTime(current, monthsToAdd, sorted[0]);
      return nextMonth;
    }
    default:
      return null;
  }
}

export function getReminderAnchor(config: ReminderLike): Date | null {
  const recurrence = normalizeReminderRecurrence(config.reminder_recurrence ?? null);
  const recurrenceStart = recurrence?.start_at ? parseDateLike(recurrence.start_at) : null;
  if (recurrenceStart) {
    return recurrenceStart;
  }

  const storedNext = parseDateLike(config.reminder_next_trigger_at ?? null);
  if (storedNext) {
    return storedNext;
  }

  if (typeof config.reminder_minutes_before === 'number' && config.due_date) {
    const due = parseDateLike(config.due_date);
    if (due) {
      return new Date(due.getTime() - config.reminder_minutes_before * MILLISECONDS_PER_MINUTE);
    }
  }

  return null;
}

export interface NextReminderOptions {
  from?: Date;
  includeCurrent?: boolean;
}

export function getNextReminderOccurrence(
  config: ReminderLike,
  options: NextReminderOptions = {},
): Date | null {
  const recurrence = normalizeReminderRecurrence(config.reminder_recurrence ?? null);
  const anchor = getReminderAnchor(config);
  if (!anchor) {
    return null;
  }

  const reference = options.from ?? new Date();
  const snoozedUntil = parseDateLike(config.reminder_snoozed_until ?? null);
  const effectiveReferenceTime = Math.max(reference.getTime(), snoozedUntil?.getTime() ?? reference.getTime());
  const allowEqual = Boolean(options.includeCurrent);
  const endAtTime = recurrence?.end_at ? parseDateLike(recurrence.end_at)?.getTime() ?? null : null;

  let next = anchor;
  let nextTime = next.getTime();
  if (allowEqual && nextTime === effectiveReferenceTime) {
    return next;
  }

  const maxIterations = 512;
  let iterations = 0;

  while (nextTime <= effectiveReferenceTime) {
    iterations += 1;
    if (iterations > maxIterations) {
      return null;
    }

    const advanced = advanceOccurrence(next, recurrence);
    if (!advanced) {
      return allowEqual && nextTime === effectiveReferenceTime ? next : null;
    }

    next = advanced;
    nextTime = next.getTime();

    if (endAtTime && nextTime > endAtTime) {
      return null;
    }
  }

  return nextTime >= effectiveReferenceTime ? next : null;
}

export interface UpcomingRemindersOptions {
  from?: Date;
  limit?: number;
}

export function getUpcomingReminderOccurrences(
  config: ReminderLike,
  options: UpcomingRemindersOptions = {},
): Date[] {
  const limit = Math.max(1, options.limit ?? 3);
  const occurrences: Date[] = [];
  let reference = options.from ?? new Date();

  for (let i = 0; i < limit; i += 1) {
    const includeCurrent = i === 0;
    const next = getNextReminderOccurrence(config, { from: reference, includeCurrent });
    if (!next) {
      break;
    }

    occurrences.push(next);
    reference = new Date(next.getTime() + 1);
  }

  return occurrences;
}

export function describeReminderRecurrence(recurrence: ReminderRecurrence | null | undefined): string | null {
  const normalized = normalizeReminderRecurrence(recurrence ?? null);
  if (!normalized || normalized.frequency === 'once') {
    return null;
  }

  const interval = normalized.interval ?? 1;
  const frequencyLabel = normalized.frequency.charAt(0).toUpperCase() + normalized.frequency.slice(1);

  if (normalized.frequency === 'daily') {
    return interval === 1 ? 'Daily' : `Every ${interval} days`;
  }

  if (normalized.frequency === 'weekly') {
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = (normalized.weekdays && normalized.weekdays.length > 0
      ? normalized.weekdays
      : undefined) ?? [];
    const dayLabel = days.length > 0 ? days.map((day) => weekdayNames[day]).join(', ') : 'week';
    if (interval === 1) {
      return `Weekly${days.length > 0 ? ` on ${dayLabel}` : ''}`;
    }
    return `Every ${interval} weeks${days.length > 0 ? ` on ${dayLabel}` : ''}`;
  }

  if (normalized.frequency === 'monthly') {
    const days = (normalized.monthdays && normalized.monthdays.length > 0
      ? normalized.monthdays
      : undefined) ?? [];
    const dayLabel = days.length > 0 ? days.join(', ') : 'month';
    if (interval === 1) {
      return `Monthly${days.length > 0 ? ` on day ${dayLabel}` : ''}`;
    }
    return `Every ${interval} months${days.length > 0 ? ` on day ${dayLabel}` : ''}`;
  }

  return frequencyLabel;
}

export function formatReminderDate(date: Date, timezone?: string | null): string {
  if (!timezone) {
    return date.toLocaleString();
  }

  try {
    return date.toLocaleString(undefined, { timeZone: timezone });
  } catch (error) {
    return date.toLocaleString();
  }
}

export function shouldScheduleReminder(task: ReminderLike): boolean {
  return Boolean(
    task &&
      !(task as Partial<Task>).completed &&
      (task.reminder_minutes_before != null || task.reminder_recurrence || task.reminder_next_trigger_at),
  );
}
