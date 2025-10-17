export interface Task {
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
}

export interface Category {
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
}