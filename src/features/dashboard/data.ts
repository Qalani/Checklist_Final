import { fetchTasks } from '@/features/checklist/ChecklistManager';
import { fetchLists } from '@/features/lists/useLists';
import { fetchNotes } from '@/features/notes/useNotes';
import { fetchFriendsData } from '@/features/friends/useFriends';
import type { Task } from '@/types';

export interface ProductivitySummary {
  activeCount: number;
  completedCount: number;
  nextDueTask: Task | null;
}

export interface NotesSummary {
  recentTitle: string | null;
  totalCount: number;
  lastUpdatedAt: string | null;
}

export interface ListsSummary {
  totalLists: number;
  sharedCount: number;
}

export interface FriendsSummary {
  totalFriends: number;
  pendingIncoming: number;
  pendingOutgoing: number;
}

export interface DashboardHeroSummary {
  activeTasks: number;
  completedTasks: number;
  sharedLists: number;
  totalLists: number;
  noteCount: number;
  totalFriends: number;
  pendingConnections: number;
  nextDueTaskTitle: string | null;
  nextDueTaskDueDate: string | null;
}

export async function loadProductivitySummary(userId: string): Promise<ProductivitySummary> {
  const tasks = await fetchTasks(userId);
  const activeCount = tasks.filter(task => !task.completed).length;
  const completedCount = tasks.filter(task => task.completed).length;
  const nextDueTask = tasks
    .filter(task => !task.completed && task.due_date)
    .sort((a, b) => new Date(a.due_date as string).getTime() - new Date(b.due_date as string).getTime())[0] ?? null;

  return { activeCount, completedCount, nextDueTask };
}

export async function loadNotesSummary(userId: string): Promise<NotesSummary> {
  const notes = await fetchNotes(userId);
  const sorted = [...notes].sort((a, b) => {
    const aDate = a.updated_at || a.created_at || '';
    const bDate = b.updated_at || b.created_at || '';
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
  const recent = sorted[0];

  return {
    recentTitle: recent?.title ?? null,
    totalCount: notes.length,
    lastUpdatedAt: recent?.updated_at ?? recent?.created_at ?? null,
  };
}

export async function loadListsSummary(userId: string): Promise<ListsSummary> {
  const lists = await fetchLists(userId);
  const sharedCount = lists.filter(list => list.access_role && list.access_role !== 'owner').length;
  return {
    totalLists: lists.length,
    sharedCount,
  };
}

export async function loadFriendsSummary(userId: string): Promise<FriendsSummary> {
  const { friends, incoming, outgoing } = await fetchFriendsData(userId);
  return {
    totalFriends: friends.length,
    pendingIncoming: incoming.length,
    pendingOutgoing: outgoing.length,
  };
}

export async function loadDashboardHeroSummary(userId: string): Promise<DashboardHeroSummary> {
  const [productivity, notes, lists, friends] = await Promise.all([
    loadProductivitySummary(userId),
    loadNotesSummary(userId),
    loadListsSummary(userId),
    loadFriendsSummary(userId),
  ]);

  return {
    activeTasks: productivity.activeCount,
    completedTasks: productivity.completedCount,
    sharedLists: lists.sharedCount,
    totalLists: lists.totalLists,
    noteCount: notes.totalCount,
    totalFriends: friends.totalFriends,
    pendingConnections: friends.pendingIncoming + friends.pendingOutgoing,
    nextDueTaskTitle: productivity.nextDueTask?.title ?? null,
    nextDueTaskDueDate: productivity.nextDueTask?.due_date ?? null,
  };
}
