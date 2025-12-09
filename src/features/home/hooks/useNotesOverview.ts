import { useMemo } from 'react';

import { useNotes } from '@/features/notes/useNotes';
import { selectNoteOverview } from '../selectors';

export function useNotesOverview(targetUserId: string | null, demoMode: boolean) {
  const { notes, status, syncing } = useNotes(targetUserId);
  const loading = status === 'loading' || syncing;

  const overview = useMemo(() => selectNoteOverview(notes, demoMode), [demoMode, notes]);

  return {
    ...overview,
    notes,
    loading,
  };
}
