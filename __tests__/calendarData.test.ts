import { buildCalendarPayload } from '@/features/calendar/useCalendarData';
import type { CalendarEvent, Note, Task, ZenReminder } from '@/types';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/local-db', () => ({ db: {} }));

const start = '2026-10-01T00:00:00.000Z';
const end = '2026-11-01T00:00:00.000Z';

function event(id: string, start_time: string, end_time: string): CalendarEvent {
  return { id, user_id: 'me', title: id, start_time, end_time, all_day: false };
}

describe('calendar range and scope', () => {
  it('includes spanning events and excludes events outside the exclusive range', () => {
    const result = buildCalendarPayload('me', start, end, 'all', [], [], [], [], [
      event('spanning', '2026-09-30T09:00:00Z', '2026-10-02T09:00:00Z'),
      event('inside', '2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z'),
      event('ends-at-start', '2026-09-30T09:00:00Z', start),
      event('starts-at-end', end, '2026-11-01T01:00:00Z'),
      event('later', '2027-01-01T00:00:00Z', '2027-01-02T00:00:00Z'),
    ]);
    expect(result.events.map((entry) => entry.entityId)).toEqual(['spanning', 'inside']);
  });

  it('keeps personal notes and reminders out of the shared calendar', () => {
    const task = {
      id: 'shared-task', user_id: 'friend', title: 'Shared deadline',
      due_date: '2026-10-05T09:00:00Z', completed: false,
    } as Task;
    const note = { id: 'note', title: 'Private note', updated_at: '2026-10-05T09:00:00Z' } as Note;
    const reminder = { id: 'reminder', title: 'Private reminder', remind_at: '2026-10-05T09:00:00Z' } as ZenReminder;
    const result = buildCalendarPayload('me', start, end, 'shared', [], [{ role: 'viewer', task }], [note], [reminder], [
      event('private-event', '2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z'),
    ]);
    expect(result.events.map((entry) => entry.entityId)).toEqual(['shared-task']);
    expect(result.events[0].metadata).toMatchObject({ accessRole: 'viewer', canEdit: false });
  });

  it('includes all daily reminder occurrences in a month', () => {
    const task = {
      id: 'daily', user_id: 'me', title: 'Daily practice', completed: false,
      reminder_recurrence: { frequency: 'daily', interval: 1, start_at: start },
    } as Task;
    const result = buildCalendarPayload('me', start, end, 'all', [task], [], [], [], []);
    expect(result.events).toHaveLength(31);
    expect(result.events[30].start).toBe('2026-10-31T00:00:00.000Z');
  });

  it('does not duplicate a deadline at the next period boundary', () => {
    const task = { id: 'deadline', user_id: 'me', title: 'Next month', due_date: end } as Task;
    const result = buildCalendarPayload('me', start, end, 'all', [task], [], [], [], []);
    expect(result.events).toEqual([]);
  });

  it('keeps canonical all-day dates on the local visible boundary day', () => {
    // Run this same regression with TZ=America/Los_Angeles and
    // TZ=Pacific/Auckland to exercise both sides of UTC.
    const localStart = new Date(2026, 9, 29).toISOString();
    const localEnd = new Date(2026, 9, 30).toISOString();
    const allDay = (id: string, from: string, through: string): CalendarEvent => ({
      ...event(id, `${from}T00:00:00.000Z`, `${through}T00:00:00.000Z`), all_day: true,
    });
    const result = buildCalendarPayload('me', localStart, localEnd, 'all', [], [], [], [], [
      allDay('previous-day', '2026-10-28', '2026-10-29'),
      allDay('visible-day', '2026-10-29', '2026-10-30'),
      allDay('next-day', '2026-10-30', '2026-10-31'),
      allDay('spanning', '2026-10-28', '2026-10-31'),
    ]);
    expect(result.events.map((entry) => entry.entityId)).toEqual(['spanning', 'visible-day']);
    expect(result.events.find((entry) => entry.entityId === 'visible-day')?.start).toBe('2026-10-29T00:00:00.000Z');
  });
});
