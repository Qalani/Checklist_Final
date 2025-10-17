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
  access_role?: 'owner' | 'editor' | 'viewer';
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
  requested_id: string;
  requester_email?: string | null;
  requested_email?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  message?: string | null;
  created_at?: string;
  updated_at?: string;
  responded_at?: string | null;
}

export interface BlockedUser {
  id: string;
  user_id: string;
  blocked_user_id: string;
  blocked_email?: string | null;
  blocked_name?: string | null;
  reason?: string | null;
  created_at?: string;
}

export interface FriendSearchResult {
  user_id: string;
  email: string;
  name?: string | null;
  is_friend: boolean;
  has_pending_request: boolean;
  incoming_request: boolean;
  is_blocked: boolean;
}