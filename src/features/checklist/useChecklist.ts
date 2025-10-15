import { useEffect, useMemo, useState } from 'react';
import type { Task, Category } from '@/types';
import { ChecklistManager, type ChecklistSnapshot } from './ChecklistManager';

interface UseChecklistResult extends ChecklistSnapshot {
  saveTask: (taskData: Partial<Task>, existing: Task | null) => Promise<{ error?: string } | void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string, completed: boolean) => Promise<void>;
  reorderTasks: (tasks: Task[]) => Promise<void>;
  createCategory: (input: { name: string; color: string }) => Promise<Category>;
  updateCategory: (id: string, input: { name: string; color: string }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  refresh: (force?: boolean) => Promise<void>;
}

export function useChecklist(userId: string | null): UseChecklistResult {
  const manager = useMemo(() => new ChecklistManager(), []);
  const [snapshot, setSnapshot] = useState<ChecklistSnapshot>(manager.getSnapshot());

  useEffect(() => manager.subscribe(setSnapshot), [manager]);

  useEffect(() => {
    void manager.setUser(userId);
    return () => {
      void manager.setUser(null);
    };
  }, [manager, userId]);

  useEffect(() => () => manager.dispose(), [manager]);

  return {
    ...snapshot,
    saveTask: (taskData, existing) => manager.saveTask(taskData, existing),
    deleteTask: (id) => manager.deleteTask(id),
    toggleTask: (id, completed) => manager.toggleTask(id, completed),
    reorderTasks: (tasks) => manager.reorderTasks(tasks),
    createCategory: (input) => manager.createCategory(input),
    updateCategory: (id, input) => manager.updateCategory(id, input),
    deleteCategory: (id) => manager.deleteCategory(id),
    refresh: (force) => manager.refresh(force),
  };
}
