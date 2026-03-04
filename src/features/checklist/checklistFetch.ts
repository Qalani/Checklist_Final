import { supabase } from '@/lib/supabase';
import { db } from '@/lib/local-db';
import { isOnline } from '@/lib/network-status';
import { normalizeReminderRecurrence } from '@/utils/reminders';
import type { Category, ReminderRecurrence, Task } from '@/types';

export interface FetchTasksOptions {
  from?: number;
  to?: number;
  limit?: number;
}

export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    if (a.created_at && b.created_at && a.created_at !== b.created_at) {
      return a.created_at.localeCompare(b.created_at);
    }
    if (a.created_at && !b.created_at) {
      return -1;
    }
    if (!a.created_at && b.created_at) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function normalizeReminderFields(task: Task): Task {
  const reminderRecurrence = normalizeReminderRecurrence(
    (task.reminder_recurrence as ReminderRecurrence | null | undefined) ?? null,
  );

  return {
    ...task,
    reminder_recurrence: reminderRecurrence,
    reminder_next_trigger_at: task.reminder_next_trigger_at ?? null,
    reminder_last_trigger_at: task.reminder_last_trigger_at ?? null,
    reminder_snoozed_until: task.reminder_snoozed_until ?? null,
    reminder_timezone: task.reminder_timezone ?? null,
  };
}

export async function fetchTasks(userId: string, options: FetchTasksOptions = {}): Promise<Task[]> {
  if (!isOnline()) {
    const rows = await db.tasks.where('user_id').equals(userId).toArray();
    return rows
      .map(task => ({ ...normalizeReminderFields(task), access_role: task.access_role ?? 'owner' }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  const rangeStart = typeof options.from === 'number' ? options.from : 0;
  const calculatedEnd =
    typeof options.to === 'number'
      ? options.to
      : typeof options.limit === 'number'
        ? rangeStart + Math.max(options.limit, 1) - 1
        : rangeStart + 199;

  const { data, error } = await supabase
    .rpc('get_tasks_with_access')
    .range(rangeStart, calculatedEnd);

  if (error) {
    throw new Error(error.message || 'Failed to load tasks.');
  }

  const records = Array.isArray(data) ? data : [];

  return records.map((record) => {
    const task = normalizeReminderFields(record as Task);
    return {
      ...task,
      access_role:
        (record as { access_role?: Task['access_role'] }).access_role ?? (record.user_id === userId ? 'owner' : undefined),
    };
  });
}

export async function fetchCategories(userId: string): Promise<Category[]> {
  if (!isOnline()) {
    const rows = await db.categories.where('user_id').equals(userId).toArray();
    return rows.sort((a, b) => {
      if (a.created_at && b.created_at && a.created_at !== b.created_at) {
        return a.created_at.localeCompare(b.created_at);
      }
      return a.name.localeCompare(b.name);
    });
  }

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to load categories.');
  }

  return data ?? [];
}
