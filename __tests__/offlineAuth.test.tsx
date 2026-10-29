import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { readOfflineUser, rememberOfflineUser, isLocallySignedOut } from '@/lib/offline-identity';
import { getSyncUser, setSyncUser } from '@/lib/sync-session';
import type { User } from '@supabase/supabase-js';

let mockOnline = false;
let mockAuthCallback: (event: string, session: unknown) => void;
const mockSession = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { auth: {
  getSession: () => mockSession(), signOut: () => mockSignOut(),
  onAuthStateChange: (callback: typeof mockAuthCallback) => { mockAuthCallback = callback; return {data:{subscription:{unsubscribe:jest.fn()}}}; },
} } }));
jest.mock('@/lib/sync-engine', () => ({ syncAll: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/network-status', () => ({ isOnline: () => mockOnline, checkHttpConnectivity: async () => mockOnline, onStatusChange: () => () => {} }));

const alice = { id:'alice', email:'alice@example.test', aud:'authenticated', created_at:'2026-10-29', app_metadata:{ secret:'do not persist' }, user_metadata:{} } as User;
let result: ReturnType<typeof useAuthSession>;
let root: Root;
function Probe() { result = useAuthSession(); return <span>{result.user?.id ?? 'signed out'}</span>; }
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); setSyncUser(null); mockOnline = false;
  mockSession.mockReset().mockReturnValue(new Promise(() => {}));
  mockSignOut.mockReset().mockReturnValue(new Promise(() => {}));
  root = createRoot(document.createElement('div'));
});
afterEach(async () => { await act(async () => root.unmount()); });

it('opens the existing local workspace without waiting for an expired token refresh', async () => {
  rememberOfflineUser(alice);
  await act(async () => root.render(<Probe />));
  expect(result.authChecked).toBe(true); expect(result.user?.id).toBe('alice'); expect(result.syncStatus).toBe('ready');
  expect(getSyncUser()).toBe('alice');
  expect(readOfflineUser()?.app_metadata).toEqual({});
});
it('clears offline identity immediately on explicit logout, even if the network call hangs', async () => {
  rememberOfflineUser(alice);
  await act(async () => root.render(<Probe />));
  await act(async () => { void result.signOut(); });
  expect(readOfflineUser()).toBeNull(); expect(result.user).toBeNull(); expect(isLocallySignedOut('alice')).toBe(true);
  // A stale session callback cannot restore a deliberately signed-out profile.
  await act(async () => { mockAuthCallback('INITIAL_SESSION',{user:alice}); await new Promise(resolve => setTimeout(resolve,0)); });
  expect(result.user).toBeNull();
});
it('allows an explicit successful sign-in to restore a previously logged-out account', async () => {
  rememberOfflineUser(alice);
  await act(async () => root.render(<Probe />));
  await act(async () => { void result.signOut(); });
  await act(async () => { mockAuthCallback('SIGNED_IN',{user:alice}); await new Promise(resolve => setTimeout(resolve,0)); });
  expect(result.user?.id).toBe('alice'); expect(isLocallySignedOut('alice')).toBe(false);
});
it('does not restore a cached profile when online auth says there is no valid session', async () => {
  rememberOfflineUser(alice); mockOnline = true;
  mockSession.mockResolvedValue({data:{session:null},error:null});
  await act(async () => root.render(<Probe />));
  expect(result.user).toBeNull(); expect(readOfflineUser()).toBeNull();
});
