import type { ReminderRecurrence } from '@/types';

export type CalendarAccessScope = 'personal' | 'shared';

export type CalendarAccessRole = 'owner' | 'editor' | 'viewer';

export interface CalendarTaskSummary {
  id: string;
  title: string;
  due_date: string | null;
  completed: boolean;
  category: string | null;
  category_color: string | null;
  reminder_minutes_before: number | null;
  reminder_recurrence: ReminderRecurrence | null;
  reminder_next_trigger_at: string | null;
  reminder_last_trigger_at: string | null;
  reminder_snoozed_until: string | null;
  reminder_timezone: string | null;
  access_role: CalendarAccessRole;
  access: CalendarAccessScope;
  user_id?: string;
}

export interface CalendarReminderSummary {
  id: string;
  task_id: string;
  title: string;
  scheduled_for: string;
  access_role: CalendarAccessRole;
  access: CalendarAccessScope;
  timezone: string | null;
  due_date?: string | null;
  category_color?: string | null;
}

export interface CalendarNoteSummary {
  id: string;
  title: string;
  summary: string | null;
  updated_at: string;
  created_at: string | null;
  access: 'personal';
}

export interface CalendarAggregationDay {
  date: string;
  tasks: CalendarTaskSummary[];
  reminders: CalendarReminderSummary[];
  notes: CalendarNoteSummary[];
}

export interface CalendarAggregationResponse {
  from: string;
  to: string;
  timezone: string;
  days: CalendarAggregationDay[];
}
