import Dexie, { type Table } from 'dexie';
import type {
  Task,
  Category,
  Note,
  List,
  ListItem,
  ListMember,
  ZenReminder,
  CalendarEvent,
} from '@/types';

// Sync queue entry stored locally while offline
export interface SyncQueueEntry {
  id?: number; // auto-increment primary key
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  queued_at: string;
  retries: number;
}

class ZenWorkspaceDB extends Dexie {
  tasks!: Table<Task, string>;
  categories!: Table<Category, string>;
  notes!: Table<Note, string>;
  lists!: Table<List, string>;
  list_items!: Table<ListItem, string>;
  list_members!: Table<ListMember, string>;
  zen_reminders!: Table<ZenReminder, string>;
  calendar_events!: Table<CalendarEvent, string>;
  sync_queue!: Table<SyncQueueEntry, number>;

  constructor() {
    super('zen-workspace-db');

    this.version(1).stores({
      // id is the primary key; additional entries are indexed fields
      tasks: 'id, updated_at, user_id',
      // categories have no updated_at in the current schema
      categories: 'id, user_id',
      notes: 'id, updated_at, user_id',
      // lists have no updated_at in the current schema
      lists: 'id, user_id',
      list_items: 'id, updated_at, list_id',
      // list_members have no updated_at in the current schema
      list_members: 'id, list_id, user_id',
      zen_reminders: 'id, updated_at, user_id',
      calendar_events: 'id, updated_at, user_id',
      // ++id = auto-incrementing integer primary key
      sync_queue: '++id, table_name, queued_at',
    });
  }
}

export const db = new ZenWorkspaceDB();
