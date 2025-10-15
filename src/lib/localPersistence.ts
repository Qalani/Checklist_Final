'use client';

import type { Task, Category } from '@/types';

const TASKS_STORAGE_KEY = 'zen-tasks.local.tasks';
const CATEGORIES_STORAGE_KEY = 'zen-tasks.local.categories';

type MutableTask = Task & { [key: string]: unknown };

type MutableCategory = Category & { [key: string]: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPriority = (value: unknown): value is Task['priority'] =>
  value === 'low' || value === 'medium' || value === 'high';

export const generateLocalId = (): string => {
  const globalCrypto = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto : undefined;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const sanitizeTasks = (value: unknown): Task[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item, index) => {
      const task = item as MutableTask;
      return {
        id: typeof task.id === 'string' && task.id.trim() ? task.id : generateLocalId(),
        title: typeof task.title === 'string' ? task.title : '',
        description: typeof task.description === 'string' && task.description.length > 0 ? task.description : undefined,
        completed: typeof task.completed === 'boolean' ? task.completed : false,
        priority: isPriority(task.priority) ? task.priority : 'medium',
        category: typeof task.category === 'string' ? task.category : '',
        category_color: typeof task.category_color === 'string' ? task.category_color : '#5a7a5a',
        order: typeof task.order === 'number' && Number.isFinite(task.order) ? task.order : index,
        created_at: typeof task.created_at === 'string' ? task.created_at : undefined,
        updated_at: typeof task.updated_at === 'string' ? task.updated_at : undefined,
        user_id: typeof task.user_id === 'string' ? task.user_id : undefined,
      } satisfies Task;
    })
    .sort((a, b) => a.order - b.order);
};

const sanitizeCategories = (value: unknown): Category[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => {
      const category = item as MutableCategory;
      return {
        id: typeof category.id === 'string' && category.id.trim() ? category.id : generateLocalId(),
        name: typeof category.name === 'string' ? category.name : '',
        color: typeof category.color === 'string' ? category.color : '#5a7a5a',
        user_id: typeof category.user_id === 'string' ? category.user_id : undefined,
        created_at: typeof category.created_at === 'string' ? category.created_at : undefined,
      } satisfies Category;
    });
};

const readStorage = (key: string): unknown => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as unknown;
  } catch (error) {
    console.warn(`Unable to parse stored data for ${key}`, error);
    return undefined;
  }
};

const writeStorage = (key: string, value: unknown) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Unable to persist data for ${key}`, error);
  }
};

export const loadLocalTasks = (): Task[] => sanitizeTasks(readStorage(TASKS_STORAGE_KEY));

export const loadLocalCategories = (): Category[] => sanitizeCategories(readStorage(CATEGORIES_STORAGE_KEY));

export const saveLocalTasks = (tasks: Task[]) => writeStorage(TASKS_STORAGE_KEY, tasks);

export const saveLocalCategories = (categories: Category[]) => writeStorage(CATEGORIES_STORAGE_KEY, categories);
