'use client';

import useSWR from 'swr';
import { Users } from 'lucide-react';
import DashboardWidgetFrame from './DashboardWidgetFrame';
import { loadFriendsSummary } from '../data';

interface DashboardFriendsWidgetProps {
  userId: string | null;
}

export default function DashboardFriendsWidget({ userId }: DashboardFriendsWidgetProps) {
  const { data, error, isLoading } = useSWR(
    userId ? ['dashboard-friends', userId] : null,
    () => loadFriendsSummary(userId as string),
    {
      revalidateOnFocus: false,
    },
  );

  const icon = <Users className="h-5 w-5" />;

  if (!userId) {
    return (
      <DashboardWidgetFrame title="Friend Activity" description="Sign in to collaborate." icon={icon}>
        <p className="text-sm text-zen-500 dark:text-slate-300">Sign in to view friend requests and connections.</p>
      </DashboardWidgetFrame>
    );
  }

  return (
    <DashboardWidgetFrame
      title="Friend Activity"
      description="Track requests and maintain trusted collaborators."
      icon={icon}
      isLoading={isLoading}
      footer={error ? <span className="text-red-600">{error.message}</span> : undefined}
    >
      {data ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zen-500 dark:text-slate-300">Connections</span>
            <span className="text-lg font-semibold text-zen-900 dark:text-white">{data.totalFriends}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zen-500 dark:text-slate-300">Incoming requests</span>
            <span className="rounded-full bg-sage-100 px-3 py-1 text-sm font-medium text-sage-700 dark:bg-slate-800/70 dark:text-slate-100">
              {data.pendingIncoming}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zen-500 dark:text-slate-300">Outgoing requests</span>
            <span className="rounded-full bg-sage-100 px-3 py-1 text-sm font-medium text-sage-700 dark:bg-slate-800/70 dark:text-slate-100">
              {data.pendingOutgoing}
            </span>
          </div>
        </div>
      ) : null}
    </DashboardWidgetFrame>
  );
}
