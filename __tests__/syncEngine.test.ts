// Mock network-status before any module load to prevent the side-effect in
// sync-engine.ts from trying to register a real listener.
jest.mock('@/lib/network-status', () => ({
  onStatusChange: jest.fn(),
}));

// ── Supabase mock ──────────────────────────────────────────────────────────────

const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

// ── Dexie mock ─────────────────────────────────────────────────────────────────

const mockBulkGet = jest.fn();
const mockPut = jest.fn();

const dexieTableMock = () => ({ bulkGet: mockBulkGet, put: mockPut });

jest.mock('@/lib/local-db', () => ({
  db: {
    tasks: dexieTableMock(),
    categories: dexieTableMock(),
    notes: dexieTableMock(),
    lists: dexieTableMock(),
    list_items: dexieTableMock(),
    list_members: dexieTableMock(),
    zen_reminders: dexieTableMock(),
    calendar_events: dexieTableMock(),
  },
}));

// ── Sync-queue mock ────────────────────────────────────────────────────────────

const mockGetAll = jest.fn();
const mockRemove = jest.fn();
const mockIncrementRetry = jest.fn();

jest.mock('@/lib/sync-queue', () => ({
  getAll: mockGetAll,
  remove: mockRemove,
  incrementRetry: mockIncrementRetry,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Builds a mock Supabase query object that is awaitable (PromiseLike).
 * Chains select / gt / eq / upsert / delete all return `this` so the
 * builder pattern in sync-engine works without real Supabase calls.
 */
function makeQueryMock(result: { data: unknown; error: unknown }) {
  const mock: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    delete: jest.fn().mockReturnThis(),
    then(
      onFulfilled?: (v: unknown) => unknown,
      onRejected?: (r: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return mock;
}

// ── Import module under test (after all mocks are in place) ───────────────────

import { resolveConflict, pullLatest, pushQueue } from '@/lib/sync-engine';

// ─────────────────────────────────────────────────────────────────────────────
// resolveConflict
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveConflict', () => {
  it('returns remote when remote updated_at is newer', () => {
    const local = { id: '1', updated_at: '2024-01-01T00:00:00Z' };
    const remote = { id: '1', updated_at: '2024-01-02T00:00:00Z' };
    expect(resolveConflict(local, remote)).toBe(remote);
  });

  it('returns local when local updated_at is newer', () => {
    const local = { id: '1', updated_at: '2024-01-10T00:00:00Z' };
    const remote = { id: '1', updated_at: '2024-01-01T00:00:00Z' };
    expect(resolveConflict(local, remote)).toBe(local);
  });

  it('returns remote on equal timestamps (tie goes to remote)', () => {
    const ts = '2024-06-15T12:00:00Z';
    const local = { id: '1', updated_at: ts };
    const remote = { id: '1', updated_at: ts };
    expect(resolveConflict(local, remote)).toBe(remote);
  });

  it('remote wins when local has no updated_at (append-only tables)', () => {
    const local = { id: '1' };
    const remote = { id: '1', updated_at: '2024-01-01T00:00:00Z' };
    expect(resolveConflict(local, remote)).toBe(remote);
  });

  it('local wins when remote has no updated_at', () => {
    const local = { id: '1', updated_at: '2024-01-01T00:00:00Z' };
    const remote = { id: '1' };
    expect(resolveConflict(local, remote)).toBe(local);
  });

  it('remote wins when both lack updated_at (0 >= 0 → remote default)', () => {
    const local = { id: '1', value: 'local' };
    const remote = { id: '1', value: 'remote' };
    expect(resolveConflict(local, remote)).toBe(remote);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pullLatest
// ─────────────────────────────────────────────────────────────────────────────

describe('pullLatest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns early without touching Dexie when Supabase returns no rows', async () => {
    mockFrom.mockReturnValue(makeQueryMock({ data: [], error: null }));

    await pullLatest('tasks', 'user-1', '1970-01-01T00:00:00Z');

    expect(mockBulkGet).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('returns early without touching Dexie when Supabase returns null data', async () => {
    mockFrom.mockReturnValue(makeQueryMock({ data: null, error: null }));

    await pullLatest('tasks', 'user-1', '1970-01-01T00:00:00Z');

    expect(mockBulkGet).not.toHaveBeenCalled();
  });

  it('throws a descriptive error when Supabase returns an error', async () => {
    mockFrom.mockReturnValue(makeQueryMock({ data: null, error: { message: 'DB error' } }));

    await expect(
      pullLatest('tasks', 'user-1', '1970-01-01T00:00:00Z'),
    ).rejects.toThrow('pullLatest(tasks): DB error');
  });

  it('puts the remote record when no local copy exists', async () => {
    const remote = { id: 'r1', updated_at: '2024-01-01T00:00:00Z', title: 'Remote' };
    mockFrom.mockReturnValue(makeQueryMock({ data: [remote], error: null }));
    mockBulkGet.mockResolvedValue([undefined]);
    mockPut.mockResolvedValue(undefined);

    await pullLatest('tasks', 'user-1', '1970-01-01T00:00:00Z');

    expect(mockPut).toHaveBeenCalledWith(remote);
  });

  it('keeps remote record when remote is newer than local (LWW)', async () => {
    const local = { id: 'r1', updated_at: '2024-01-01T00:00:00Z', title: 'Local' };
    const remote = { id: 'r1', updated_at: '2024-01-10T00:00:00Z', title: 'Remote' };
    mockFrom.mockReturnValue(makeQueryMock({ data: [remote], error: null }));
    mockBulkGet.mockResolvedValue([local]);
    mockPut.mockResolvedValue(undefined);

    await pullLatest('tasks', 'user-1', '1970-01-01T00:00:00Z');

    expect(mockPut).toHaveBeenCalledWith(remote);
  });

  it('keeps local record when local is newer than remote (LWW)', async () => {
    const local = { id: 'r1', updated_at: '2024-01-10T00:00:00Z', title: 'Local' };
    const remote = { id: 'r1', updated_at: '2024-01-01T00:00:00Z', title: 'Remote' };
    mockFrom.mockReturnValue(makeQueryMock({ data: [remote], error: null }));
    mockBulkGet.mockResolvedValue([local]);
    mockPut.mockResolvedValue(undefined);

    await pullLatest('tasks', 'user-1', '1970-01-01T00:00:00Z');

    expect(mockPut).toHaveBeenCalledWith(local);
  });

  it('applies user_id filter for user-scoped tables', async () => {
    const queryMock = makeQueryMock({ data: [], error: null });
    mockFrom.mockReturnValue(queryMock);

    await pullLatest('tasks', 'user-abc', '1970-01-01T00:00:00Z');

    expect((queryMock.eq as jest.Mock)).toHaveBeenCalledWith('user_id', 'user-abc');
  });

  it('does NOT apply user_id filter for list_items (not user-scoped)', async () => {
    const queryMock = makeQueryMock({ data: [], error: null });
    mockFrom.mockReturnValue(queryMock);

    await pullLatest('list_items', 'user-abc', '1970-01-01T00:00:00Z');

    expect((queryMock.eq as jest.Mock)).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pushQueue
// ─────────────────────────────────────────────────────────────────────────────

describe('pushQueue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('removes entry after a successful INSERT/UPDATE (upsert)', async () => {
    const entry = {
      id: 'q1',
      retries: 0,
      table_name: 'tasks',
      operation: 'INSERT',
      payload: { id: 't1', title: 'Task' },
    };
    mockGetAll.mockResolvedValue([entry]);
    mockRemove.mockResolvedValue(undefined);

    const queryMock = makeQueryMock({ data: null, error: null });
    mockFrom.mockReturnValue(queryMock);

    await pushQueue();

    expect((queryMock.upsert as jest.Mock)).toHaveBeenCalledWith(entry.payload);
    expect(mockRemove).toHaveBeenCalledWith('q1');
  });

  it('removes entry after a successful DELETE', async () => {
    const entry = {
      id: 'q2',
      retries: 0,
      table_name: 'tasks',
      operation: 'DELETE',
      payload: { id: 't2' },
    };
    mockGetAll.mockResolvedValue([entry]);
    mockRemove.mockResolvedValue(undefined);

    const deleteMock = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then(onFulfilled?: (v: unknown) => unknown) {
        return Promise.resolve({ error: null }).then(onFulfilled);
      },
    };
    mockFrom.mockReturnValue(deleteMock);

    await pushQueue();

    expect(deleteMock.delete).toHaveBeenCalled();
    expect(deleteMock.eq).toHaveBeenCalledWith('id', 't2');
    expect(mockRemove).toHaveBeenCalledWith('q2');
  });

  it('removes exhausted entries (MAX_RETRIES = 3) without a Supabase call', async () => {
    const entry = {
      id: 'q3',
      retries: 3,
      table_name: 'tasks',
      operation: 'INSERT',
      payload: { id: 't3' },
    };
    mockGetAll.mockResolvedValue([entry]);
    mockRemove.mockResolvedValue(undefined);

    await pushQueue();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith('q3');
  });

  it('increments retry counter when Supabase returns an error', async () => {
    jest.useFakeTimers();

    const entry = {
      id: 'q4',
      retries: 0,
      table_name: 'tasks',
      operation: 'INSERT',
      payload: { id: 't4' },
    };
    mockGetAll.mockResolvedValue([entry]);
    mockIncrementRetry.mockResolvedValue(undefined);

    const queryMock = makeQueryMock({ data: null, error: null });
    (queryMock.upsert as jest.Mock).mockResolvedValue({ error: { message: 'Network error' } });
    mockFrom.mockReturnValue(queryMock);

    const pushPromise = pushQueue();
    // runAllTimersAsync advances fake timers AND flushes pending microtasks between
    // timer callbacks, allowing the async pushQueue to progress past the sleep.
    await jest.runAllTimersAsync();
    await pushPromise;

    jest.useRealTimers();

    expect(mockIncrementRetry).toHaveBeenCalledWith('q4');
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
