export const PRESET_COLORS = [
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

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type ReminderUnit = 'minutes' | 'hours' | 'days' | 'weeks';

export const REMINDER_UNIT_MULTIPLIERS: Record<ReminderUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
};

const PRESET_REMINDER_MINUTES = ['5', '15', '30', '60', '120', '1440'] as const;

export function isPresetReminderValue(value: string): value is (typeof PRESET_REMINDER_MINUTES)[number] {
  return PRESET_REMINDER_MINUTES.includes(value as (typeof PRESET_REMINDER_MINUTES)[number]);
}

/** Decompose a raw-minutes value into the largest clean unit + amount. */
export function decomposeMinutes(minutes: number): { amount: number; unit: ReminderUnit } {
  if (minutes % 10080 === 0) return { amount: minutes / 10080, unit: 'weeks' };
  if (minutes % 1440 === 0) return { amount: minutes / 1440, unit: 'days' };
  if (minutes % 60 === 0) return { amount: minutes / 60, unit: 'hours' };
  return { amount: minutes, unit: 'minutes' };
}

export function toLocalInputValue(value?: string | null): string {
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

export function parseDateTimeLocal(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseMonthdaysInput(value: string): number[] {
  return value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 28);
}
