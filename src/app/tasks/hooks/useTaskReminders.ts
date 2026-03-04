'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Task } from '@/types';
import { getNextReminderOccurrence, shouldScheduleReminder } from '@/utils/reminders';
import { supabase } from '@/lib/supabase';

interface UseTaskRemindersOptions {
  tasks: Task[];
  toggleTaskFn: (id: string, completed: boolean) => Promise<void>;
}

export function useTaskReminders({ tasks, toggleTaskFn }: UseTaskRemindersOptions) {
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported' | 'pending'
  >('pending');
  const reminderTimeoutsRef = useRef<Map<string, number>>(new Map());
  const triggeredRemindersRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    const NotificationAPI = window.Notification;

    if (!NotificationAPI) {
      setNotificationPermission('unsupported');
      return;
    }

    setNotificationPermission(NotificationAPI.permission);
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    const NotificationAPI = window.Notification;

    if (!NotificationAPI) {
      setNotificationPermission('unsupported');
      return;
    }

    try {
      const permission = await NotificationAPI.requestPermission();
      setNotificationPermission(permission);
    } catch (error) {
      console.error('Failed to request notification permission', error);
    }
  }, []);

  const showTaskCompletionNotification = useCallback(
    (taskTitle: string) => {
      if (notificationPermission !== 'granted' || typeof window === 'undefined' || !('Notification' in window)) {
        return;
      }

      const NotificationAPI = window.Notification;

      if (!NotificationAPI) {
        return;
      }

      try {
        const notification = new NotificationAPI('Task completed', {
          body: `Nice work! "${taskTitle}" is done.`,
        });

        setTimeout(() => {
          notification.close();
        }, 5000);
      } catch (error) {
        console.error('Unable to display notification', error);
      }
    },
    [notificationPermission],
  );

  const showTaskReminderNotification = useCallback(
    (task: Task, occurrence: Date) => {
      if (notificationPermission !== 'granted' || typeof window === 'undefined' || !('Notification' in window)) {
        return;
      }

      const NotificationAPI = window.Notification;

      if (!NotificationAPI) {
        return;
      }

      try {
        const dueDateText = task.due_date ? new Date(task.due_date).toLocaleString() : null;
        const reminderText = occurrence.toLocaleString();
        const body = dueDateText
          ? `"${task.title}" is due ${dueDateText}. Reminder for ${reminderText}.`
          : `Reminder for "${task.title}" at ${reminderText}.`;
        const notification = new NotificationAPI('Task reminder', {
          body,
          tag: `task-reminder-${task.id}`,
        });

        setTimeout(() => {
          notification.close();
        }, 8000);
      } catch (error) {
        console.error('Unable to display reminder notification', error);
      }
    },
    [notificationPermission],
  );

  const handleReminderTriggered = useCallback(
    async (task: Task, occurrence: Date) => {
      showTaskReminderNotification(task, occurrence);

      const nextOccurrence = getNextReminderOccurrence(
        {
          ...task,
          reminder_last_trigger_at: occurrence.toISOString(),
          reminder_next_trigger_at: occurrence.toISOString(),
          reminder_snoozed_until: null,
        },
        { from: new Date(occurrence.getTime() + 1000) },
      );

      const { error } = await supabase
        .from('tasks')
        .update({
          reminder_last_trigger_at: occurrence.toISOString(),
          reminder_next_trigger_at: nextOccurrence ? nextOccurrence.toISOString() : null,
          reminder_snoozed_until: null,
        })
        .eq('id', task.id);

      if (error) {
        console.error('Unable to update reminder schedule', error);
      }
    },
    [showTaskReminderNotification],
  );

  useEffect(() => {
    const registry = reminderTimeoutsRef.current;

    return () => {
      if (typeof window === 'undefined') {
        return;
      }
      registry.forEach(timeoutId => window.clearTimeout(timeoutId));
      registry.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    const registry = reminderTimeoutsRef.current;
    registry.forEach(timeoutId => {
      window.clearTimeout(timeoutId);
    });
    registry.clear();

    const triggered = triggeredRemindersRef.current;

    if (notificationPermission !== 'granted') {
      triggered.clear();
      return;
    }

    const now = new Date();
    const taskIds = new Set(tasks.map(task => task.id));
    triggered.forEach((_signature, id) => {
      if (!taskIds.has(id)) {
        triggered.delete(id);
      }
    });

    tasks.forEach(task => {
      if (task.completed || !shouldScheduleReminder(task)) {
        triggered.delete(task.id);
        return;
      }

      const nextOccurrence = getNextReminderOccurrence(task, { from: now, includeCurrent: true });

      if (!nextOccurrence) {
        triggered.delete(task.id);
        return;
      }

      const signature = nextOccurrence.toISOString();

      const delay = nextOccurrence.getTime() - Date.now();

      if (delay <= 0) {
        if (triggered.get(task.id) !== signature) {
          triggered.set(task.id, signature);
          void handleReminderTriggered(task, nextOccurrence);
        }
        return;
      }

      if (triggered.get(task.id) === signature) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        triggered.set(task.id, signature);
        void handleReminderTriggered(task, nextOccurrence);
        registry.delete(task.id);
      }, delay);

      registry.set(task.id, timeoutId);
    });

    return () => {
      registry.forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      registry.clear();
    };
  }, [handleReminderTriggered, notificationPermission, tasks]);

  const handleToggleTask = useCallback(
    async (id: string, completed: boolean) => {
      const task = tasks.find(currentTask => currentTask.id === id);
      await toggleTaskFn(id, completed);

      if (completed && task) {
        showTaskCompletionNotification(task.title);
      }
    },
    [showTaskCompletionNotification, tasks, toggleTaskFn],
  );

  return {
    notificationPermission,
    requestNotificationPermission,
    handleReminderTriggered,
    handleToggleTask,
  };
}
