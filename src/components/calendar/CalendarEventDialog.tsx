'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { format, isSameDay, subDays } from 'date-fns';
import {
  CalendarDays,
  Clock3,
  ExternalLink,
  MapPin,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import type { CalendarEventRecord } from '@/features/calendar/types';
import type { CreateCalendarEventInput } from '@/features/calendar/useCalendarEvents';

export const EVENT_LABELS = {
  event: 'Event',
  task_due: 'Task due',
  task_reminder: 'Task reminder',
  note: 'Note updated',
  zen_reminder: 'Reminder',
};

export type CalendarSelection = { start: Date; end: Date; allDay: boolean };

export function calendarEventDate(
  event: CalendarEventRecord,
  boundary: 'start' | 'end' = 'start'
): Date {
  // Custom all-day events store calendar dates at UTC midnight. Interpret
  // those date parts locally for presentation so travel never shifts a day.
  return event.type === 'event' && event.allDay
    ? new Date(`${event[boundary].slice(0, 10)}T00:00:00`)
    : new Date(event[boundary]);
}

export function formatEventTime(event: CalendarEventRecord): string {
  const start = calendarEventDate(event);
  const end = calendarEventDate(event, 'end');
  if (event.allDay) {
    const lastDay = subDays(end, 1);
    return isSameDay(start, lastDay)
      ? `${format(start, 'EEE, d MMM yyyy')} · All day`
      : `${format(start, 'd MMM')} – ${format(lastDay, 'd MMM yyyy')} · All day`;
  }
  return isSameDay(start, end)
    ? `${format(start, 'EEE, d MMM')} · ${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`
    : `${format(start, 'd MMM, HH:mm')} – ${format(end, 'd MMM, HH:mm')}`;
}

const secondaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zen-200 bg-surface px-4 py-2 text-sm font-medium text-zen-700 transition-colors hover:bg-zen-50 disabled:opacity-50';
const primaryButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sage-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sage-700 disabled:opacity-50';
const inputClass =
  'mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-zen-200 bg-surface px-3 py-2.5 text-base text-zen-900 focus:border-sage-500 focus:outline-none focus:ring-2 focus:ring-sage-500/20';

function DialogShell({
  title,
  children,
  onClose,
  busy = false,
  initialFocus = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  initialFocus?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const node = dialogRef.current;
    const focusTarget = initialFocus
      ? node?.querySelector<HTMLElement>('input')
      : node?.querySelector<HTMLElement>('button');
    focusTarget?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button, a[href], input, textarea, select, [tabindex="0"]'
        ) ?? []
      ).filter(
        (element) =>
          !element.matches(':disabled') && !element.closest('fieldset:disabled')
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        node?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !node?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !node?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [initialFocus]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-zen-900/30 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        tabIndex={-1}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-3xl border border-zen-200 bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lift sm:rounded-3xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2
            id={titleId}
            className="min-w-0 break-words pt-1.5 text-xl font-semibold text-zen-900"
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zen-600 hover:bg-zen-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function defaultSelection(): CalendarSelection {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);
  return {
    start,
    end: new Date(start.getTime() + 60 * 60 * 1000),
    allDay: false,
  };
}

export function CalendarEventForm({
  initial = defaultSelection(),
  event,
  onClose,
  onSave,
}: {
  initial?: CalendarSelection;
  event?: CalendarEventRecord;
  onClose: () => void;
  onSave: (input: CreateCalendarEventInput) => Promise<void>;
}) {
  const start = event ? calendarEventDate(event) : initial.start;
  const end = event ? calendarEventDate(event, 'end') : initial.end;
  const isAllDay = event?.allDay ?? initial.allDay;
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [location, setLocation] = useState(
    String(
      event?.metadata && 'location' in event.metadata
        ? (event.metadata.location ?? '')
        : ''
    )
  );
  const [allDay, setAllDay] = useState(isAllDay);
  const [startDate, setStartDate] = useState(format(start, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(
    format(isAllDay ? subDays(end, 1) : end, 'yyyy-MM-dd')
  );
  const [startTime, setStartTime] = useState(
    isAllDay ? '09:00' : format(start, 'HH:mm')
  );
  const [endTime, setEndTime] = useState(
    isAllDay ? '10:00' : format(end, 'HH:mm')
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const submit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (saving) return;
    setError(null);
    const from = new Date(
      `${startDate}T${allDay ? '00:00:00.000Z' : startTime}`
    );
    const through = new Date(
      `${endDate}T${allDay ? '00:00:00.000Z' : endTime}`
    );
    const until = new Date(through);
    if (allDay) until.setUTCDate(until.getUTCDate() + 1);
    if (!title.trim()) {
      setError('Give your event a title.');
      return;
    }
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime())) {
      setError('Choose a valid start and end date.');
      return;
    }
    if (
      !allDay &&
      (format(from, 'HH:mm') !== startTime ||
        format(through, 'HH:mm') !== endTime)
    ) {
      setError('That time is skipped by a clock change. Choose another time.');
      return;
    }
    if (until <= from) {
      setError(
        allDay
          ? 'End date must be on or after the start date.'
          : 'End time must be after the start time.'
      );
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        start: from.toISOString(),
        end: until.toISOString(),
        allDay,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to save this event. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell
      title={event ? 'Edit event' : 'New event'}
      onClose={onClose}
      busy={saving}
      initialFocus
    >
      <form onSubmit={submit} aria-describedby={error ? errorId : undefined}>
        <fieldset disabled={saving} className="space-y-4">
          <label className="block text-sm font-medium text-zen-700">
            Title
            <input
              autoComplete="off"
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder="What are you planning?"
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-zen-700">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-5 w-5 accent-sage-600"
            />
            All day
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0 text-sm font-medium text-zen-700">
              Start date
              <input
                type="date"
                required
                className={inputClass}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
              />
            </label>
            <label className="min-w-0 text-sm font-medium text-zen-700">
              End date
              <input
                type="date"
                required
                className={inputClass}
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            {!allDay && (
              <>
                <label className="min-w-0 text-sm font-medium text-zen-700">
                  Start time
                  <input
                    type="time"
                    required
                    className={inputClass}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </label>
                <label className="min-w-0 text-sm font-medium text-zen-700">
                  End time
                  <input
                    type="time"
                    required
                    className={inputClass}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
          <p className="text-xs leading-relaxed text-zen-500">
            {allDay
              ? 'Includes both the start and end dates.'
              : `Times use your device’s timezone (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`}
          </p>
          <label className="block text-sm font-medium text-zen-700">
            Location{' '}
            <span className="font-normal text-zen-500">(optional)</span>
            <input
              className={inputClass}
              value={location}
              maxLength={500}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add a place or meeting link"
            />
          </label>
          <label className="block text-sm font-medium text-zen-700">
            Description{' '}
            <span className="font-normal text-zen-500">(optional)</span>
            <textarea
              className={`${inputClass} resize-y`}
              rows={3}
              value={description}
              maxLength={5000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Anything you’d like to remember"
            />
          </label>
        </fieldset>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className={secondaryButton}
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={saving}>
            {saving ? 'Saving…' : event ? 'Save changes' : 'Create event'}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

export function CalendarEventDetails({
  event,
  onClose,
  onEdit,
  onDelete,
  onOpenSource,
}: {
  event: CalendarEventRecord;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => Promise<void>;
  onOpenSource?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location =
    event.metadata && 'location' in event.metadata
      ? event.metadata.location
      : null;
  const remove = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to delete this event.'
      );
    } finally {
      setDeleting(false);
    }
  };
  return (
    <DialogShell title={event.title} onClose={onClose} busy={deleting}>
      <p className="mb-5 text-sm text-zen-500">
        {EVENT_LABELS[event.type]} ·{' '}
        {event.scope === 'shared' ? 'Shared' : 'Personal'}
      </p>
      <div className="space-y-4 text-sm text-zen-700">
        <p className="flex items-start gap-3">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-sage-600" />
          <span>{formatEventTime(event)}</span>
        </p>
        {typeof location === 'string' && location && (
          <p className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-zen-500" />
            <span className="min-w-0 break-words">{location}</span>
          </p>
        )}
        {event.description && (
          <p className="whitespace-pre-wrap break-words border-t border-zen-100 pt-4 leading-relaxed">
            {event.description}
          </p>
        )}
        {event.type === 'note' && (
          <p className="text-zen-500">
            This marks when your note was last updated.
          </p>
        )}
        {event.type === 'event' && !onEdit && (
          <p className="text-zen-500">
            You have view-only access to this event.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {confirmDelete ? (
        <div className="mt-6 rounded-xl border border-red-400/40 bg-red-500/5 p-4">
          <p className="text-sm font-medium text-zen-900">Delete this event?</p>
          <p className="mt-1 text-sm text-zen-600">
            This removes it from your calendar.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
              className={secondaryButton}
            >
              Keep event
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={remove}
              className="min-h-11 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete event'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          {onEdit && (
            <button type="button" onClick={onEdit} className={primaryButton}>
              <Pencil className="h-4 w-4" />
              Edit event
            </button>
          )}
          {onOpenSource && (
            <button
              type="button"
              onClick={onOpenSource}
              className={primaryButton}
            >
              <ExternalLink className="h-4 w-4" />
              Open{' '}
              {event.type === 'note'
                ? 'notes'
                : event.type === 'zen_reminder'
                  ? 'reminders'
                  : 'tasks'}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className={secondaryButton}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          )}
          {!onEdit && !onOpenSource && (
            <button type="button" onClick={onClose} className={secondaryButton}>
              <CalendarDays className="h-4 w-4" />
              Back to calendar
            </button>
          )}
        </div>
      )}
    </DialogShell>
  );
}
