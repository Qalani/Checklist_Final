'use client';
import { WEEKDAY_LABELS } from '@/utils/dateTimeLocal';
import type { ReminderFrequency } from '@/types';
import { formatReminderDate } from '@/utils/reminders';

interface ReminderSchedulePanelProps {
  scheduleDisabled: boolean;
  reminderFrequency: ReminderFrequency;
  setReminderFrequency: (freq: ReminderFrequency) => void;
  reminderInterval: number;
  setReminderInterval: (interval: number) => void;
  reminderWeekdays: number[];
  toggleWeekday: (day: number) => void;
  reminderMonthdaysInput: string;
  setReminderMonthdaysInput: (value: string) => void;
  reminderSnoozedUntil: string;
  setReminderSnoozedUntil: (value: string) => void;
  reminderTimezone: string;
  recurrenceDescription: string;
  snoozedUntilDate: Date | null;
  upcomingReminders: Date[];
}

export default function ReminderSchedulePanel({
  scheduleDisabled,
  reminderFrequency,
  setReminderFrequency,
  reminderInterval,
  setReminderInterval,
  reminderWeekdays,
  toggleWeekday,
  reminderMonthdaysInput,
  setReminderMonthdaysInput,
  reminderSnoozedUntil,
  setReminderSnoozedUntil,
  reminderTimezone,
  recurrenceDescription,
  snoozedUntilDate,
  upcomingReminders,
}: ReminderSchedulePanelProps) {
  return (
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
          <p className="text-xs text-zen-500 mt-1">Separate days with commas (1–28). Days must be valid for all months.</p>
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
  );
}
