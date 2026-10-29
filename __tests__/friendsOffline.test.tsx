import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchFriendsData, readFriendsSnapshot, useFriends, type UseFriendsResult } from '@/features/friends/useFriends';
import { writeAccountCache } from '@/lib/account-cache';

let mockOnline = true;
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockChannel = { on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis(), unsubscribe: jest.fn() };
jest.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args), rpc: (...args: unknown[]) => mockRpc(...args), channel: () => mockChannel },
}));
jest.mock('@/lib/network-status', () => ({ isOnline: () => mockOnline, onStatusChange: () => () => {} }));

const friend = { id: 'f-1', user_id: 'alice', friend_id: 'bob', friend_email: 'bob@example.com', friend_name: null, created_at: null };
const request = { id: 'r-1', requester_id: 'bob', requester_email: 'bob@example.com', target_id: 'alice', target_email: 'alice@example.com', requester_name: null, target_name: null, status: 'pending', created_at: null, responded_at: null };

function query(rows: unknown[]) {
  const builder = {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), or: jest.fn().mockReturnThis(),
    returns: jest.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return builder;
}

beforeEach(() => {
  mockOnline = true;
  mockFrom.mockReset();
  mockRpc.mockReset();
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

test('friends and pending requests survive an offline reload after online fetch', async () => {
  mockFrom.mockImplementation(table => query(table === 'friends' ? [friend] : [request]));
  const online = await fetchFriendsData('alice');
  mockOnline = false;
  mockFrom.mockClear();
  expect(await fetchFriendsData('alice')).toEqual(online);
  expect(mockFrom).not.toHaveBeenCalled();
  expect(online.incoming[0].id).toBe('r-1');
});

test('account switches never expose another account’s cached friends or requests', async () => {
  writeAccountCache('friends', 'alice', { friends: [friend], incoming: [request], outgoing: [] });
  mockOnline = false;
  expect(await fetchFriendsData('charlie')).toEqual({ friends: [], incoming: [], outgoing: [] });
  writeAccountCache('friends', 'charlie', { friends: [friend], incoming: [request], outgoing: [] });
  expect(readFriendsSnapshot('charlie')).toEqual({ friends: [], incoming: [], outgoing: [] });
});

test('malformed saved snapshots fall back to empty offline lists', async () => {
  localStorage.setItem('zen-cache:friends:alice', '{broken');
  mockOnline = false;
  expect(await fetchFriendsData('alice')).toEqual({ friends: [], incoming: [], outgoing: [] });
});

test('offline relationship changes return actionable errors without a remote call', async () => {
  mockOnline = false;
  const container = document.createElement('div');
  const root = createRoot(container);
  let result: UseFriendsResult;
  function Harness() { result = useFriends('alice'); return null; }
  await act(async () => { root.render(<Harness />); });
  await act(async () => {
    expect(await result!.addFriend('bob@example.com')).toEqual({ error: 'You’re offline. Reconnect to send a friend request.' });
    expect(await result!.removeFriend('bob')).toEqual({ error: 'You’re offline. Reconnect to remove a friend.' });
    expect(await result!.acceptRequest('r-1')).toEqual({ error: 'You’re offline. Reconnect to respond to a friend request.' });
  });
  expect(mockRpc).not.toHaveBeenCalled();
  await act(async () => root.unmount());
});
