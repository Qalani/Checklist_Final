import type { Friend, List, Note, Task, ZenReminder } from '@/types';

export interface TaskOverview {
  openTasks: number;
  completedTasks: number;
  nextDueTask: Task | null;
}

export interface ListOverview {
  totalLists: number;
}

export interface NoteOverview {
  totalNotes: number;
}

export interface FriendOverview {
  totalFriends: number;
}

export interface ReminderOverview {
  totalReminders: number;
  upcomingReminder: ZenReminder | null;
}

export function selectTaskOverview(tasks: Task[], demoMode: boolean): TaskOverview {
  if (demoMode) {
    const now = new Date();
    const demoDate = new Date(now.getTime() + 1000 * 60 * 60 * 24);
    return {
      openTasks: 4,
      completedTasks: 18,
      nextDueTask: { title: 'Design system sync', due_date: demoDate.toISOString() } as Task,
    };
  }

  const openTasks = tasks.filter(task => !task.completed).length;
  const completedTasks = tasks.filter(task => task.completed).length;
  const nextDueTask =
    tasks
      .filter(task => !task.completed && task.due_date)
      .sort((a, b) => new Date(a.due_date as string).getTime() - new Date(b.due_date as string).getTime())[0] ?? null;

  return {
    openTasks,
    completedTasks,
    nextDueTask,
  };
}

export function selectListOverview(lists: List[], demoMode: boolean): ListOverview {
  return { totalLists: demoMode ? 6 : lists.length };
}

export function selectNoteOverview(notes: Note[], demoMode: boolean): NoteOverview {
  return { totalNotes: demoMode ? 12 : notes.length };
}

export function selectFriendOverview(friends: Friend[], demoMode: boolean): FriendOverview {
  return { totalFriends: demoMode ? 3 : friends.length };
}

export function selectReminderOverview(reminders: ZenReminder[], demoMode: boolean): ReminderOverview {
  if (demoMode) {
    const now = new Date();
    const soon = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    return {
      totalReminders: 5,
      upcomingReminder: { title: 'Mindful breathing break', remind_at: soon.toISOString() } as ZenReminder,
    };
  }

  const now = Date.now();
  const upcoming = reminders
    .map(reminder => ({ reminder, timestamp: new Date(reminder.remind_at).getTime() }))
    .filter(entry => !Number.isNaN(entry.timestamp) && entry.timestamp >= now)
    .sort((a, b) => a.timestamp - b.timestamp)[0];

  return {
    totalReminders: reminders.length,
    upcomingReminder: upcoming ? upcoming.reminder : null,
  };
}
