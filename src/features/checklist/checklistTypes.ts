import type { Category, Task } from '@/types';

export type ChecklistStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ChecklistSnapshot {
  status: ChecklistStatus;
  syncing: boolean;
  tasks: Task[];
  categories: Category[];
  error: string | null;
}

export type Subscriber = (snapshot: ChecklistSnapshot) => void;

export type CategoryInput = {
  name: string;
  color: string;
};
