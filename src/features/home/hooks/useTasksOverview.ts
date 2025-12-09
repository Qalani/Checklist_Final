import { useMemo } from 'react';

import { useChecklist } from '@/features/checklist/useChecklist';
import { selectTaskOverview } from '../selectors';

export function useTasksOverview(targetUserId: string | null, demoMode: boolean) {
  const { tasks, status, syncing } = useChecklist(targetUserId);
  const loading = status === 'loading' || syncing;

  const overview = useMemo(() => selectTaskOverview(tasks, demoMode), [demoMode, tasks]);

  return {
    ...overview,
    tasks,
    loading,
  };
}
