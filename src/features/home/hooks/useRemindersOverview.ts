import { useMemo } from 'react';

import { useZenReminders } from '@/features/reminders/useZenReminders';
import { selectReminderOverview } from '../selectors';

export function useRemindersOverview(targetUserId: string | null, demoMode: boolean) {
  const { reminders, status, syncing } = useZenReminders(targetUserId);
  const loading = status === 'loading' || syncing;

  const overview = useMemo(() => selectReminderOverview(reminders, demoMode), [demoMode, reminders]);

  return {
    ...overview,
    reminders,
    loading,
  };
}
