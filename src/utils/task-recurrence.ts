export function isSameLocalTaskDate(
  first: string | null | undefined,
  second: string | null | undefined,
): boolean {
  if (!first || !second) return false;
  const a = new Date(first);
  const b = new Date(second);
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function getMonthlyTaskAnchorDay(
  dueDate: string | null | undefined,
  storedAnchor?: number | null,
): number | null {
  if (typeof storedAnchor === 'number' && Number.isInteger(storedAnchor) && storedAnchor >= 1 && storedAnchor <= 31) {
    return storedAnchor;
  }
  if (!dueDate) return null;
  const date = new Date(dueDate);
  return Number.isNaN(date.getTime()) ? null : date.getDate();
}

export function getNextTaskDueDate(
  currentDueDate: string,
  recurrence: 'daily' | 'weekly' | 'monthly',
  interval: number,
  anchorDay?: number | null,
): string {
  const date = new Date(currentDueDate);
  if (Number.isNaN(date.getTime()) || !Number.isInteger(interval) || interval < 1) {
    throw new Error('Task recurrence requires a valid date and positive interval.');
  }

  if (recurrence === 'monthly') {
    const intendedDay = getMonthlyTaskAnchorDay(currentDueDate, anchorDay)!;
    // Move from day one so January 31 does not overflow into March.
    date.setDate(1);
    date.setMonth(date.getMonth() + interval);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(intendedDay, lastDay));
  } else {
    // Calendar arithmetic preserves local wall-clock time across DST changes.
    date.setDate(date.getDate() + interval * (recurrence === 'weekly' ? 7 : 1));
  }

  return date.toISOString();
}
