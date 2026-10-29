import { loadMembers, inviteMember, updateMemberRole, removeMember } from '@/features/lists/listMembership';

let mockOnline = true;
let mockUser: string | null = 'alice';
const mockMembers = [{ id: 'm-1', list_id: 'l-1', user_id: 'alice', role: 'owner' }];
const mockGetList = jest.fn();
const mockGetScope = jest.fn();
const mockCacheRows = jest.fn().mockResolvedValue(undefined);
const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/lib/network-status', () => ({ isOnline: () => mockOnline }));
jest.mock('@/lib/sync-session', () => ({ getSyncUser: () => mockUser }));
jest.mock('@/lib/offline-cache', () => ({ cacheRows: (...args: unknown[]) => mockCacheRows(...args), cacheDelete: jest.fn() }));
jest.mock('@/lib/local-db', () => ({ db: {
  lists: { get: (...args: unknown[]) => mockGetList(...args) },
  cache_scopes: { get: (...args: unknown[]) => mockGetScope(...args) },
  list_members: { where: () => ({ equals: () => ({ toArray: async () => mockMembers }) }) },
} }));
jest.mock('@/lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args), rpc: (...args: unknown[]) => mockRpc(...args) } }));

beforeEach(() => {
  mockOnline = true;
  mockUser = 'alice';
  mockGetList.mockResolvedValue({ user_id: 'alice' });
  mockGetScope.mockResolvedValue(undefined);
  mockCacheRows.mockClear();
  mockFrom.mockReset();
  mockRpc.mockReset();
});

test('online member reads save the returned members for later offline use', async () => {
  const query = {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: mockMembers, error: null }).then(resolve),
  };
  mockFrom.mockReturnValue(query);
  expect(await loadMembers('l-1')).toEqual({ members: mockMembers });
  expect(mockCacheRows).toHaveBeenCalledWith('list_members', mockMembers);
});

test('offline reads require this account to have cached access to the list', async () => {
  mockOnline = false;
  mockUser = 'charlie';
  expect(await loadMembers('l-1')).toEqual({ error: 'This list is not available offline for this account.' });
  expect(mockFrom).not.toHaveBeenCalled();
});

test('a shared list in this account’s access snapshot can show saved members offline', async () => {
  mockOnline = false;
  mockUser = 'charlie';
  mockGetScope.mockResolvedValue({ row_ids: ['l-1'] });
  expect(await loadMembers('l-1')).toEqual({ members: mockMembers });
});

test('offline permission changes report that server authorization is required', async () => {
  mockOnline = false;
  const expected = { error: 'You’re offline. Reconnect to manage list members.' };
  expect(await inviteMember('l-1', 'bob@example.com', 'editor')).toEqual(expected);
  expect(await updateMemberRole('m-1', 'viewer')).toEqual(expected);
  expect(await removeMember('m-1')).toEqual(expected);
  expect(mockRpc).not.toHaveBeenCalled();
  expect(mockFrom).not.toHaveBeenCalled();
});
