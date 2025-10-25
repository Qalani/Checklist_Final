export type ReminderFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

export interface ReminderRecurrence {
  frequency: ReminderFrequency;
  interval?: number | null;
  weekdays?: number[] | null;
  monthdays?: number[] | null;
  start_at?: string | null;
  end_at?: string | null;
}

export interface ZenReminder extends Record<string, unknown> {
  id: string;
  user_id?: string;
  title: string;
  description?: string | null;
  remind_at: string;
  timezone?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Task extends Record<string, unknown> {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  category: string;
  category_color: string;
  order: number;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
  due_date?: string | null;
  reminder_minutes_before?: number | null;
  reminder_recurrence?: ReminderRecurrence | null;
  reminder_next_trigger_at?: string | null;
  reminder_last_trigger_at?: string | null;
  reminder_snoozed_until?: string | null;
  reminder_timezone?: string | null;
  access_role?: 'owner' | 'editor' | 'viewer';
}

export interface TaskCollaborator {
  id: string;
  task_id: string;
  user_id: string;
  user_email?: string | null;
  role: 'owner' | 'editor' | 'viewer';
  is_owner?: boolean;
  created_at?: string;
}

export interface Category extends Record<string, unknown> {
  id: string;
  name: string;
  color: string;
  user_id?: string;
  created_at?: string;
}

export interface List {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string;
  user_id?: string;
  owner_id?: string;
  access_role?: 'owner' | 'editor' | 'viewer';
  members?: ListMember[];
  public_share_token?: string | null;
  public_share_enabled?: boolean;
}

export interface ListMember {
  id: string;
  list_id: string;
  user_id: string;
  user_email?: string | null;
  role: 'owner' | 'editor' | 'viewer';
  created_at?: string;
}

export interface Friend {
  id: string;
  user_id: string;
  friend_id: string;
  friend_email: string;
  friend_name?: string | null;
  created_at?: string;
}

export interface FriendRequest {
  id: string;
  requester_id: string;
  requester_email: string;
  requester_name?: string | null;
  target_id: string;
  target_email: string;
  target_name?: string | null;
  status: 'pending' | 'accepted' | 'declined';
  created_at?: string;
  responded_at?: string | null;
}

export interface Note extends Record<string, unknown> {
  id: string;
  user_id?: string;
  title: string;
  content: string;
  summary?: string | null;
  word_count?: number | null;
  created_at?: string;
  updated_at?: string;
}
