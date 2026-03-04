'use client';

import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { X, Save } from 'lucide-react';
import type { Task, Category } from '@/types';
import {
  getNextReminderOccurrence,
  normalizeReminderRecurrence,
} from '@/utils/reminders';
import { extractErrorMessage } from '@/utils/extract-error-message';
import RichTextTextarea from './RichTextTextarea';
import {
  PRESET_COLORS,
  REMINDER_UNIT_MULTIPLIERS,
  isPresetReminderValue,
  decomposeMinutes,
  toLocalInputValue,
  parseDateTimeLocal,
  parseMonthdaysInput,
} from '@/utils/dateTimeLocal';
import type { ReminderUnit } from '@/utils/dateTimeLocal';
import { useReminderRecurrence } from '@/features/checklist/hooks/useReminderRecurrence';
import ReminderSchedulePanel from './form/ReminderSchedulePanel';
import CategoryCreationForm from './form/CategoryCreationForm';

interface TaskFormProps {
  task: Task | null;
  categories: Category[];
  onCreateCategory: (input: { name: string; color: string }) => Promise<Category>;
  onClose: () => void;
  onSave: (task: Partial<Task>) => Promise<{ error?: string } | void>;
  mode?: 'modal' | 'inline';
}

export default function TaskForm({
  task,
  categories,
  onCreateCategory,
  onClose,
  onSave,
  mode = 'modal',
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
  const initialReminderValue =
    task?.reminder_minutes_before != null && !Number.isNaN(task.reminder_minutes_before)
      ? String(task.reminder_minutes_before)
      : '';
  const [reminderMinutes, setReminderMinutes] = useState(initialReminderValue);
  const isInitialCustom = initialReminderValue !== '' && !isPresetReminderValue(initialReminderValue);
  const [useCustomReminder, setUseCustomReminder] = useState(isInitialCustom);
  const initialDecomposed = useMemo(() => {
    if (!isInitialCustom) return { amount: '', unit: 'minutes' as ReminderUnit };
    const mins = parseInt(initialReminderValue, 10);
    if (Number.isNaN(mins)) return { amount: '', unit: 'minutes' as ReminderUnit };
    const d = decomposeMinutes(mins);
    return { amount: String(d.amount), unit: d.unit };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [customReminderAmount, setCustomReminderAmount] = useState(initialDecomposed.amount);
  const [customReminderUnit, setCustomReminderUnit] = useState<ReminderUnit>(initialDecomposed.unit);
  const isMountedRef = useRef(true);
  const parsedDueDate = useMemo(() => parseDateTimeLocal(dueDate), [dueDate]);
  const dueDateISO = useMemo(() => (parsedDueDate ? parsedDueDate.toISOString() : null), [parsedDueDate]);
  const dueDateTimestamp = parsedDueDate ? parsedDueDate.getTime() : null;
  const reminderMinutesValue = useMemo(() => {
    if (useCustomReminder) {
      const amount = Number.parseInt(customReminderAmount, 10);
      if (Number.isNaN(amount) || amount < 1) return null;
      return amount * (REMINDER_UNIT_MULTIPLIERS[customReminderUnit as ReminderUnit] ?? 1);
    }
    if (!reminderMinutes) return null;
    const parsed = Number.parseInt(reminderMinutes, 10);
    return Number.isNaN(parsed) || parsed < 0 ? null : parsed;
  }, [useCustomReminder, customReminderAmount, customReminderUnit, reminderMinutes]);
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

  const {
    reminderFrequency,
    setReminderFrequency,
    reminderInterval,
    setReminderInterval,
    reminderWeekdays,
    reminderMonthdaysInput,
    setReminderMonthdaysInput,
    reminderSnoozedUntil,
    setReminderSnoozedUntil,
    reminderTimezone,
    snoozedUntilISO,
    recurrencePreview,
    upcomingReminders,
    recurrenceDescription,
    snoozedUntilDate,
    scheduleDisabled,
    toggleWeekday,
  } = useReminderRecurrence({
    task,
    parsedDueDate,
    dueDateISO,
    reminderMinutesValue,
    shouldUseStoredNext,
    initialNextTrigger,
    defaultTimezone,
  });

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
    if (!dueDate && (reminderMinutes || customReminderAmount)) {
      setReminderMinutes('');
      setCustomReminderAmount('');
    }
  }, [dueDate, reminderMinutes, customReminderAmount]);

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
      setCategoryError(extractErrorMessage(error, 'Unable to save category. Please try again.'));
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (isCreatingCategory || !category) return;

    if (isSubmitting) {
      return;
    }

    setFormError(null);

    if ((reminderMinutes || customReminderAmount) && !dueDate) {
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

  const containerPadding = mode === 'inline' ? 'p-6 sm:p-8' : 'p-6 sm:p-8';
  const formHeader = (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-2xl font-semibold text-zen-900">
        {task ? 'Edit Task' : 'New Task'}
      </h2>
      <button
        onClick={onClose}
        type="button"
        className="p-2 rounded-xl hover:bg-zen-100 transition-colors"
      >
        <X className="w-5 h-5 text-zen-600" />
      </button>
    </div>
  );

  const form = (
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
          maxLength={500}
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
              onChange={(e) => {
                const nextValue = e.target.value;
                setDueDate(nextValue);
                if (!nextValue) {
                  setReminderMinutes('');
                  setUseCustomReminder(false);
                }
              }}
              className="w-full px-4 py-3 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none transition-colors"
            />
            {dueDate && (
              <button
                type="button"
                onClick={() => {
                  setDueDate('');
                  setReminderMinutes('');
                  setUseCustomReminder(false);
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
            value={useCustomReminder ? 'custom' : reminderMinutes}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'custom') {
                setUseCustomReminder(true);
                setReminderMinutes('');
                return;
              }
              setUseCustomReminder(false);
              setCustomReminderAmount('');
              setCustomReminderUnit('minutes');
              setReminderMinutes(value);
            }}
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
            <option value="custom">Custom...</option>
          </select>
          {useCustomReminder && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={customReminderAmount}
                  onChange={(e) => setCustomReminderAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  disabled={!dueDate}
                  placeholder="Amount"
                  className="w-24 px-3 py-2 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <select
                  value={customReminderUnit}
                  onChange={(e) => setCustomReminderUnit(e.target.value as ReminderUnit)}
                  disabled={!dueDate}
                  className="flex-1 px-3 py-2 rounded-xl border-2 border-zen-200 focus:border-sage-500 focus:ring-0 outline-none text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="minutes">minutes before</option>
                  <option value="hours">hours before</option>
                  <option value="days">days before</option>
                  <option value="weeks">weeks before</option>
                </select>
              </div>
              <p className="text-xs text-zen-500">Enter a whole number, e.g. 30 minutes or 2 hours before the due date.</p>
            </div>
          )}
        </div>

        <ReminderSchedulePanel
          scheduleDisabled={scheduleDisabled}
          reminderFrequency={reminderFrequency}
          setReminderFrequency={setReminderFrequency}
          reminderInterval={reminderInterval}
          setReminderInterval={setReminderInterval}
          reminderWeekdays={reminderWeekdays}
          toggleWeekday={toggleWeekday}
          reminderMonthdaysInput={reminderMonthdaysInput}
          setReminderMonthdaysInput={setReminderMonthdaysInput}
          reminderSnoozedUntil={reminderSnoozedUntil}
          setReminderSnoozedUntil={setReminderSnoozedUntil}
          reminderTimezone={reminderTimezone}
          recurrenceDescription={recurrenceDescription}
          snoozedUntilDate={snoozedUntilDate}
          upcomingReminders={upcomingReminders}
        />
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
          <CategoryCreationForm
            newCategoryName={newCategoryName}
            setNewCategoryName={setNewCategoryName}
            newCategoryColor={newCategoryColor}
            setNewCategoryColor={setNewCategoryColor}
            isSavingCategory={isSavingCategory}
            categoryError={categoryError}
            handleCreateCategory={handleCreateCategory}
          />
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
  );

  const inner = (
    <div className={`${containerPadding} ${mode === 'modal' ? 'max-h-[90vh] overflow-y-auto' : ''}`}>
      {formHeader}
      {form}
    </div>
  );

  if (mode === 'inline') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="w-full"
      >
        <div className="bg-surface rounded-3xl border border-zen-200 shadow-soft overflow-hidden">
          {inner}
        </div>
      </motion.div>
    );
  }

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
        className="bg-surface rounded-3xl shadow-lift max-w-lg w-full border border-zen-200 overflow-hidden"
      >
        {inner}
      </motion.div>
    </motion.div>
  );
}
