import { useCalendarEvents } from '@/features/calendar/useCalendarEvents';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/local-db';
import { enqueue } from '@/lib/sync-queue';
import { isOnline } from '@/lib/network-status';
import { cacheRows, cacheDelete, shouldQueueWrite } from '@/lib/offline-cache';

jest.mock('react', () => ({ ...jest.requireActual('react'), useCallback: (fn: unknown) => fn }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/local-db', () => ({ db: { transaction: (...args: unknown[]) => (args[args.length - 1] as () => Promise<unknown>)(), sync_queue: {}, calendar_events: { get: jest.fn(), put: jest.fn(), delete: jest.fn(), where: jest.fn(), bulkPut: jest.fn() } } }));
jest.mock('@/lib/sync-queue', () => ({ enqueue: jest.fn() }));
jest.mock('@/lib/network-status', () => ({ isOnline: jest.fn() }));
jest.mock('@/lib/offline-cache', () => ({ cacheRows: jest.fn().mockResolvedValue(undefined), cacheDelete: jest.fn().mockResolvedValue(undefined), shouldQueueWrite: jest.fn(async () => !jest.requireMock('@/lib/network-status').isOnline()) }));
jest.mock('@/features/calendar/ics', () => ({
  calendarTimeToDate: (date: { toJSDate: () => Date }) => date.toJSDate(),
  registerCalendarTimezones: jest.fn(),
  CalendarTimezoneError: class extends Error {},
}));
jest.mock('ical.js', () => ({
  parse: () => [],
  Component: class {
    getAllSubcomponents() { return [{}]; }
  },
  Event: class {
    uid = 'existing-uid';
    summary = 'Imported planning';
    startDate = { toJSDate: () => new Date('2026-10-01T09:00:00Z'), isDate: false };
    endDate = { toJSDate: () => new Date('2026-10-01T10:00:00Z') };
  },
}));

describe('calendar event persistence', () => {
  const stored = {
    id: 'event', user_id: 'me', title: 'Planning', all_day: false,
    start_time: '2026-10-01T09:00:00Z', end_time: '2026-10-01T10:00:00Z',
  };
  let query: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.clearAllMocks();
    (isOnline as jest.Mock).mockReturnValue(true);
    (db.calendar_events.put as jest.Mock).mockResolvedValue('event');
    (db.calendar_events.delete as jest.Mock).mockResolvedValue(undefined);
    query = Object.fromEntries(['insert', 'update', 'upsert', 'delete', 'eq', 'in', 'select', 'single', 'maybeSingle'].map((name) => [name, jest.fn()]));
    Object.values(query).forEach((fn) => fn.mockReturnValue(query));
    query.single.mockResolvedValue({ data: stored, error: null });
    query.maybeSingle.mockResolvedValue({ data: stored, error: null });
    (supabase.from as jest.Mock).mockReturnValue(query);
  });

  it('rejects zero-duration events before writing', async () => {
    const { createEvent } = useCalendarEvents('me');
    await expect(createEvent({ title: 'Planning', start: stored.start_time, end: stored.start_time })).rejects.toThrow('after the start');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('caches a successful online save for offline editing', async () => {
    const { createEvent } = useCalendarEvents('me');
    await expect(createEvent({ title: 'Planning', start: stored.start_time, end: stored.end_time })).resolves.toEqual(stored);
    expect(cacheRows).toHaveBeenCalledWith('calendar_events', [stored], 'me');
  });

  it('does not report an online save as failed if local storage is unavailable', async () => {
    (db.calendar_events.put as jest.Mock).mockRejectedValue(new Error('Storage unavailable'));
    const { updateEvent } = useCalendarEvents('me');
    await expect(updateEvent('event', { title: 'Updated' })).resolves.toEqual(stored);
  });

  it('restricts online deletion to the signed-in owner', async () => {
    await useCalendarEvents('me').deleteEvent('event');
    expect(query.eq).toHaveBeenCalledWith('id', 'event');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'me');
    expect(cacheDelete).toHaveBeenCalledWith('calendar_events', 'event');
  });

  it('queues deletion offline and removes the local event', async () => {
    (isOnline as jest.Mock).mockReturnValue(false);
    (db.calendar_events.get as jest.Mock).mockResolvedValue(stored);
    await useCalendarEvents('me').deleteEvent('event');
    expect(enqueue).toHaveBeenCalledWith({ user_id: 'me', table_name: 'calendar_events', operation: 'DELETE', payload: { id: 'event', user_id: 'me' } });
    expect(db.calendar_events.delete).toHaveBeenCalledWith('event');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('queues online edits while earlier changes are still waiting to sync', async () => {
    (shouldQueueWrite as jest.Mock).mockResolvedValueOnce(true);
    (db.calendar_events.get as jest.Mock).mockResolvedValue(stored);
    await useCalendarEvents('me').updateEvent('event', { title: 'Newest local edit' });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'me', operation: 'UPDATE', payload: expect.objectContaining({ title: 'Newest local edit' }),
    }));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('refuses to edit another cached account’s event offline', async () => {
    (isOnline as jest.Mock).mockReturnValue(false);
    (db.calendar_events.get as jest.Mock).mockResolvedValue({ ...stored, user_id: 'someone-else' });
    const { updateEvent, deleteEvent } = useCalendarEvents('me');
    await expect(updateEvent('event', { title: 'Changed' })).rejects.toThrow('Event not found');
    await expect(deleteEvent('event')).rejects.toThrow('Event not found');
    expect(enqueue).not.toHaveBeenCalled();
    expect(db.calendar_events.put).not.toHaveBeenCalled();
    expect(db.calendar_events.delete).not.toHaveBeenCalled();
  });

  it('imports and reimports calendar files offline without a server call', async () => {
    (isOnline as jest.Mock).mockReturnValue(false);
    Object.defineProperty(globalThis, 'TextEncoder', { value: class { encode() { return new Uint8Array(); } }, configurable: true });
    Object.defineProperty(globalThis, 'crypto', {
      value: { subtle: { digest: jest.fn().mockResolvedValue(new Uint8Array([1, 2]).buffer) }, randomUUID: () => 'offline-id' },
      configurable: true,
    });
    const toArray = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([
      { ...stored, id: 'offline-id', import_source: 'planning.ics', import_uid: '0102' },
    ]);
    const equals = jest.fn().mockReturnValue({ toArray });
    (db.calendar_events.where as jest.Mock).mockReturnValue({ equals });
    (db.calendar_events.get as jest.Mock).mockResolvedValue(undefined);
    const file = { name: 'planning.ics', text: async () => 'BEGIN:VCALENDAR' } as File;
    await expect(useCalendarEvents('me').importFromIcs(file)).resolves.toEqual({ imported: 1, updated: 0, processed: 1, truncated: 0 });
    await expect(useCalendarEvents('me').importFromIcs(file)).resolves.toEqual({ imported: 0, updated: 1, processed: 1, truncated: 0 });
    expect(equals).toHaveBeenCalledWith('me');
    expect(enqueue).toHaveBeenNthCalledWith(1, expect.objectContaining({ operation: 'INSERT', payload: expect.objectContaining({ id: 'offline-id', user_id: 'me' }) }));
    expect(enqueue).toHaveBeenNthCalledWith(2, expect.objectContaining({ operation: 'UPDATE', payload: expect.objectContaining({ id: 'offline-id' }) }));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('reimports by existing primary key instead of the partial import index', async () => {
    Object.defineProperty(globalThis, 'TextEncoder', { value: class { encode() { return new Uint8Array(); } }, configurable: true });
    Object.defineProperty(globalThis, 'crypto', {
      value: { subtle: { digest: jest.fn().mockResolvedValue(new Uint8Array([1, 2]).buffer) }, randomUUID: () => 'new-id' },
      configurable: true,
    });
    query.in.mockResolvedValue({ data: [{ id: 'existing-id', import_uid: '0102' }], error: null });
    query.upsert.mockReturnValue({ select: jest.fn().mockResolvedValue({ data: [], error: null }) });
    const file = { name: 'planning.ics', text: async () => 'BEGIN:VCALENDAR' } as File;
    await expect(useCalendarEvents('me').importFromIcs(file)).resolves.toEqual({ imported: 0, updated: 1, processed: 1, truncated: 0 });
    expect(query.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'existing-id', user_id: 'me', title: 'Imported planning' }),
    ], { onConflict: 'id' });
  });
});
