import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { isOnline, enqueueOp, flushPendingOps } from '@/lib/offlineSync';
import type { Category, ReminderRecurrence, Task, TaskCollaborator } from '@/types';
import { normalizeReminderRecurrence } from '@/utils/reminders';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

type ChecklistStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ChecklistSnapshot {
  status: ChecklistStatus;
  syncing: boolean;
  tasks: Task[];
  categories: Category[];
  error: string | null;
  pendingOpsCount: number;
}

type Subscriber = (snapshot: ChecklistSnapshot) => void;

type CategoryInput = {
  name: string;
  color: string;
};

function extractErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    if (a.created_at && b.created_at && a.created_at !== b.created_at) {
      return a.created_at.localeCompare(b.created_at);
    }
    if (a.created_at && !b.created_at) return -1;
    if (!a.created_at && b.created_at) return 1;
    return a.name.localeCompare(b.name);
  });
}

function normalizeReminderFields(task: Task): Task {
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

export interface FetchTasksOptions {
  from?: number;
  to?: number;
  limit?: number;
}

export async function fetchTasks(userId: string, options: FetchTasksOptions = {}): Promise<Task[]> {
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
        (record as { access_role?: Task['access_role'] }).access_role ??
        (record.user_id === userId ? 'owner' : undefined),
    };
  });
}

export async function fetchCategories(userId: string): Promise<Category[]> {
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

export class ChecklistManager {
  private snapshot: ChecklistSnapshot = {
    status: 'idle',
    syncing: false,
    tasks: [],
    categories: [],
    error: null,
    pendingOpsCount: 0,
  };

  private userId: string | null = null;
  private subscribers = new Set<Subscriber>();
  private channels: RealtimeChannel[] = [];
  private refreshPromise: Promise<void> | null = null;

  subscribe(subscriber: Subscriber) {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  getSnapshot(): ChecklistSnapshot {
    return this.snapshot;
  }

  dispose() {
    this.unsubscribeFromRealtime();
    this.subscribers.clear();
  }

  async setUser(userId: string | null) {
    if (this.userId === userId) {
      return;
    }

    this.unsubscribeFromRealtime();

    if (!userId) {
      this.userId = null;
      this.setSnapshot({
        status: 'idle',
        syncing: false,
        tasks: [],
        categories: [],
        error: null,
        pendingOpsCount: 0,
      });
      return;
    }

    this.userId = userId;

    // Show cached data immediately for instant perceived performance
    try {
      const [localTasks, localCategories] = await Promise.all([
        db.tasks.where('user_id').equals(userId).toArray(),
        db.categories.where('user_id').equals(userId).toArray(),
      ]);

      if (localTasks.length > 0 || localCategories.length > 0) {
        const pendingOpsCount = await this.getPendingOpsCount();
        this.setSnapshot({
          status: 'ready',
          syncing: true,
          tasks: localTasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
          categories: sortCategories(localCategories),
          error: null,
          pendingOpsCount,
        });
      } else {
        this.setSnapshot({
          status: 'loading',
          syncing: true,
          tasks: [],
          categories: [],
          error: null,
          pendingOpsCount: 0,
        });
      }
    } catch {
      this.setSnapshot({
        status: 'loading',
        syncing: true,
        tasks: [],
        categories: [],
        error: null,
        pendingOpsCount: 0,
      });
    }

    await this.refresh(true);
    this.subscribeToRealtime(userId);
  }

  async refresh(force = false) {
    if (!this.userId) {
      return;
    }

    if (this.refreshPromise && !force) {
      return this.refreshPromise;
    }

    const run = async () => {
      this.setSnapshot((prev) => ({
        ...prev,
        syncing: true,
        error: prev.status === 'error' ? prev.error : null,
      }));

      // Offline: serve IndexedDB data directly
      if (!isOnline()) {
        try {
          const [tasks, categories] = await Promise.all([
            db.tasks.where('user_id').equals(this.userId!).toArray(),
            db.categories.where('user_id').equals(this.userId!).toArray(),
          ]);
          const pendingOpsCount = await this.getPendingOpsCount();
          this.setSnapshot({
            status: 'ready',
            syncing: false,
            tasks: tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
            categories: sortCategories(categories),
            error: null,
            pendingOpsCount,
          });
        } catch {
          this.setSnapshot((prev) => ({
            ...prev,
            syncing: false,
            error: 'You are offline and no local data is available.',
          }));
        }
        return;
      }

      // Online: flush queued ops first, then pull fresh data
      await flushPendingOps(this.userId!);

      try {
        const [tasks, categories] = await Promise.all([
          fetchTasks(this.userId as string),
          fetchCategories(this.userId as string),
        ]);

        // Persist fresh server data to IndexedDB in the background
        const userId = this.userId!;
        void (async () => {
          try {
            await db.tasks.where('user_id').equals(userId).delete();
            await db.tasks.bulkPut(tasks.filter((t) => t.user_id === userId));
            await db.categories.where('user_id').equals(userId).delete();
            await db.categories.bulkPut(categories);
          } catch {
            // Non-critical – don't block the UI
          }
        })();

        const pendingOpsCount = await this.getPendingOpsCount();
        this.setSnapshot({
          status: 'ready',
          syncing: false,
          tasks,
          categories: sortCategories(categories),
          error: null,
          pendingOpsCount,
        });
      } catch (networkError) {
        // Network request failed – fall back to whatever we have in IndexedDB
        try {
          const [tasks, categories] = await Promise.all([
            db.tasks.where('user_id').equals(this.userId!).toArray(),
            db.categories.where('user_id').equals(this.userId!).toArray(),
          ]);

          if (tasks.length > 0 || categories.length > 0) {
            const pendingOpsCount = await this.getPendingOpsCount();
            this.setSnapshot({
              status: 'ready',
              syncing: false,
              tasks: tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
              categories: sortCategories(categories),
              error: null,
              pendingOpsCount,
            });
            return;
          }
        } catch {
          // IndexedDB also failed
        }

        const message = extractErrorMessage(networkError, 'Failed to sync your checklist.');
        this.setSnapshot((prev) => ({
          ...prev,
          status: 'error',
          syncing: false,
          error: message,
        }));
      }
    };

    this.refreshPromise = run().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  async saveTask(taskData: Partial<Task>, existingTask: Task | null) {
    if (!this.userId) {
      return { error: 'You must be signed in to save tasks.' };
    }

    try {
      // ── UPDATE ────────────────────────────────────────────────────────────
      if (existingTask) {
        if (existingTask.access_role && !['owner', 'editor'].includes(existingTask.access_role)) {
          throw new Error('You do not have permission to edit this task.');
        }

        const sanitizedInput: Record<string, unknown> = { ...taskData };

        if (typeof sanitizedInput.title === 'string') {
          sanitizedInput.title = (sanitizedInput.title as string).trim();
        }

        delete sanitizedInput.id;
        delete sanitizedInput.user_id;
        delete sanitizedInput.order;

        // Optimistic state update
        const optimisticTask = this.normalizeTask(
          { ...existingTask, ...sanitizedInput } as Task,
          existingTask,
        );
        this.setSnapshot((prev) => ({
          ...prev,
          tasks: prev.tasks
            .map((t) => (t.id === existingTask.id ? { ...t, ...optimisticTask } : t))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
          error: null,
        }));
        void db.tasks.put(optimisticTask).catch(() => {});

        if (!isOnline()) {
          await enqueueOp({
            userId: this.userId,
            table: 'tasks',
            operation: 'update',
            recordId: existingTask.id,
            data: sanitizedInput,
            createdAt: Date.now(),
          });
          await this.refreshPendingCount();
          return {};
        }

        const { data, error } = await supabase
          .from('tasks')
          .update(sanitizedInput)
          .eq('id', existingTask.id)
          .select()
          .single();

        if (error) {
          await enqueueOp({
            userId: this.userId,
            table: 'tasks',
            operation: 'update',
            recordId: existingTask.id,
            data: sanitizedInput,
            createdAt: Date.now(),
          });
          await this.refreshPendingCount();
          throw new Error(error.message || 'Unable to save task.');
        }

        const updatedTask = this.normalizeTask((data ?? existingTask) as Task, existingTask);
        void db.tasks.put(updatedTask).catch(() => {});
        this.setSnapshot((prev) => ({
          ...prev,
          tasks: prev.tasks
            .map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
          error: null,
        }));
        return {};
      }

      // ── CREATE ────────────────────────────────────────────────────────────
      const trimmedTitle = typeof taskData.title === 'string' ? taskData.title.trim() : '';

      if (!trimmedTitle || !taskData.priority || !taskData.category || !taskData.category_color) {
        throw new Error('Task is missing required information.');
      }

      const ownedTasks = this.snapshot.tasks.filter((t) => t.user_id === this.userId);
      const nextOrder = ownedTasks.reduce((max, t) => Math.max(max, t.order ?? 0), -1) + 1;

      // Generate UUID client-side so we have a stable ID for offline storage
      const taskId = crypto.randomUUID();
      const now = new Date().toISOString();

      const newTask: Task = {
        id: taskId,
        title: trimmedTitle,
        description: taskData.description ?? '',
        priority: taskData.priority,
        category: taskData.category,
        category_color: taskData.category_color,
        completed: Boolean(taskData.completed),
        due_date: taskData.due_date ?? null,
        reminder_minutes_before: taskData.reminder_minutes_before ?? null,
        reminder_recurrence: taskData.reminder_recurrence ?? null,
        reminder_next_trigger_at: taskData.reminder_next_trigger_at ?? null,
        reminder_snoozed_until: taskData.reminder_snoozed_until ?? null,
        reminder_timezone: taskData.reminder_timezone ?? null,
        order: nextOrder,
        user_id: this.userId,
        created_at: now,
        updated_at: now,
        access_role: 'owner',
      };

      // Optimistic state + IndexedDB write
      this.setSnapshot((prev) => ({
        ...prev,
        tasks: [...prev.tasks, newTask].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        error: null,
      }));
      void db.tasks.put(newTask).catch(() => {});

      if (!isOnline()) {
        await enqueueOp({
          userId: this.userId,
          table: 'tasks',
          operation: 'create',
          recordId: taskId,
          data: newTask as unknown as Record<string, unknown>,
          createdAt: Date.now(),
        });
        await this.refreshPendingCount();
        return {};
      }

      // Insert directly via Supabase client using the pre-generated UUID.
      // Requires the INSERT RLS policy added in migration 20250601000000.
      const { error: insertError } = await supabase.from('tasks').insert({
        id: taskId,
        title: trimmedTitle,
        description: taskData.description ?? '',
        priority: taskData.priority,
        category: taskData.category,
        category_color: taskData.category_color,
        completed: Boolean(taskData.completed),
        due_date: taskData.due_date ?? null,
        reminder_minutes_before: taskData.reminder_minutes_before ?? null,
        reminder_recurrence: taskData.reminder_recurrence ?? null,
        reminder_next_trigger_at: taskData.reminder_next_trigger_at ?? null,
        reminder_snoozed_until: taskData.reminder_snoozed_until ?? null,
        reminder_timezone: taskData.reminder_timezone ?? null,
        order: nextOrder,
        user_id: this.userId,
      });

      if (insertError) {
        // Task already in local state; queue for later sync
        await enqueueOp({
          userId: this.userId,
          table: 'tasks',
          operation: 'create',
          recordId: taskId,
          data: newTask as unknown as Record<string, unknown>,
          createdAt: Date.now(),
        });
        await this.refreshPendingCount();
      }

      return {};
    } catch (error) {
      const message = extractErrorMessage(error, 'Unable to save task. Please try again.');
      return { error: message };
    }
  }

  async deleteTask(id: string) {
    if (!this.userId) {
      return;
    }

    const targetTask = this.snapshot.tasks.find((t) => t.id === id);

    if (!targetTask || targetTask.user_id !== this.userId) {
      this.setSnapshot((prev) => ({
        ...prev,
        error: 'You can only delete tasks that you own.',
      }));
      return;
    }

    // Optimistic removal
    this.setSnapshot((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== id),
      error: null,
    }));
    void db.tasks.delete(id).catch(() => {});

    if (!isOnline()) {
      await enqueueOp({
        userId: this.userId,
        table: 'tasks',
        operation: 'delete',
        recordId: id,
        data: {},
        createdAt: Date.now(),
      });
      await this.refreshPendingCount();
      return;
    }

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      // Restore task and queue for retry
      if (targetTask) {
        this.setSnapshot((prev) => ({
          ...prev,
          tasks: [...prev.tasks, targetTask].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
          error: error.message || 'Unable to delete task. Please try again.',
        }));
        void db.tasks.put(targetTask).catch(() => {});
      }
    }
  }

  async toggleTask(id: string, completed: boolean) {
    if (!this.userId) {
      return;
    }

    const targetTask = this.snapshot.tasks.find((t) => t.id === id);

    if (!targetTask) {
      return;
    }

    if (targetTask.access_role && !['owner', 'editor'].includes(targetTask.access_role)) {
      this.setSnapshot((prev) => ({
        ...prev,
        error: 'You do not have permission to update this task.',
      }));
      return;
    }

    // Optimistic update
    const optimistic = { ...targetTask, completed };
    this.setSnapshot((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === id ? optimistic : t)),
      error: null,
    }));
    void db.tasks.put(optimistic).catch(() => {});

    if (!isOnline()) {
      await enqueueOp({
        userId: this.userId,
        table: 'tasks',
        operation: 'update',
        recordId: id,
        data: { completed },
        createdAt: Date.now(),
      });
      await this.refreshPendingCount();
      return;
    }

    let query = supabase.from('tasks').update({ completed }).eq('id', id);

    if (targetTask.user_id === this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      // Revert optimistic update
      this.setSnapshot((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === id ? targetTask : t)),
        error: error.message || 'Unable to update task. Please try again.',
      }));
      void db.tasks.put(targetTask).catch(() => {});
      return;
    }

    const updatedTask = this.normalizeTask(data as Task, targetTask);
    void db.tasks.put(updatedTask).catch(() => {});
    this.setSnapshot((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t)),
      error: null,
    }));
  }

  async reorderTasks(reorderedTasks: Task[]) {
    if (!this.userId) {
      return;
    }

    const invalidTask = reorderedTasks.find((t) => t.user_id !== this.userId);

    if (invalidTask) {
      this.setSnapshot((prev) => ({
        ...prev,
        error: 'You can only reorder tasks that you own.',
      }));
      return;
    }

    const reorderedTaskIds = new Set(reorderedTasks.map((t) => t.id));
    const preservedOrders = this.snapshot.tasks
      .filter((t) => reorderedTaskIds.has(t.id))
      .sort((a, b) => a.order - b.order)
      .map((t) => t.order);

    const updatedReorderedTasks = reorderedTasks.map((t, index) => ({
      ...t,
      order: preservedOrders[index] ?? t.order,
    }));
    const updatedTasksById = new Map(updatedReorderedTasks.map((t) => [t.id, t] as const));

    // Optimistic update + IndexedDB
    this.setSnapshot((prev) => ({
      ...prev,
      tasks: prev.tasks
        .map((t) => updatedTasksById.get(t.id) ?? t)
        .sort((a, b) => a.order - b.order),
      error: null,
    }));
    for (const t of updatedReorderedTasks) {
      void db.tasks.put(t).catch(() => {});
    }

    if (!isOnline()) {
      for (const t of updatedReorderedTasks) {
        await enqueueOp({
          userId: this.userId,
          table: 'tasks',
          operation: 'update',
          recordId: t.id,
          data: { order: t.order },
          createdAt: Date.now(),
        });
      }
      await this.refreshPendingCount();
      return;
    }

    try {
      for (const t of updatedReorderedTasks) {
        const { error } = await supabase
          .from('tasks')
          .update({ order: t.order })
          .eq('id', t.id)
          .eq('user_id', this.userId as string);

        if (error) {
          throw new Error(error.message || 'Unable to reorder tasks. Please try again.');
        }
      }
    } catch (error) {
      this.setSnapshot((prev) => ({
        ...prev,
        error: extractErrorMessage(error, 'Unable to reorder tasks. Please try again.'),
      }));
    }
  }

  async createCategory(input: CategoryInput) {
    if (!this.userId) {
      throw new Error('You must be signed in to add categories.');
    }

    const categoryId = crypto.randomUUID();
    const now = new Date().toISOString();

    const newCategory: Category = {
      id: categoryId,
      name: input.name,
      color: input.color,
      user_id: this.userId,
      created_at: now,
    };

    // Optimistic update
    this.setSnapshot((prev) => ({
      ...prev,
      categories: sortCategories([...prev.categories, newCategory]),
      error: null,
    }));
    void db.categories.put(newCategory).catch(() => {});

    if (!isOnline()) {
      await enqueueOp({
        userId: this.userId,
        table: 'categories',
        operation: 'create',
        recordId: categoryId,
        data: newCategory as unknown as Record<string, unknown>,
        createdAt: Date.now(),
      });
      await this.refreshPendingCount();
      return newCategory;
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({ id: categoryId, name: input.name, color: input.color, user_id: this.userId })
      .select()
      .single();

    if (error) {
      await enqueueOp({
        userId: this.userId,
        table: 'categories',
        operation: 'create',
        recordId: categoryId,
        data: newCategory as unknown as Record<string, unknown>,
        createdAt: Date.now(),
      });
      await this.refreshPendingCount();
      return newCategory;
    }

    const savedCategory = data as Category;
    void db.categories.put(savedCategory).catch(() => {});
    this.setSnapshot((prev) => ({
      ...prev,
      categories: sortCategories(
        prev.categories.map((c) => (c.id === categoryId ? { ...c, ...savedCategory } : c)),
      ),
      error: null,
    }));

    return savedCategory;
  }

  async updateCategory(id: string, updates: CategoryInput) {
    if (!this.userId) {
      throw new Error('You must be signed in to update categories.');
    }

    const previousCategory = this.snapshot.categories.find((c) => c.id === id);
    const previousCategorySnapshot = previousCategory
      ? { name: previousCategory.name, color: previousCategory.color }
      : null;

    if (!isOnline()) {
      if (previousCategory) {
        const updated = { ...previousCategory, ...updates };
        void db.categories.put(updated).catch(() => {});
        this.setSnapshot((prev) => ({
          ...prev,
          categories: sortCategories(prev.categories.map((c) => (c.id === id ? updated : c))),
          tasks: previousCategorySnapshot
            ? prev.tasks.map((t) =>
                t.category === previousCategorySnapshot.name
                  ? { ...t, category: updates.name, category_color: updates.color }
                  : t,
              )
            : prev.tasks,
          error: null,
        }));
      }
      await enqueueOp({
        userId: this.userId,
        table: 'categories',
        operation: 'update',
        recordId: id,
        data: updates as unknown as Record<string, unknown>,
        createdAt: Date.now(),
      });
      await this.refreshPendingCount();
      return;
    }

    const { data, error } = await supabase
      .from('categories')
      .update(updates)
      .eq('id', id)
      .eq('user_id', this.userId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message || 'Unable to update category. Please try again.');
    }

    const updatedCategory = data as Category;
    void db.categories.put(updatedCategory).catch(() => {});
    this.setSnapshot((prev) => ({
      ...prev,
      categories: sortCategories(
        prev.categories.map((c) => (c.id === id ? { ...c, ...updatedCategory } : c)),
      ),
      tasks: previousCategorySnapshot
        ? prev.tasks.map((t) =>
            t.category === previousCategorySnapshot.name
              ? { ...t, category: updatedCategory.name, category_color: updatedCategory.color }
              : t,
          )
        : prev.tasks,
      error: null,
    }));

    if (previousCategorySnapshot) {
      const { error: tasksError } = await supabase
        .from('tasks')
        .update({ category: updatedCategory.name, category_color: updatedCategory.color })
        .eq('user_id', this.userId)
        .eq('category', previousCategorySnapshot.name);

      if (tasksError) {
        await this.refresh(true);
        throw new Error(tasksError.message || 'Unable to update category. Please try again.');
      }
    }
  }

  async deleteCategory(id: string) {
    if (!this.userId) {
      throw new Error('You must be signed in to delete categories.');
    }

    // Optimistic removal
    this.setSnapshot((prev) => ({
      ...prev,
      categories: sortCategories(prev.categories.filter((c) => c.id !== id)),
      error: null,
    }));
    void db.categories.delete(id).catch(() => {});

    if (!isOnline()) {
      await enqueueOp({
        userId: this.userId,
        table: 'categories',
        operation: 'delete',
        recordId: id,
        data: {},
        createdAt: Date.now(),
      });
      await this.refreshPendingCount();
      return;
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(error.message || 'Unable to delete category. Please try again.');
    }
  }

  async loadTaskCollaborators(taskId: string) {
    try {
      const { data, error } = await supabase.rpc('get_task_collaborators', {
        task_uuid: taskId,
      });

      if (error) {
        throw new Error(error.message || 'Unable to load collaborators.');
      }

      const collaborators = Array.isArray(data) ? (data as TaskCollaborator[]) : [];
      return { collaborators };
    } catch (error) {
      return { error: extractErrorMessage(error, 'Unable to load collaborators.') };
    }
  }

  async inviteTaskCollaborator(taskId: string, email: string, role: 'viewer' | 'editor') {
    if (!email.trim()) {
      return { error: 'Enter an email address to invite.' };
    }

    try {
      const { data, error } = await supabase.rpc('invite_task_collaborator', {
        task_uuid: taskId,
        invitee_email: email.trim(),
        desired_role: role,
      });

      if (error) {
        throw new Error(error.message || 'Unable to invite collaborator.');
      }

      if (!data) {
        throw new Error('Invite did not return the new collaborator.');
      }

      return { collaborator: data as TaskCollaborator };
    } catch (error) {
      return { error: extractErrorMessage(error, 'Unable to invite collaborator.') };
    }
  }

  async updateTaskCollaboratorRole(collaboratorId: string, role: 'viewer' | 'editor') {
    try {
      const { data, error } = await supabase
        .from('task_collaborators')
        .update({ role })
        .eq('id', collaboratorId)
        .select('*')
        .single();

      if (error) {
        throw new Error(error.message || 'Unable to update collaborator.');
      }

      return { collaborator: data as TaskCollaborator };
    } catch (error) {
      return { error: extractErrorMessage(error, 'Unable to update collaborator.') };
    }
  }

  async removeTaskCollaborator(collaboratorId: string) {
    try {
      const { error } = await supabase
        .from('task_collaborators')
        .delete()
        .eq('id', collaboratorId);

      if (error) {
        throw new Error(error.message || 'Unable to remove collaborator.');
      }
    } catch (error) {
      return { error: extractErrorMessage(error, 'Unable to remove collaborator.') };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async getPendingOpsCount(): Promise<number> {
    if (!this.userId) return 0;
    try {
      return db.pendingOps.where('userId').equals(this.userId).count();
    } catch {
      return 0;
    }
  }

  private async refreshPendingCount() {
    const count = await this.getPendingOpsCount();
    this.setSnapshot((prev) => ({ ...prev, pendingOpsCount: count }));
  }

  private subscribeToRealtime(userId: string) {
    this.unsubscribeFromRealtime();

    const subscribeToTable = <T extends Record<string, unknown>>(
      table: 'tasks' | 'categories' | 'task_collaborators',
      handler: (payload: RealtimePostgresChangesPayload<T>) => void,
    ) => {
      const channel = supabase
        .channel(`realtime:public:${table}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
          handler,
        );

      this.channels.push(channel);

      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`Supabase realtime channel error for ${table}`);
        }

        if (status === 'CLOSED') {
          this.channels = this.channels.filter((existing) => existing !== channel);
        }
      });
    };

    subscribeToTable<Task>('tasks', (payload) => {
      this.applyTaskChange(payload);
    });

    subscribeToTable<Category>('categories', (payload) => {
      this.applyCategoryChange(payload);
    });

    subscribeToTable<{ user_id?: string }>('task_collaborators', (payload) => {
      const newRecord = payload.new as { user_id?: string } | null;
      const oldRecord = payload.old as { user_id?: string } | null;
      const affectedUserId = newRecord?.user_id ?? oldRecord?.user_id;

      if (affectedUserId === userId) {
        void this.refresh(true);
      }
    });
  }

  private unsubscribeFromRealtime() {
    if (!this.channels.length) {
      return;
    }

    const channels = this.channels;
    this.channels = [];

    channels.forEach((channel) => {
      void channel.unsubscribe();
    });
  }

  private normalizeTask(incoming: Task, previous?: Task): Task {
    const accessRole =
      incoming.access_role ??
      previous?.access_role ??
      (incoming.user_id === this.userId ? 'owner' : previous?.access_role);
    const reminderRecurrence = normalizeReminderRecurrence(
      (incoming.reminder_recurrence as ReminderRecurrence | null | undefined) ??
        previous?.reminder_recurrence ??
        null,
    );

    return {
      ...incoming,
      reminder_recurrence: reminderRecurrence,
      reminder_next_trigger_at:
        incoming.reminder_next_trigger_at ?? previous?.reminder_next_trigger_at ?? null,
      reminder_last_trigger_at:
        incoming.reminder_last_trigger_at ?? previous?.reminder_last_trigger_at ?? null,
      reminder_snoozed_until:
        incoming.reminder_snoozed_until ?? previous?.reminder_snoozed_until ?? null,
      reminder_timezone: incoming.reminder_timezone ?? previous?.reminder_timezone ?? null,
      access_role: accessRole,
    };
  }

  private applyTaskChange(payload: RealtimePostgresChangesPayload<Task>) {
    const { eventType, new: newTask, old: oldTask } = payload;

    if (eventType === 'INSERT' && newTask) {
      this.setSnapshot((prev) => {
        const existing = prev.tasks.find((t) => t.id === newTask.id);
        const normalizedTask = this.normalizeTask(newTask, existing);
        const tasks = [...prev.tasks.filter((t) => t.id !== newTask.id), normalizedTask].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0),
        );
        return { ...prev, tasks, error: null };
      });
      void db.tasks.put(newTask).catch(() => {});
      return;
    }

    if (eventType === 'UPDATE' && newTask) {
      this.setSnapshot((prev) => {
        const existing = prev.tasks.find((t) => t.id === newTask.id);
        const normalizedTask = this.normalizeTask(newTask, existing);
        const tasks = [...prev.tasks.filter((t) => t.id !== newTask.id), normalizedTask].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0),
        );
        return { ...prev, tasks, error: null };
      });
      void db.tasks.put(newTask).catch(() => {});
      return;
    }

    if (eventType === 'DELETE' && oldTask) {
      this.setSnapshot((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== oldTask.id),
        error: null,
      }));
      void db.tasks.delete(oldTask.id).catch(() => {});
    }
  }

  private applyCategoryChange(payload: RealtimePostgresChangesPayload<Category>) {
    const { eventType, new: newCategory, old: oldCategory } = payload;

    if (eventType === 'INSERT' && newCategory) {
      this.setSnapshot((prev) => {
        const exists = prev.categories.some((c) => c.id === newCategory.id);
        if (exists) return prev;
        return {
          ...prev,
          categories: sortCategories([...prev.categories, newCategory]),
          error: null,
        };
      });
      void db.categories.put(newCategory).catch(() => {});
      return;
    }

    if (eventType === 'UPDATE' && newCategory) {
      this.setSnapshot((prev) => ({
        ...prev,
        categories: sortCategories(
          prev.categories.map((c) => (c.id === newCategory.id ? { ...c, ...newCategory } : c)),
        ),
        error: null,
      }));
      void db.categories.put(newCategory).catch(() => {});
      return;
    }

    if (eventType === 'DELETE' && oldCategory) {
      this.setSnapshot((prev) => ({
        ...prev,
        categories: sortCategories(prev.categories.filter((c) => c.id !== oldCategory.id)),
        error: null,
      }));
      void db.categories.delete(oldCategory.id).catch(() => {});
    }
  }

  private setSnapshot(
    patch:
      | Partial<ChecklistSnapshot>
      | ((snapshot: ChecklistSnapshot) => ChecklistSnapshot),
  ) {
    if (typeof patch === 'function') {
      this.snapshot = (patch as (snapshot: ChecklistSnapshot) => ChecklistSnapshot)(this.snapshot);
    } else {
      this.snapshot = { ...this.snapshot, ...patch };
    }

    this.subscribers.forEach((subscriber) => subscriber(this.snapshot));
  }
}
