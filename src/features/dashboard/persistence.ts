import { supabase } from '@/lib/supabase';
import { isOnline } from '@/lib/network-status';
import { readAccountCache, writeAccountCache } from '@/lib/account-cache';
import { DEFAULT_DASHBOARD_LAYOUT, normalizeLayout } from './layout-metadata';
import type { DashboardLayout } from './types';

type ProfileSettingsRow = {
  dashboard_layout: DashboardLayout | null;
};

type LayoutSnapshot = { layout: DashboardLayout; pending: boolean; revision: string };
const inFlight = new Map<string, Promise<void>>();

function savedLayout(userId: string): LayoutSnapshot | null {
  const value = readAccountCache<LayoutSnapshot>('dashboard', userId);
  return value?.layout && Array.isArray(value.layout.widgets) ? value : null;
}

/** Flush only this account's pending layout; never scan another account's storage. */
export async function flushDashboardLayout(userId: string): Promise<void> {
  if (!isOnline()) return;
  if (inFlight.has(userId)) return inFlight.get(userId);
  const snapshot = savedLayout(userId);
  if (!snapshot?.pending) return;

  const work = (async () => {
    const { error } = await supabase.from('profile_settings').upsert(
      { user_id: userId, dashboard_layout: normalizeLayout(snapshot.layout) },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(error.message || 'Unable to save dashboard layout.');

    // A newer edit made while this request was in flight must remain pending.
    if (savedLayout(userId)?.revision === snapshot.revision) {
      writeAccountCache('dashboard', userId, { ...snapshot, pending: false });
    }
  })();
  inFlight.set(userId, work);
  try {
    await work;
  } finally {
    inFlight.delete(userId);
  }
  if (savedLayout(userId)?.pending) await flushDashboardLayout(userId);
}

export async function fetchDashboardLayout(userId: string): Promise<DashboardLayout> {
  const cached = savedLayout(userId);
  if (!isOnline()) return normalizeLayout(cached?.layout ?? DEFAULT_DASHBOARD_LAYOUT);
  if (cached?.pending) await flushDashboardLayout(userId);

  const { data, error } = await supabase
    .from('profile_settings')
    .select('dashboard_layout')
    .eq('user_id', userId)
    .maybeSingle<ProfileSettingsRow>();

  if (error) throw new Error(error.message || 'Unable to load dashboard layout.');

  // An edit may have been queued during the read; it takes precedence locally.
  const latest = savedLayout(userId);
  if (latest?.pending) return normalizeLayout(latest.layout);
  const layout = normalizeLayout(data?.dashboard_layout ?? DEFAULT_DASHBOARD_LAYOUT);
  writeAccountCache('dashboard', userId, { layout, pending: false, revision: crypto.randomUUID() });
  return layout;
}

export async function persistDashboardLayout(userId: string, layout: DashboardLayout): Promise<void> {
  const normalized = normalizeLayout(layout);
  const stored = writeAccountCache('dashboard', userId, {
    layout: normalized, pending: true, revision: crypto.randomUUID(),
  });
  if (!stored) throw new Error('Unable to save dashboard layout on this device.');
  if (isOnline()) await flushDashboardLayout(userId);
}
