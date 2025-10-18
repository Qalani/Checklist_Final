import { useEffect, useMemo, useState } from 'react';
import type { FriendSearchResult } from '@/types';
import { FriendsManager, type ActionError, type FriendsSnapshot } from './FriendsManager';

type Decision = 'accepted' | 'declined';

type ResourceType = 'task' | 'list';

type Role = 'editor' | 'viewer';

export interface UseFriendsResult extends FriendsSnapshot {
  refresh: (force?: boolean) => Promise<void>;
  search: (query: string) => Promise<FriendSearchResult[] | ActionError>;
  sendRequest: (targetUserId: string) => Promise<void | ActionError>;
  sendRequestByCode: (friendCode: string) => Promise<void | ActionError>;
  respondToRequest: (requestId: string, decision: Decision) => Promise<void | ActionError>;
  cancelRequest: (requestId: string) => Promise<void | ActionError>;
  removeFriend: (friendUserId: string) => Promise<void | ActionError>;
  blockUser: (targetUserId: string, reason?: string | null) => Promise<void | ActionError>;
  unblockUser: (targetUserId: string) => Promise<void | ActionError>;
  inviteFriend: (
    friendUserId: string,
    resourceType: ResourceType,
    resourceId: string,
    role?: Role,
  ) => Promise<void | ActionError>;
}

export function useFriends(userId: string | null): UseFriendsResult {
  const manager = useMemo(() => new FriendsManager(), []);
  const [snapshot, setSnapshot] = useState<FriendsSnapshot>(manager.getSnapshot());

  useEffect(() => manager.subscribe(setSnapshot), [manager]);

  useEffect(() => {
    void manager.setUser(userId);
    return () => {
      void manager.setUser(null);
    };
  }, [manager, userId]);

  useEffect(() => () => manager.dispose(), [manager]);

  return {
    ...snapshot,
    refresh: (force?: boolean) => manager.refresh(Boolean(force)),
    search: (query: string) => manager.search(query),
    sendRequest: (targetUserId) => manager.sendRequest(targetUserId),
    sendRequestByCode: (friendCode) => manager.sendRequestByCode(friendCode),
    respondToRequest: (requestId, decision) => manager.respondToRequest(requestId, decision),
    cancelRequest: (requestId) => manager.cancelRequest(requestId),
    removeFriend: (friendUserId) => manager.removeFriend(friendUserId),
    blockUser: (targetUserId, reason) => manager.blockUser(targetUserId, reason),
    unblockUser: (targetUserId) => manager.unblockUser(targetUserId),
    inviteFriend: (friendUserId, resourceType, resourceId, role) =>
      manager.inviteFriend(friendUserId, resourceType, resourceId, role),
  };
}
