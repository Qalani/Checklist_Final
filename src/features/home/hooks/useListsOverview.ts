import { useMemo } from 'react';

import { useLists } from '@/features/lists/useLists';
import { selectListOverview } from '../selectors';

export function useListsOverview(targetUserId: string | null, demoMode: boolean) {
  const { lists, status, syncing } = useLists(targetUserId);
  const loading = status === 'loading' || syncing;

  const overview = useMemo(() => selectListOverview(lists, demoMode), [demoMode, lists]);

  return {
    ...overview,
    lists,
    loading,
  };
}
