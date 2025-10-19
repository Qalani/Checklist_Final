import { supabase } from '@/lib/supabase';
import { DEFAULT_DASHBOARD_LAYOUT, normalizeLayout } from './layout-metadata';
import type { DashboardLayout } from './types';

type ProfileSettingsRow = {
  dashboard_layout: DashboardLayout | null;
};

export async function fetchDashboardLayout(userId: string): Promise<DashboardLayout> {
  const { data, error } = await supabase
    .from('profile_settings')
    .select('dashboard_layout')
    .eq('user_id', userId)
    .maybeSingle<ProfileSettingsRow>();

  if (error) {
    throw new Error(error.message || 'Unable to load dashboard layout.');
  }

  return normalizeLayout(data?.dashboard_layout ?? DEFAULT_DASHBOARD_LAYOUT);
}

export async function persistDashboardLayout(userId: string, layout: DashboardLayout): Promise<void> {
  const normalized = normalizeLayout(layout);

  const { error } = await supabase.from('profile_settings').upsert(
    {
      user_id: userId,
      dashboard_layout: normalized,
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    throw new Error(error.message || 'Unable to save dashboard layout.');
  }
}
