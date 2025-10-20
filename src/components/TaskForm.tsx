'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Save, PlusCircle } from 'lucide-react';
import type { Task, Category, ReminderFrequency } from '@/types';
import {
  describeReminderRecurrence,
  formatReminderDate,
  getNextReminderOccurrence,
  getUpcomingReminderOccurrences,
  normalizeReminderRecurrence,
} from '@/utils/reminders';
import RichTextTextarea from './RichTextTextarea';

interface TaskFormProps {
  task: Task | null;
  categories: Category[];
  onCreateCategory: (input: { name: string; color: string }) => Promise<Category>;
  onClose: () => void;
  onSave: (task: Partial<Task>) => Promise<{ error?: string } | void>;
}

const PRESET_COLORS = [
  '#5a7a5a',
  '#7a957a',
  '#a89478',
  '#8b7961',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#6b7280',
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toLocalInputValue(value?: string | null): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offsetMinutes * 60_000);
  return local.toISOString().slice(0, 16);
}

function parseDateTimeLocal(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseMonthdaysInput(value: string): number[] {
  return value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31);
}

function extractMessage(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

export default function TaskForm({
  task,
  categories,
  onCreateCategory,
  onClose,
  onSave,
}: TaskFormProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(task?.priority || 'medium');
  const [category, setCategory] = useState(task?.category || categories[0]?.name || '');
  const [categoryColor, setCategoryColor] = useState(task?.category_color || categories[0]?.color || '#5a7a5a');
  const [isCreatingCategory, setIsCreatingCategory] = useState(categories.length === 0);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(PRESET_COLORS[0]);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dueDate, setDueDate] = useState(() => toLocalInputValue(task?.due_date ?? null));
  const [reminderMinutes, setReminderMinutes] = useState(
    task?.reminder_minutes_before != null && !Number.isNaN(task.reminder_minutes_before)
      ? String(task.reminder_minutes_before)
      : '',
  );
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
  const defaultTimezone = useMemo(() => {
    if (typeof Intl === 'undefined') {
      return 'UTC';
    }
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      return 'UTC';
    }
  }, []);
  const [reminderTimezone] = useState<string>(task?.reminder_timezone ?? defaultTimezone);
  const isMountedRef = useRef(true);
  const parsedDueDate = useMemo(() => parseDateTimeLocal(dueDate), [dueDate]);
  const dueDateISO = useMemo(() => (parsedDueDate ? parsedDueDate.toISOString() : null), [parsedDueDate]);
  const dueDateTimestamp = parsedDueDate ? parsedDueDate.getTime() : null;
  const parsedSnoozedUntil = useMemo(() => parseDateTimeLocal(reminderSnoozedUntil), [reminderSnoozedUntil]);
  const snoozedUntilISO = useMemo(() => (parsedSnoozedUntil ? parsedSnoozedUntil.toISOString() : null), [parsedSnoozedUntil]);
  const reminderMinutesValue = useMemo(() => {
    if (!reminderMinutes) {
      return null;
    }
    const parsed = Number.parseInt(reminderMinutes, 10);
    return Number.isNaN(parsed) || parsed < 0 ? null : parsed;
  }, [reminderMinutes]);
  const originalDueTimestamp = useMemo(() => {
    if (!task?.due_date) {
      return null;
    }
    const parsed = new Date(task.due_date);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }, [task?.due_date]);
  const originalReminderMinutes = useMemo(() => {
    if (typeof task?.reminder_minutes_before === 'number') {
      return task.reminder_minutes_before;
    }
    return null;
  }, [task?.reminder_minutes_before]);
  const initialNextTrigger = task?.reminder_next_trigger_at ?? null;
  const shouldUseStoredNext = useMemo(() => {
    if (originalDueTimestamp == null || dueDateTimestamp == null) {
      return false;
    }
    if (originalReminderMinutes == null || reminderMinutesValue == null) {
      return false;
    }
    return originalDueTimestamp === dueDateTimestamp && originalReminderMinutes === reminderMinutesValue;
  }, [originalDueTimestamp, dueDateTimestamp, originalReminderMinutes, reminderMinutesValue]);
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
  const scheduleDisabled = !dueDate || !reminderMinutes;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const selectedCat = categories.find(c => c.name === category);
    if (selectedCat) {
      setCategoryColor(selectedCat.color);
    }
  }, [category, categories]);

  useEffect(() => {
    if (!task && !isCreatingCategory && !category && categories[0]) {
      setCategory(categories[0].name);
      setCategoryColor(categories[0].color);
    }
  }, [categories, category, isCreatingCategory, task]);

  useEffect(() => {
    if (!dueDate && reminderMinutes) {
      setReminderMinutes('');
    }
  }, [dueDate, reminderMinutes]);

  useEffect(() => {
    if (!reminderMinutes) {
      setReminderFrequency('once');
      setReminderSnoozedUntil('');
    }
  }, [reminderMinutes]);

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

  const toggleWeekday = (day: number) => {
    setReminderWeekdays((current) => {
      if (current.includes(day)) {
        return current.filter((value) => value !== day);
      }
      return [...current, day].sort((a, b) => a - b);
    });
  };

  const handleCategorySelection = (value: string) => {
    if (value === '__create__') {
      setIsCreatingCategory(true);
      setCategory('');
      setNewCategoryName('');
      setNewCategoryColor(PRESET_COLORS[0]);
      setCategoryError(null);
      return;
    }

    setIsCreatingCategory(false);
    setCategory(value);
    setCategoryError(null);
  };

  const handleCreateCategory = async () => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName || isSavingCategory) {
      return;
    }

    if (categories.some(existing => existing.name.toLowerCase() === trimmedName.toLowerCase())) {
      setCategoryError('You already have a category with that name.');
      return;
    }

    setIsSavingCategory(true);
    setCategoryError(null);

    try {
      const savedCategory = await onCreateCategory({
        name: trimmedName,
        color: newCategoryColor,
      });

      setCategory(savedCategory.name);
      setCategoryColor(savedCategory.color);
      setIsCreatingCategory(false);
      setNewCategoryName('');
      setNewCategoryColor(PRESET_COLORS[0]);
      setCategoryError(null);
    } catch (error) {
      console.error('Error creating category', error);
      setCategoryError(extractMessage(error, 'Unable to save category. Please try again.'));
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (isCreatingCategory || !category) return;

    if (isSubmitting) {
      return;
    }

    setFormError(null);

    if (reminderMinutes && !dueDate) {
      setFormError('Add a due date before setting a reminder.');
      return;
    }

    if (dueDate && !dueDateISO) {
      setFormError('Please select a valid due date.');
      return;
    }

    if (
      reminderMinutesValue != null &&
      dueDateISO &&
      reminderFrequency === 'weekly' &&
      reminderWeekdays.length === 0
    ) {
      setFormError('Select at least one weekday for recurring reminders.');
      return;
    }

    if (reminderMinutesValue != null && dueDateISO && reminderFrequency === 'monthly') {
      const parsed = parseMonthdaysInput(reminderMonthdaysInput);
      if (parsed.length === 0) {
        setFormError('Add at least one day of the month for recurring reminders.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const trimmedTitle = title.trim();
      const minutesBefore = reminderMinutesValue;
      const sanitizedInterval = Math.max(1, Math.floor(reminderInterval || 1));
      let recurrenceForSave = null as ReturnType<typeof normalizeReminderRecurrence>;
      if (minutesBefore != null && dueDateISO && reminderFrequency !== 'once') {
        const startAt = new Date(new Date(dueDateISO).getTime() - minutesBefore * 60_000);
        recurrenceForSave = normalizeReminderRecurrence({
          frequency: reminderFrequency,
          interval: sanitizedInterval,
          weekdays: reminderFrequency === 'weekly' ? reminderWeekdays : undefined,
          monthdays: reminderFrequency === 'monthly' ? parseMonthdaysInput(reminderMonthdaysInput) : undefined,
          start_at: startAt.toISOString(),
        });
      }

      const snoozeForSave = minutesBefore != null ? snoozedUntilISO : null;
      const timezoneForSave = minutesBefore != null ? reminderTimezone : null;
      const nextOccurrence =
        minutesBefore != null && dueDateISO
          ? getNextReminderOccurrence(
              {
                due_date: dueDateISO,
                reminder_minutes_before: minutesBefore,
                reminder_recurrence: recurrenceForSave,
                reminder_next_trigger_at: shouldUseStoredNext ? initialNextTrigger : null,
                reminder_snoozed_until: snoozeForSave,
                reminder_timezone: timezoneForSave,
              },
              { includeCurrent: true },
            )
          : null;

      const result = await onSave({
        title: trimmedTitle,
        description: description.trim(),
        priority,
        category,
        category_color: categoryColor,
        completed: task?.completed || false,
        due_date: dueDateISO,
        reminder_minutes_before: minutesBefore,
        reminder_recurrence: recurrenceForSave,
        reminder_next_trigger_at: nextOccurrence ? nextOccurrence.toISOString() : null,
        reminder_snoozed_until: snoozeForSave,
        reminder_timezone: timezoneForSave,
      });

      if (result && typeof result === 'object' && 'error' in result && result.error) {
        if (!isMountedRef.current) {
          return;
        }
        setFormError(result.error);
        return;
      }
    } catch (error) {
      console.error('Error saving task', error);
      if (!isMountedRef.current) {
        return;
      }
      setFormError('Unable to save task. Please try again.');
      return;
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-3xl shadow-lift max-w-lg w-full p-8 border border-zen-200"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-zen-900">
            {task ? 'Edit Task' : 'New Task'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-zen-100 transition-colors"
          >
            <X className="w-5 h-5 text-zen-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-zen-700 mb-2">
              Task Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-4 py-3 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zen-700 mb-2">
              Description (optional)
            </label>
            <RichTextTextarea
              value={description}
              onChange={setDescription}
              placeholder="Add details..."
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zen-700 mb-2">
              Priority
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-2 px-4 rounded-xl font-medium text-sm transition-all ${
                    priority === p
                      ? 'bg-sage-600 text-white shadow-medium'
                      : 'bg-zen-100 text-zen-700 hover:bg-zen-200'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zen-700 mb-2">
                Due date (optional)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none transition-colors"
                />
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setDueDate('');
                      setReminderMinutes('');
                    }}
                    className="px-3 py-2 rounded-xl bg-zen-100 text-sm font-medium text-zen-600 hover:bg-zen-200 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zen-700 mb-2">
                Reminder
              </label>
              <select
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(e.target.value)}
                disabled={!dueDate}
                className="w-full px-4 py-3 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">No reminder</option>
                <option value="5">5 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="120">2 hours before</option>
                <option value="1440">1 day before</option>
              </select>
            </div>

            <div className="rounded-2xl border border-zen-200 bg-zen-50/60 p-4 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-zen-700">Reminder schedule</p>
                  <p className="text-xs text-zen-500">
                    {scheduleDisabled ? 'Set a due date and reminder to enable recurrence.' : recurrenceDescription}
                  </p>
                </div>
                <select
                  value={reminderFrequency}
                  onChange={(e) => setReminderFrequency(e.target.value as ReminderFrequency)}
                  disabled={scheduleDisabled}
                  className="px-3 py-2 rounded-xl border-2 border-zen-200 text-sm font-medium focus:border-sage-500 focus:ring-0 outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="once">One-time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {reminderFrequency !== 'once' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-zen-600 mb-1">
                      Repeat every
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={reminderInterval}
                      disabled={scheduleDisabled}
                      onChange={(e) => {
                        const parsed = Number.parseInt(e.target.value, 10);
                        setReminderInterval(Number.isNaN(parsed) || parsed < 1 ? 1 : parsed);
                      }}
                      className="w-full px-3 py-2 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <p className="text-xs text-zen-500 mt-1">
                      {reminderFrequency === 'daily' && 'Days between reminders.'}
                      {reminderFrequency === 'weekly' && 'Weeks between reminder cycles.'}
                      {reminderFrequency === 'monthly' && 'Months between reminder cycles.'}
                    </p>
                  </div>
                  <div className="text-xs text-zen-500 flex items-end">
                    {!scheduleDisabled && recurrenceDescription !== 'One-time reminder' && (
                      <span>{recurrenceDescription}</span>
                    )}
                  </div>
                </div>
              )}

              {reminderFrequency === 'weekly' && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zen-600 mb-2">Days of week</p>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, index) => {
                      const active = reminderWeekdays.includes(index);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleWeekday(index)}
                          disabled={scheduleDisabled}
                          className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-sage-600 text-white border-sage-500'
                              : 'border-zen-200 text-zen-600 hover:bg-zen-100'
                          } ${scheduleDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {reminderFrequency === 'monthly' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zen-600 mb-1">
                    Days of month
                  </label>
                  <input
                    type="text"
                    value={reminderMonthdaysInput}
                    onChange={(e) => setReminderMonthdaysInput(e.target.value)}
                    disabled={scheduleDisabled}
                    placeholder="e.g. 1, 15, 30"
                    className="w-full px-3 py-2 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-zen-500 mt-1">Separate days with commas (1-31).</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zen-600 mb-1">
                  Snooze until (optional)
                </label>
                <input
                  type="datetime-local"
                  value={reminderSnoozedUntil}
                  onChange={(e) => setReminderSnoozedUntil(e.target.value)}
                  disabled={scheduleDisabled}
                  className="w-full px-3 py-2 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                />
                {snoozedUntilDate && !scheduleDisabled && (
                  <p className="text-xs text-zen-500 mt-1">
                    Snoozed until {formatReminderDate(snoozedUntilDate, reminderTimezone)}
                  </p>
                )}
              </div>

              <p className="text-xs text-zen-500">
                Reminders use the {reminderTimezone} timezone.
              </p>

              {!scheduleDisabled && (
                <div className="rounded-xl border border-zen-200 bg-white/80 p-3">
                  <p className="text-xs font-semibold text-zen-700">Upcoming reminders</p>
                  {upcomingReminders.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-zen-600">
                      {upcomingReminders.map((occurrence, index) => (
                        <li key={`${occurrence.toISOString()}-${index}`}>
                          {index === 0 ? 'Next' : `Then ${index + 1}`}: {formatReminderDate(occurrence, reminderTimezone)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-zen-500 mt-1">No upcoming reminders scheduled.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zen-700 mb-2">
                Category
              </label>
              <select
                value={isCreatingCategory ? '__create__' : category}
                onChange={(e) => handleCategorySelection(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none transition-colors"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
                <option value="__create__">+ Create new category</option>
              </select>
            </div>

            {isCreatingCategory && (
              <div className="rounded-2xl border border-dashed border-sage-300 bg-sage-50/50 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-sage-700 mb-1">
                      New category name
                    </label>
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Wellness"
                      className="w-full px-3 py-2 rounded-xl border-2 border-sage-200 focus:border-sage-500 focus:ring-0 outline-none text-sm"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sage-700 mb-2">
                    Color
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCategoryColor(color)}
                        className={`w-8 h-8 rounded-xl transition-all ${
                          newCategoryColor === color ? 'ring-2 ring-offset-2 ring-sage-600' : ''
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={isSavingCategory}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sage-600 text-white text-sm font-medium hover:bg-sage-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <PlusCircle className="w-4 h-4" />
                  {isSavingCategory ? 'Creating...' : 'Create Category'}
                </button>
                {categoryError && (
                  <p className="text-sm text-red-600 text-center">{categoryError}</p>
                )}
              </div>
            )}
          </div>

          {formError && (
            <p className="text-sm text-red-600 text-center">{formError}</p>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl font-medium text-zen-700 bg-zen-100 hover:bg-zen-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-sage-600 hover:bg-sage-700 shadow-medium hover:shadow-lift transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save Task'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
