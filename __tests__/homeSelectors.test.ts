import {
  selectFriendOverview,
  selectListOverview,
  selectNoteOverview,
  selectReminderOverview,
  selectTaskOverview,
} from '@/features/home/selectors';
import type { Friend, List, Note, Task, ZenReminder } from '@/types';

describe('home selector utilities', () => {
  const sampleTasks: Task[] = [
    { id: '1', title: 'Do thing', completed: false, priority: 'low', category: '', category_color: '', order: 0 },
    {
      id: '2',
      title: 'Finish report',
      completed: true,
      priority: 'high',
      category: '',
      category_color: '',
      order: 1,
      due_date: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    },
    {
      id: '3',
      title: 'Prepare slides',
      completed: false,
      priority: 'medium',
      category: '',
      category_color: '',
      order: 2,
      due_date: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    },
  ];

  it('computes task overview with next due item', () => {
    const overview = selectTaskOverview(sampleTasks, false);

    expect(overview.openTasks).toBe(2);
    expect(overview.completedTasks).toBe(1);
    expect(overview.nextDueTask?.title).toBe('Prepare slides');
  });

  it('returns demo task numbers when demo mode is enabled', () => {
    const overview = selectTaskOverview([], true);

    expect(overview.openTasks).toBe(4);
    expect(overview.completedTasks).toBe(18);
    expect(overview.nextDueTask).toBeTruthy();
  });

  it('computes list, note, and friend totals', () => {
    const lists: List[] = [{ id: 'list', name: 'Weekly', description: null }];
    const notes: Note[] = [{ id: 'note', title: 'Idea', content: 'Write it down' }];
    const friends: Friend[] = [{ id: 'f1', user_id: 'a', friend_id: 'b', friend_email: 'user@example.com' }];

    expect(selectListOverview(lists, false).totalLists).toBe(1);
    expect(selectListOverview([], true).totalLists).toBe(6);
    expect(selectNoteOverview(notes, false).totalNotes).toBe(1);
    expect(selectNoteOverview([], true).totalNotes).toBe(12);
    expect(selectFriendOverview(friends, false).totalFriends).toBe(1);
    expect(selectFriendOverview([], true).totalFriends).toBe(3);
  });

  it('selects upcoming reminder and counts total reminders', () => {
    const reminders: ZenReminder[] = [
      {
        id: 'late',
        title: 'Old reminder',
        remind_at: new Date(Date.now() - 1000 * 60).toISOString(),
      },
      {
        id: 'next',
        title: 'Soon reminder',
        remind_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      },
    ];

    const overview = selectReminderOverview(reminders, false);

    expect(overview.totalReminders).toBe(2);
    expect(overview.upcomingReminder?.id).toBe('next');
  });

  it('uses demo reminder data in demo mode', () => {
    const overview = selectReminderOverview([], true);

    expect(overview.totalReminders).toBe(5);
    expect(overview.upcomingReminder).toBeTruthy();
  });
});
