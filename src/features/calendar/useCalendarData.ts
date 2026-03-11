'use client';

import { useCallback, useEffect, useMemo } from 'react';
import useSWR, { type KeyedMutator } from 'swr';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/local-db';
import { isOnline } from '@/lib/network-status';
import type { Task, Note, ZenReminder, CalendarEvent } from '@/types';
import { getUpcomingReminderOccurrences, shouldScheduleReminder } from '@/utils/reminders';
import type {
  CalendarEventRecord,
  CalendarNoteMetadata,
  CalendarReminderMetadata,
  CalendarResponsePayload,
  CalendarScope,
  CalendarTaskMetadata,
  CalendarUserEventMetadata,
  CalendarZenReminderMetadata,
} from './types';

interface UseCalendarOptions {
  start: Date;
  end: Date;
  scope: CalendarScope;
  pause?: boolean;
}

interface CalendarDataResult {
  events: CalendarEventRecord[];
  range: { start: string; end: string };
  lastUpdatedAt: string | null;
  isLoading: boolean;
  isValidating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  mutate: KeyedMutator<CalendarResponsePayload>;
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type AccessRole = 'owner' | 'editor' | 'viewer';

function toIsoString(date: Date): string {
  return new Date(date.getTime()).toISOString();
}

function startOfDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const s = startOfDay(date);
  return new Date(s.getTime() + ONE_DAY_MS);
}

function buildReminderMetadata(task: Task): CalendarReminderMetadata | null {
  const hasReminder =
    typeof task.reminder_minutes_before === 'number' ||
    Boolean(task.reminder_recurrence) ||
    Boolean(task.reminder_next_trigger_at) ||
    Boolean(task.reminder_snoozed_until);

  if (!hasReminder) return null;

  return {
    minutesBefore: task.reminder_minutes_before ?? null,
    recurrence: (task.reminder_recurrence ?? null) as CalendarReminderMetadata['recurrence'],
    nextTriggerAt: task.reminder_next_trigger_at ?? null,
    snoozedUntil: task.reminder_snoozed_until ?? null,
    timezone: task.reminder_timezone ?? null,
  };
}

async function fetchCalendarPayloadOffline(
  userId: string,
  startIso: string,
  endIso: string,
  scope: CalendarScope,
): Promise<CalendarResponsePayload> {
  const [ownedTasks, notes, zenReminders, calendarEvents] = await Promise.all([
    db.tasks.where('user_id').equals(userId).toArray(),
    db.notes.where('user_id').equals(userId).toArray(),
    db.zen_reminders.where('user_id').equals(userId).toArray(),
    db.calendar_events.where('user_id').equals(userId).toArray(),
  ]);

  return buildCalendarPayload(
    userId,
    startIso,
    endIso,
    scope,
    ownedTasks as Task[],
    [],
    notes as Note[],
    zenReminders as ZenReminder[],
    calendarEvents as CalendarEvent[],
  );
}

function buildCalendarPayload(
  userId: string,
  startIso: string,
  endIso: string,
  scope: CalendarScope,
  ownedTasks: Task[],
  sharedTaskRows: { role?: 'owner' | 'editor' | 'viewer' | null; task?: Task | Task[] | null }[],
  notes: Note[],
  zenReminders: ZenReminder[],
  calendarEvents: CalendarEvent[],
): CalendarResponsePayload {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const rangeStartMs = start.getTime();
  const rangeEndMs = end.getTime();

  const tasksById = new Map<string, Task & { access_role?: AccessRole }>();

  ownedTasks.forEach((task) => {
    tasksById.set(task.id, { ...task, access_role: 'owner' });
  });

  sharedTaskRows.forEach((row) => {
    const rawTask = row.task;
    const task = Array.isArray(rawTask) ? rawTask[0] ?? null : rawTask ?? null;
    if (!task) return;
    const current = tasksById.get(task.id);
    if (current && current.user_id === userId) return;
    tasksById.set(task.id, { ...task, access_role: (row.role as AccessRole | null) ?? 'viewer' });
  });

  const events: CalendarEventRecord[] = [];

  const tasks = Array.from(tasksById.values()).filter((task) => {
    if (scope === 'all') return true;
    const isPersonal = task.user_id === userId;
    return scope === 'personal' ? isPersonal : !isPersonal;
  });

  tasks.forEach((task) => {
    const taskScope: 'personal' | 'shared' = task.user_id === userId ? 'personal' : 'shared';
    const accessRole: AccessRole = task.access_role ?? (taskScope === 'personal' ? 'owner' : 'viewer');
    const canEdit = accessRole === 'owner' || accessRole === 'editor';

    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      const dueTime = dueDate.getTime();
      if (!isNaN(dueTime) && dueTime >= rangeStartMs && dueTime <= rangeEndMs) {
        const dueEnd = new Date(dueTime + THIRTY_MINUTES_MS);
        const reminderMetadata = buildReminderMetadata(task);
        const taskMetadata: CalendarTaskMetadata = {
          taskId: task.id,
          accessRole,
          canEdit,
          category: task.category,
          categoryColor: task.category_color,
          dueDate: task.due_date ?? null,
          ...(reminderMetadata ? { reminder: reminderMetadata } : {}),
        };
        events.push({
          id: `task-due_${task.id}_${String(task.due_date).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          entityId: task.id,
          type: 'task_due',
          title: task.title,
          description: task.description ?? null,
          start: toIsoString(dueDate),
          end: toIsoString(dueEnd),
          allDay: false,
          scope: taskScope,
          metadata: taskMetadata,
        });
      }
    }

    if (shouldScheduleReminder(task)) {
      const occurrences = getUpcomingReminderOccurrences(task, { from: start, limit: 12 });
      occurrences.forEach((occurrence) => {
        const occurrenceTime = occurrence.getTime();
        if (occurrenceTime < rangeStartMs || occurrenceTime > rangeEndMs) return;
        const reminderEnd = new Date(occurrenceTime + THIRTY_MINUTES_MS);
        const reminderMetadata = buildReminderMetadata(task);
        const metadata: CalendarTaskMetadata = {
          taskId: task.id,
          accessRole,
          canEdit,
          category: task.category,
          categoryColor: task.category_color,
          dueDate: task.due_date ?? null,
          ...(reminderMetadata ? { reminder: reminderMetadata } : {}),
        };
        events.push({
          id: `task-reminder_${task.id}_${occurrence.toISOString().replace(/[^a-zA-Z0-9_-]/g, '_')}`,
          entityId: task.id,
          type: 'task_reminder',
          title: `${task.title} reminder`,
          description: task.description ?? null,
          start: toIsoString(occurrence),
          end: toIsoString(reminderEnd),
          allDay: false,
          scope: taskScope,
          metadata,
        });
      });
    }
  });

  if (scope !== 'shared') {
    calendarEvents.forEach((calendarEvent) => {
      const startDate = new Date(calendarEvent.start_time);
      const endDateCandidate = new Date(calendarEvent.end_time);
      if (isNaN(startDate.getTime())) return;

      let endDate = endDateCandidate;
      if (isNaN(endDateCandidate.getTime()) || endDateCandidate.getTime() <= startDate.getTime()) {
        endDate = new Date(startDate.getTime() + (calendarEvent.all_day ? ONE_DAY_MS : THIRTY_MINUTES_MS));
      }

      const metadata: CalendarUserEventMetadata = {
        eventId: calendarEvent.id,
        canEdit: true,
        location: calendarEvent.location ?? null,
        importSource: calendarEvent.import_source ?? null,
        importUid: calendarEvent.import_uid ?? null,
        createdAt: calendarEvent.created_at ?? null,
        updatedAt: calendarEvent.updated_at ?? null,
      };

      events.push({
        id: `event_${calendarEvent.id}_${String(calendarEvent.start_time).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        entityId: calendarEvent.id,
        type: 'event',
        title: calendarEvent.title,
        description: calendarEvent.description ?? null,
        start: toIsoString(startDate),
        end: toIsoString(endDate),
        allDay: Boolean(calendarEvent.all_day),
        scope: 'personal',
        metadata,
      });
    });
  }

  notes.forEach((note) => {
    const timestamp = note.updated_at ?? note.created_at;
    if (!timestamp) return;
    const noteDate = new Date(timestamp);
    const noteTime = noteDate.getTime();
    if (isNaN(noteTime) || noteTime < rangeStartMs || noteTime > rangeEndMs) return;

    const noteStart = startOfDay(noteDate);
    const noteEnd = endOfDay(noteDate);
    const noteMetadata: CalendarNoteMetadata = {
      noteId: note.id,
      updatedAt: note.updated_at ?? null,
      createdAt: note.created_at ?? null,
    };

    events.push({
      id: `note_${note.id}_${noteStart.toISOString().replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      entityId: note.id,
      type: 'note',
      title: note.title,
      description: (note as unknown as { summary?: string | null }).summary ?? null,
      start: toIsoString(noteStart),
      end: toIsoString(noteEnd),
      allDay: true,
      scope: 'personal',
      metadata: noteMetadata,
    });
  });

  zenReminders.forEach((reminder) => {
    const remindDate = reminder.remind_at ? new Date(reminder.remind_at) : null;
    if (!remindDate) return;
    const remindTime = remindDate.getTime();
    if (isNaN(remindTime) || remindTime < rangeStartMs || remindTime > rangeEndMs) return;

    const remindEnd = new Date(remindTime + THIRTY_MINUTES_MS);
    const reminderMetadata: CalendarZenReminderMetadata = {
      reminderId: reminder.id,
      timezone: reminder.timezone ?? null,
      createdAt: reminder.created_at ?? null,
      updatedAt: reminder.updated_at ?? null,
    };

    events.push({
      id: `zen-reminder_${reminder.id}_${String(reminder.remind_at).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      entityId: reminder.id,
      type: 'zen_reminder',
      title: reminder.title,
      description: reminder.description ?? null,
      start: toIsoString(remindDate),
      end: toIsoString(remindEnd),
      allDay: false,
      scope: 'personal',
      metadata: reminderMetadata,
    });
  });

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return {
    range: { start: toIsoString(start), end: toIsoString(end) },
    events,
    generatedAt: new Date().toISOString(),
  };
}

async function fetchCalendarPayload(
  userId: string,
  startIso: string,
  endIso: string,
  scope: CalendarScope,
): Promise<CalendarResponsePayload> {
  if (!isOnline()) {
    return fetchCalendarPayloadOffline(userId, startIso, endIso, scope);
  }

  const start = new Date(startIso);
  const end = new Date(endIso);
  const rangeStartMs = start.getTime();
  const rangeEndMs = end.getTime();

  const [ownedTasksResult, sharedTasksResult, notesResult, remindersResult, calendarEventsResult] =
    await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', userId),
      supabase.from('task_collaborators').select('role, task:tasks(*)').eq('user_id', userId),
      supabase.from('notes').select('*').eq('user_id', userId),
      supabase.from('zen_reminders').select('*').eq('user_id', userId),
      supabase.from('calendar_events').select('*').eq('user_id', userId),
    ]);

  if (ownedTasksResult.error) throw new Error(ownedTasksResult.error.message);
  if (sharedTasksResult.error) throw new Error(sharedTasksResult.error.message);
  if (notesResult.error) throw new Error(notesResult.error.message);
  if (remindersResult.error) throw new Error(remindersResult.error.message);
  if (calendarEventsResult.error) throw new Error(calendarEventsResult.error.message);

  type SharedTaskRow = { role?: 'owner' | 'editor' | 'viewer' | null; task?: Task | Task[] | null };

  return buildCalendarPayload(
    userId,
    startIso,
    endIso,
    scope,
    (ownedTasksResult.data ?? []) as Task[],
    (sharedTasksResult.data ?? []) as SharedTaskRow[],
    (notesResult.data ?? []) as Note[],
    (remindersResult.data ?? []) as ZenReminder[],
    (calendarEventsResult.data ?? []) as CalendarEvent[],
  );
}

export function useCalendarData(userId: string | null, options: UseCalendarOptions): CalendarDataResult {
  const { start, end, scope, pause = false } = options;

  const startIso = useMemo(() => start.toISOString(), [start]);
  const endIso = useMemo(() => end.toISOString(), [end]);

  const rangeValid = start.getTime() <= end.getTime();
  const shouldFetch = Boolean(userId) && !pause && rangeValid;

  const { data, error, isLoading, isValidating, mutate } = useSWR<CalendarResponsePayload>(
    shouldFetch ? ['calendar', userId, startIso, endIso, scope] : null,
    () => fetchCalendarPayload(userId!, startIso, endIso, scope),
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (!userId || !shouldFetch) return;

    const tasksChannel = supabase
      .channel(`calendar:tasks:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        void mutate();
      })
      .subscribe();

    const notesChannel = supabase
      .channel(`calendar:notes:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        () => { void mutate(); },
      )
      .subscribe();

    const collaboratorsChannel = supabase
      .channel(`calendar:task-collaborators:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_collaborators', filter: `user_id=eq.${userId}` },
        () => { void mutate(); },
      )
      .subscribe();

    const calendarEventsChannel = supabase
      .channel(`calendar:user-events:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events', filter: `user_id=eq.${userId}` },
        () => { void mutate(); },
      )
      .subscribe();

    return () => {
      void tasksChannel.unsubscribe();
      void notesChannel.unsubscribe();
      void collaboratorsChannel.unsubscribe();
      void calendarEventsChannel.unsubscribe();
    };
  }, [mutate, shouldFetch, userId]);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const events = data?.events ?? [];
  const range = data?.range ?? { start: startIso, end: endIso };

  return {
    events,
    range,
    lastUpdatedAt: data?.generatedAt ?? null,
    isLoading: Boolean(shouldFetch) && (isLoading || (!data && !error)),
    isValidating,
    error: error instanceof Error ? error.message : null,
    refresh,
    mutate,
  };
}
