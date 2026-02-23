import Dexie, { type Table } from 'dexie';
import type { Task, Category, Note, List, ListItem } from '@/types';

export interface PendingOp {
  id?: number; // auto-incremented primary key
  userId: string;
  table: 'tasks' | 'categories' | 'notes' | 'lists' | 'list_items';
  operation: 'create' | 'update' | 'delete';
  recordId: string; // the record's ID (client-generated UUID for creates)
  data: Record<string, unknown>; // full record for creates, patch for updates
  createdAt: number; // Date.now() for ordering
  retryCount: number;
}

export class ZenDB extends Dexie {
  tasks!: Table<Task, string>;
  categories!: Table<Category, string>;
  notes!: Table<Note, string>;
  lists!: Table<List, string>;
  listItems!: Table<ListItem, string>;
  pendingOps!: Table<PendingOp, number>;

  constructor() {
    super('zen-workspace');
    this.version(1).stores({
      tasks: 'id, user_id, order',
      categories: 'id, user_id, created_at',
      notes: 'id, user_id, updated_at',
      lists: 'id, user_id, created_at',
      listItems: 'id, list_id, position',
      pendingOps: '++id, userId, table, createdAt',
    });
  }
}

export const db = new ZenDB();
