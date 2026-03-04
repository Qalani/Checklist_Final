'use client';
import { useState, useEffect, useMemo } from 'react';
import type { Task, ReminderFrequency } from '@/types';
import { normalizeReminderRecurrence, describeReminderRecurrence, formatReminderDate, getUpcomingReminderOccurrences } from '@/utils/reminders';
import { parseDateTimeLocal, parseMonthdaysInput, toLocalInputValue } from '@/utils/dateTimeLocal';

interface UseReminderRecurrenceOptions {
  task: Task | null;
  parsedDueDate: Date | null;
  dueDateISO: string | null;
  reminderMinutesValue: number | null;
  shouldUseStoredNext: boolean;
  initialNextTrigger: string | null;
  defaultTimezone: string;
}

export function useReminderRecurrence({
  task,
  parsedDueDate,
  dueDateISO,
  reminderMinutesValue,
  shouldUseStoredNext,
  initialNextTrigger,
  defaultTimezone,
}: UseReminderRecurrenceOptions) {
  const existingRecurrence = task?.reminder_recurrence ?? null;
  const [reminderFrequency, setReminderFrequency] = useState<ReminderFrequency>(existingRecurrence?.frequency ?? 'once');
  const [reminderInterval, setReminderInterval] = useState<number>(existingRecurrence?.interval ?? 1);
  const [reminderWeekdays, setReminderWeekdays] = useState<number[]>(existingRecurrence?.weekdays ?? []);
  const [reminderMonthdaysInput, setReminderMonthdaysInput] = useState(
    existingRecurrence?.monthdays && existingRecurrence.monthdays.length > 0
      ? existingRecurrence.monthdays.join(', ')
      : '',
  );
  const [reminderSnoozedUntil, setReminderSnoozedUntil] = useState(() => toLocalInputValue(task?.reminder_snoozed_until ?? null));
  const [reminderTimezone] = useState<string>(task?.reminder_timezone ?? defaultTimezone);

  useEffect(() => {
    if (reminderMinutesValue == null) {
      setReminderFrequency('once');
      setReminderSnoozedUntil('');
    }
  }, [reminderMinutesValue]);

  useEffect(() => {
    if (reminderFrequency === 'weekly' && reminderWeekdays.length === 0) {
      const fallback = parsedDueDate ? parsedDueDate.getDay() : 1;
      setReminderWeekdays([fallback]);
    }
  }, [parsedDueDate, reminderFrequency, reminderWeekdays.length]);

  useEffect(() => {
    if (
      reminderFrequency === 'monthly' &&
      reminderMonthdaysInput.trim().length === 0 &&
      parsedDueDate
    ) {
      setReminderMonthdaysInput(String(parsedDueDate.getDate()));
    }
  }, [parsedDueDate, reminderFrequency, reminderMonthdaysInput]);

  const parsedSnoozedUntil = useMemo(() => parseDateTimeLocal(reminderSnoozedUntil), [reminderSnoozedUntil]);
  const snoozedUntilISO = useMemo(() => (parsedSnoozedUntil ? parsedSnoozedUntil.toISOString() : null), [parsedSnoozedUntil]);

  const recurrencePreview = useMemo(() => {
    if (!dueDateISO || reminderMinutesValue == null) {
      return null;
    }
    if (reminderFrequency === 'once') {
      return null;
    }
    const baseStart = new Date(new Date(dueDateISO).getTime() - reminderMinutesValue * 60_000);
    return normalizeReminderRecurrence({
      frequency: reminderFrequency,
      interval: reminderInterval,
      weekdays: reminderFrequency === 'weekly' ? reminderWeekdays : undefined,
      monthdays: reminderFrequency === 'monthly' ? parseMonthdaysInput(reminderMonthdaysInput) : undefined,
      start_at: baseStart.toISOString(),
    });
  }, [dueDateISO, reminderFrequency, reminderInterval, reminderMinutesValue, reminderMonthdaysInput, reminderWeekdays]);

  const upcomingReminders = useMemo(() => {
    if (!dueDateISO || reminderMinutesValue == null) {
      if (shouldUseStoredNext && initialNextTrigger) {
        const parsed = new Date(initialNextTrigger);
        return Number.isNaN(parsed.getTime()) ? [] : [parsed];
      }
      return [];
    }
    const config = {
      due_date: dueDateISO,
      reminder_minutes_before: reminderMinutesValue,
      reminder_recurrence: recurrencePreview,
      reminder_next_trigger_at: shouldUseStoredNext ? initialNextTrigger : null,
      reminder_snoozed_until: snoozedUntilISO,
      reminder_timezone: reminderTimezone,
    };
    return getUpcomingReminderOccurrences(config, { limit: 3 });
  }, [
    dueDateISO,
    reminderMinutesValue,
    recurrencePreview,
    shouldUseStoredNext,
    initialNextTrigger,
    snoozedUntilISO,
    reminderTimezone,
  ]);

  const recurrenceDescription = useMemo(() => {
    if (!dueDateISO || reminderMinutesValue == null || reminderFrequency === 'once') {
      return 'One-time reminder';
    }
    return describeReminderRecurrence(recurrencePreview) ?? 'Repeats';
  }, [dueDateISO, reminderMinutesValue, reminderFrequency, recurrencePreview]);

  const snoozedUntilDate = useMemo(() => (snoozedUntilISO ? new Date(snoozedUntilISO) : null), [snoozedUntilISO]);

  const scheduleDisabled = !dueDateISO || reminderMinutesValue == null;

  const toggleWeekday = (day: number) => {
    setReminderWeekdays((current) => {
      if (current.includes(day)) {
        return current.filter((value) => value !== day);
      }
      return [...current, day].sort((a, b) => a - b);
    });
  };

  return {
    reminderFrequency,
    setReminderFrequency,
    reminderInterval,
    setReminderInterval,
    reminderWeekdays,
    setReminderWeekdays,
    reminderMonthdaysInput,
    setReminderMonthdaysInput,
    reminderSnoozedUntil,
    setReminderSnoozedUntil,
    reminderTimezone,
    parsedSnoozedUntil,
    snoozedUntilISO,
    recurrencePreview,
    upcomingReminders,
    recurrenceDescription,
    snoozedUntilDate,
    scheduleDisabled,
    toggleWeekday,
  };
}
