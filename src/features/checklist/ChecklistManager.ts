import { supabase } from '@/lib/supabase';
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
    if (a.created_at && !b.created_at) {
      return -1;
    }
    if (!a.created_at && b.created_at) {
      return 1;
    }
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

export async function fetchTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase.rpc('get_tasks_with_access');

  if (error) {
    throw new Error(error.message || 'Failed to load tasks.');
  }

  const records = Array.isArray(data) ? data : [];

  return records.map((record) => {
    const task = normalizeReminderFields(record as Task);
    return {
      ...task,
      access_role:
        (record as { access_role?: Task['access_role'] }).access_role ?? (record.user_id === userId ? 'owner' : undefined),
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
      });
      return;
    }

    this.userId = userId;
    this.setSnapshot({
      status: 'loading',
      syncing: true,
      tasks: [],
      categories: [],
      error: null,
    });

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

      try {
        const [tasks, categories] = await Promise.all([
          fetchTasks(this.userId as string),
          fetchCategories(this.userId as string),
        ]);

        this.setSnapshot({
          status: 'ready',
          syncing: false,
          tasks,
          categories: sortCategories(categories),
          error: null,
        });
      } catch (error) {
        const message = extractErrorMessage(error, 'Failed to sync your checklist.');
        this.setSnapshot((prev) => ({
          ...prev,
          status: prev.status === 'idle' ? 'error' : prev.status,
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
      if (existingTask) {
        if (existingTask.access_role && !['owner', 'editor'].includes(existingTask.access_role)) {
          throw new Error('You do not have permission to edit this task.');
        }

        const sanitizedInput: Record<string, unknown> = {
          ...taskData,
        };

        if (typeof sanitizedInput.title === 'string') {
          sanitizedInput.title = (sanitizedInput.title as string).trim();
        }

        delete sanitizedInput.id;
        delete sanitizedInput.user_id;
        delete sanitizedInput.order;

        const { data, error } = await supabase
          .from('tasks')
          .update(sanitizedInput)
          .eq('id', existingTask.id)
          .select()
          .single();

        if (error) {
          throw new Error(error.message || 'Unable to save task.');
        }

        const updatedTask = this.normalizeTask((data ?? existingTask) as Task, existingTask);
        this.setSnapshot((prev) => ({
          ...prev,
          tasks: prev.tasks
            .map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task))
            .sort((a, b) => a.order - b.order),
          error: null,
        }));
        return {};
      }

      const { data: sessionResult } = await supabase.auth.getSession();
      const token = sessionResult.session?.access_token;

      if (!token) {
        throw new Error('You must be signed in to add tasks.');
      }

      const trimmedTitle = typeof taskData.title === 'string' ? taskData.title.trim() : '';

      if (!trimmedTitle || !taskData.priority || !taskData.category || !taskData.category_color) {
        throw new Error('Task is missing required information.');
      }

      const ownedTasks = this.snapshot.tasks.filter((task) => task.user_id === this.userId);
      const nextOrder = ownedTasks.reduce(
        (max, current) => Math.max(max, current.order ?? 0),
        -1,
      ) + 1;

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
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
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          typeof (payload as { error?: unknown })?.error === 'string'
            ? (payload as { error?: string }).error
            : 'Unable to save task. Please try again.';
        throw new Error(message);
      }

      const savedTask =
        payload && typeof payload === 'object'
          ? ((payload as { task?: Task }).task as Task | undefined)
          : undefined;

      if (!savedTask) {
        throw new Error('Unable to save task. Please try again.');
      }

      const normalizedTask = this.normalizeTask(savedTask as Task);

      this.setSnapshot((prev) => {
        const existingTasks = prev.tasks.filter((task) => task.id !== normalizedTask.id);
        return {
          ...prev,
          tasks: [...existingTasks, normalizedTask].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
          error: null,
        };
      });
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

    const targetTask = this.snapshot.tasks.find((task) => task.id === id);

    if (!targetTask || targetTask.user_id !== this.userId) {
      this.setSnapshot((prev) => ({
        ...prev,
        error: 'You can only delete tasks that you own.',
      }));
      return;
    }

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      console.error('Error deleting task', error);
      this.setSnapshot((prev) => ({
        ...prev,
        error: error.message || 'Unable to delete task. Please try again.',
      }));
      return;
    }

    this.setSnapshot((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((task) => task.id !== id),
      error: null,
    }));
  }

  async toggleTask(id: string, completed: boolean) {
    if (!this.userId) {
      return;
    }

    const targetTask = this.snapshot.tasks.find((task) => task.id === id);

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

    let query = supabase.from('tasks').update({ completed }).eq('id', id);

    if (targetTask.user_id === this.userId) {
      query = query.eq('user_id', this.userId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      console.error('Error toggling task', error);
      this.setSnapshot((prev) => ({
        ...prev,
        error: error.message || 'Unable to update task. Please try again.',
      }));
      return;
    }

    const updatedTask = this.normalizeTask(data as Task, targetTask);
    this.setSnapshot((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => (task.id === updatedTask.id ? { ...task, ...updatedTask } : task)),
      error: null,
    }));
  }

  async reorderTasks(reorderedTasks: Task[]) {
    if (!this.userId) {
      return;
    }

    const invalidTask = reorderedTasks.find((task) => task.user_id !== this.userId);

    if (invalidTask) {
      this.setSnapshot((prev) => ({
        ...prev,
        error: 'You can only reorder tasks that you own.',
      }));
      return;
    }

    const reorderedTaskIds = new Set(reorderedTasks.map((task) => task.id));
    const preservedOrders = this.snapshot.tasks
      .filter((task) => reorderedTaskIds.has(task.id))
      .sort((a, b) => a.order - b.order)
      .map((task) => task.order);

    const updatedReorderedTasks = reorderedTasks.map((task, index) => ({
      ...task,
      order: preservedOrders[index] ?? task.order,
    }));
    const updatedTasksById = new Map(
      updatedReorderedTasks.map((task) => [task.id, task] as const),
    );

    try {
      for (const task of updatedReorderedTasks) {
        const { error } = await supabase
          .from('tasks')
          .update({ order: task.order })
          .eq('id', task.id)
          .eq('user_id', this.userId as string);

        if (error) {
          throw new Error(error.message || 'Unable to reorder tasks. Please try again.');
        }
      }

      this.setSnapshot((prev) => ({
        ...prev,
        tasks: prev.tasks
          .map((task) => updatedTasksById.get(task.id) ?? task)
          .sort((a, b) => a.order - b.order),
        error: null,
      }));
    } catch (error) {
      console.error('Error reordering tasks', error);
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

    const { data: sessionResult } = await supabase.auth.getSession();
    const token = sessionResult.session?.access_token;

    if (!token) {
      throw new Error('You must be signed in to add categories.');
    }

    const response = await fetch('/api/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        typeof (payload as { error?: unknown })?.error === 'string'
          ? (payload as { error?: string }).error
          : 'Unable to save category. Please try again.';
      throw new Error(message);
    }

    const savedCategory =
      payload && typeof payload === 'object'
        ? ((payload as { category?: Category }).category as Category | undefined)
        : undefined;

    if (!savedCategory) {
      throw new Error('Unable to save category. Please try again.');
    }

    this.setSnapshot((prev) => ({
      ...prev,
      categories: sortCategories([...prev.categories, savedCategory]),
      error: null,
    }));

    return savedCategory;
  }

  async updateCategory(id: string, updates: CategoryInput) {
    if (!this.userId) {
      throw new Error('You must be signed in to update categories.');
    }

    const previousCategory = this.snapshot.categories.find((category) => category.id === id);
    const previousCategorySnapshot = previousCategory
      ? { name: previousCategory.name, color: previousCategory.color }
      : null;
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
    this.setSnapshot((prev) => ({
      ...prev,
      categories: sortCategories(
        prev.categories.map((category) =>
          category.id === id ? { ...category, ...updatedCategory } : category,
        ),
      ),
      tasks: previousCategorySnapshot
        ? prev.tasks.map((task) =>
            task.category === previousCategorySnapshot.name
              ? {
                  ...task,
                  category: updatedCategory.name,
                  category_color: updatedCategory.color,
                }
              : task,
          )
        : prev.tasks,
      error: null,
    }));

    if (previousCategorySnapshot) {
      const { error: tasksError } = await supabase
        .from('tasks')
        .update({
          category: updatedCategory.name,
          category_color: updatedCategory.color,
        })
        .eq('user_id', this.userId)
        .eq('category', previousCategorySnapshot.name);

      if (tasksError) {
        await this.refresh(true);
        throw new Error(
          tasksError.message || 'Unable to update category. Please try again.',
        );
      }
    }
  }

  async deleteCategory(id: string) {
    if (!this.userId) {
      throw new Error('You must be signed in to delete categories.');
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', this.userId);

    if (error) {
      throw new Error(error.message || 'Unable to delete category. Please try again.');
    }

    this.setSnapshot((prev) => ({
      ...prev,
      categories: sortCategories(prev.categories.filter((category) => category.id !== id)),
      error: null,
    }));
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
      incoming.access_role ?? previous?.access_role ?? (incoming.user_id === this.userId ? 'owner' : previous?.access_role);
    const reminderRecurrence = normalizeReminderRecurrence(
      (incoming.reminder_recurrence as ReminderRecurrence | null | undefined) ?? previous?.reminder_recurrence ?? null,
    );

    return {
      ...incoming,
      reminder_recurrence: reminderRecurrence,
      reminder_next_trigger_at: incoming.reminder_next_trigger_at ?? previous?.reminder_next_trigger_at ?? null,
      reminder_last_trigger_at: incoming.reminder_last_trigger_at ?? previous?.reminder_last_trigger_at ?? null,
      reminder_snoozed_until: incoming.reminder_snoozed_until ?? previous?.reminder_snoozed_until ?? null,
      reminder_timezone: incoming.reminder_timezone ?? previous?.reminder_timezone ?? null,
      access_role: accessRole,
    };
  }

  private applyTaskChange(payload: RealtimePostgresChangesPayload<Task>) {
    const { eventType, new: newTask, old: oldTask } = payload;

    if (eventType === 'INSERT' && newTask) {
      this.setSnapshot((prev) => {
        const existing = prev.tasks.find((task) => task.id === newTask.id);
        const normalizedTask = this.normalizeTask(newTask, existing);
        const tasks = [...prev.tasks.filter((task) => task.id !== newTask.id), normalizedTask].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0),
        );

        return {
          ...prev,
          tasks,
          error: null,
        };
      });
      return;
    }

    if (eventType === 'UPDATE' && newTask) {
      this.setSnapshot((prev) => {
        const existing = prev.tasks.find((task) => task.id === newTask.id);
        const normalizedTask = this.normalizeTask(newTask, existing);
        const tasks = [...prev.tasks.filter((task) => task.id !== newTask.id), normalizedTask].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0),
        );

        return {
          ...prev,
          tasks,
          error: null,
        };
      });
      return;
    }

    if (eventType === 'DELETE' && oldTask) {
      this.setSnapshot((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((task) => task.id !== oldTask.id),
        error: null,
      }));
    }
  }

  private applyCategoryChange(payload: RealtimePostgresChangesPayload<Category>) {
    const { eventType, new: newCategory, old: oldCategory } = payload;

    if (eventType === 'INSERT' && newCategory) {
      this.setSnapshot((prev) => {
        const exists = prev.categories.some((category) => category.id === newCategory.id);
        if (exists) {
          return prev;
        }

        return {
          ...prev,
          categories: sortCategories([...prev.categories, newCategory]),
          error: null,
        };
      });
      return;
    }

    if (eventType === 'UPDATE' && newCategory) {
      this.setSnapshot((prev) => ({
        ...prev,
        categories: sortCategories(
          prev.categories.map((category) =>
            category.id === newCategory.id ? { ...category, ...newCategory } : category,
          ),
        ),
        error: null,
      }));
      return;
    }

    if (eventType === 'DELETE' && oldCategory) {
      this.setSnapshot((prev) => ({
        ...prev,
        categories: sortCategories(prev.categories.filter((category) => category.id !== oldCategory.id)),
        error: null,
      }));
    }
  }

  private setSnapshot(patch: Partial<ChecklistSnapshot> | ((snapshot: ChecklistSnapshot) => ChecklistSnapshot)) {
    if (typeof patch === 'function') {
      this.snapshot = (patch as (snapshot: ChecklistSnapshot) => ChecklistSnapshot)(this.snapshot);
    } else {
      this.snapshot = { ...this.snapshot, ...patch };
    }

    this.subscribers.forEach((subscriber) => subscriber(this.snapshot));
  }
}
