import { getMonthlyTaskAnchorDay, getNextTaskDueDate, isSameLocalTaskDate } from '@/utils/task-recurrence';

function localDate(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 9, 30).toISOString();
}

describe('monthly task recurrence', () => {
  it('clamps January 31 to February and restores March 31 with the stored anchor', () => {
    const january = localDate(2026, 1, 31);
    const anchor = getMonthlyTaskAnchorDay(january);
    const february = getNextTaskDueDate(january, 'monthly', 1, anchor);
    const march = getNextTaskDueDate(february, 'monthly', 1, anchor);
    expect(new Date(february).getMonth()).toBe(1);
    expect(new Date(february).getDate()).toBe(28);
    expect(new Date(march).getMonth()).toBe(2);
    expect(new Date(march).getDate()).toBe(31);
    expect(new Date(march).getHours()).toBe(9);
    expect(new Date(march).getMinutes()).toBe(30);
  });

  it('handles leap years and multi-month intervals without overflow', () => {
    const february = getNextTaskDueDate(localDate(2028, 1, 31), 'monthly', 1, 31);
    expect(new Date(february).getDate()).toBe(29);
    const april = getNextTaskDueDate(february, 'monthly', 2, 31);
    expect(new Date(april).getMonth()).toBe(3);
    expect(new Date(april).getDate()).toBe(30);
    const june = getNextTaskDueDate(april, 'monthly', 2, 31);
    expect(new Date(june).getDate()).toBe(30);
  });

  it('initializes legacy tasks from their current day without guessing a lost anchor', () => {
    const february = localDate(2026, 2, 28);
    expect(getMonthlyTaskAnchorDay(february)).toBe(28);
    expect(getMonthlyTaskAnchorDay(february, 31)).toBe(31);
    expect(getMonthlyTaskAnchorDay(february, 32)).toBe(28);
    expect(getMonthlyTaskAnchorDay(null)).toBeNull();
  });

  it('distinguishes a due-day edit from a time-only edit when preserving an anchor', () => {
    const due = localDate(2026, 2, 28);
    const timeEdit = new Date(2026, 1, 28, 16, 45).toISOString();
    expect(isSameLocalTaskDate(due, timeEdit)).toBe(true);
    expect(isSameLocalTaskDate(due, localDate(2026, 2, 27))).toBe(false);
    expect(isSameLocalTaskDate(due, null)).toBe(false);
  });

  it('keeps daily and weekly recurrence as local calendar arithmetic', () => {
    const date = localDate(2026, 3, 28);
    expect(new Date(getNextTaskDueDate(date, 'daily', 1)).getDate()).toBe(29);
    expect(new Date(getNextTaskDueDate(date, 'weekly', 1)).getDate()).toBe(4);
    expect(new Date(getNextTaskDueDate(date, 'weekly', 1)).getHours()).toBe(9);
  });
});
