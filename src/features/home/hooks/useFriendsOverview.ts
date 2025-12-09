import { useMemo } from 'react';

import { useFriends } from '@/features/friends/useFriends';
import { selectFriendOverview } from '../selectors';

export function useFriendsOverview(targetUserId: string | null, demoMode: boolean) {
  const { friends, status, syncing } = useFriends(targetUserId);
  const loading = status === 'loading' || syncing;

  const overview = useMemo(() => selectFriendOverview(friends, demoMode), [demoMode, friends]);

  return {
    ...overview,
    friends,
    loading,
  };
}
