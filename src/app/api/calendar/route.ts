import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';
import type { Task, Note } from '@/types';
import { getUpcomingReminderOccurrences, shouldScheduleReminder } from '@/utils/reminders';
import type {
  CalendarEventRecord,
  CalendarNoteMetadata,
  CalendarReminderMetadata,
  CalendarResponsePayload,
  CalendarScope,
  CalendarTaskMetadata,
} from '@/features/calendar/types';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type AccessRole = Task['access_role'] | 'owner' | 'editor' | 'viewer';

function buildReminderMetadata(task: Task): CalendarReminderMetadata | null {
  const hasReminder =
    typeof task.reminder_minutes_before === 'number' ||
    Boolean(task.reminder_recurrence) ||
    Boolean(task.reminder_next_trigger_at) ||
    Boolean(task.reminder_snoozed_until);

  if (!hasReminder) {
    return null;
  }

  return {
    minutesBefore: task.reminder_minutes_before ?? null,
    recurrence: (task.reminder_recurrence ?? null) as CalendarReminderMetadata['recurrence'],
    nextTriggerAt: task.reminder_next_trigger_at ?? null,
    snoozedUntil: task.reminder_snoozed_until ?? null,
    timezone: task.reminder_timezone ?? null,
  } satisfies CalendarReminderMetadata;
}

function parseDate(input: string | null, label: string): Date | null {
  if (!input) {
    return null;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO date string.`);
  }

  return parsed;
}

function clampRange(start: Date, end: Date): { start: Date; end: Date } {
  if (end.getTime() < start.getTime()) {
    throw new Error('End date must be on or after the start date.');
  }

  return { start, end };
}

function toIsoString(date: Date): string {
  return new Date(date.getTime()).toISOString();
}

function startOfDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const start = startOfDay(date);
  return new Date(start.getTime() + ONE_DAY_MS);
}

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 500 });
  }

  let userId: string;

  try {
    const { user } = await authenticateRequest(request);
    userId = user.id;
  } catch (error) {
    const status = error instanceof Error && 'status' in error ? (error as { status?: number }).status ?? 401 : 401;
    const message = error instanceof Error ? error.message : 'Unauthorized.';
    return NextResponse.json({ error: message }, { status });
  }

  const url = new URL(request.url);
  const params = url.searchParams;

  const now = new Date();
  const startParam = params.get('start');
  const endParam = params.get('end');
  const scopeParam = (params.get('scope') as CalendarScope | null) ?? 'all';

  if (!['all', 'personal', 'shared'].includes(scopeParam)) {
    return NextResponse.json({ error: 'Scope must be all, personal, or shared.' }, { status: 400 });
  }

  let start: Date;
  let end: Date;

  try {
    start = parseDate(startParam, 'start') ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    end = parseDate(endParam, 'end') ?? defaultEnd;
    ({ start, end } = clampRange(start, end));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid date range provided.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const [ownedTasksResult, sharedTasksResult, notesResult] = await Promise.all([
      supabaseAdmin.from('tasks').select('*').eq('user_id', userId),
      supabaseAdmin
        .from('task_collaborators')
        .select('role, task:tasks(*)')
        .eq('user_id', userId),
      supabaseAdmin.from('notes').select('*').eq('user_id', userId),
    ]);

    if (ownedTasksResult.error) {
      throw ownedTasksResult.error;
    }

    if (sharedTasksResult.error) {
      throw sharedTasksResult.error;
    }

    if (notesResult.error) {
      throw notesResult.error;
    }

    const tasksById = new Map<string, Task & { access_role?: AccessRole }>();

    const ownedTasks = (ownedTasksResult.data ?? []) as Task[];
    ownedTasks.forEach((task) => {
      tasksById.set(task.id, { ...task, access_role: 'owner' });
    });

    const sharedTaskRows = (sharedTasksResult.data ?? []) as Array<{
      role?: AccessRole | null;
      task?: Task | null;
    }>;

    sharedTaskRows.forEach((row) => {
      const task = row.task;
      if (!task) {
        return;
      }

      const current = tasksById.get(task.id);
      if (current && current.user_id === userId) {
        return;
      }

      tasksById.set(task.id, {
        ...task,
        access_role: (row.role as AccessRole | null) ?? 'viewer',
      });
    });

    const rangeStartMs = start.getTime();
    const rangeEndMs = end.getTime();

    const events: CalendarEventRecord[] = [];

    const tasks = Array.from(tasksById.values()).filter((task) => {
      if (scopeParam === 'all') {
        return true;
      }
      const isPersonal = task.user_id === userId;
      return scopeParam === 'personal' ? isPersonal : !isPersonal;
    });

    tasks.forEach((task) => {
      const scope: 'personal' | 'shared' = task.user_id === userId ? 'personal' : 'shared';
      const accessRole: AccessRole = task.access_role ?? (scope === 'personal' ? 'owner' : 'viewer');
      const canEdit = accessRole === 'owner' || accessRole === 'editor';

      if (task.due_date) {
        const dueDate = new Date(task.due_date);
        const dueTime = dueDate.getTime();
        if (!Number.isNaN(dueTime) && dueTime >= rangeStartMs && dueTime <= rangeEndMs) {
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
            id: `task-due:${task.id}:${task.due_date}`,
            entityId: task.id,
            type: 'task_due',
            title: task.title,
            description: task.description ?? null,
            start: toIsoString(dueDate),
            end: toIsoString(dueEnd),
            allDay: false,
            scope,
            metadata: taskMetadata,
          });
        }
      }

      if (shouldScheduleReminder(task)) {
        const occurrences = getUpcomingReminderOccurrences(task, { from: start, limit: 12 });
        occurrences.forEach((occurrence) => {
          const occurrenceTime = occurrence.getTime();
          if (occurrenceTime < rangeStartMs || occurrenceTime > rangeEndMs) {
            return;
          }

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
            id: `task-reminder:${task.id}:${occurrence.toISOString()}`,
            entityId: task.id,
            type: 'task_reminder',
            title: `${task.title} reminder`,
            description: task.description ?? null,
            start: toIsoString(occurrence),
            end: toIsoString(reminderEnd),
            allDay: false,
            scope,
            metadata,
          });
        });
      }
    });

    const notes = (notesResult.data ?? []) as Note[];
    notes.forEach((note) => {
      const timestamp = note.updated_at ?? note.created_at;
      if (!timestamp) {
        return;
      }

      const noteDate = new Date(timestamp);
      const noteTime = noteDate.getTime();
      if (Number.isNaN(noteTime) || noteTime < rangeStartMs || noteTime > rangeEndMs) {
        return;
      }

      const noteStart = startOfDay(noteDate);
      const noteEnd = endOfDay(noteDate);

      const noteMetadata = {
        noteId: note.id,
        updatedAt: note.updated_at ?? null,
        createdAt: note.created_at ?? null,
      } satisfies CalendarNoteMetadata;

      events.push({
        id: `note:${note.id}:${noteStart.toISOString()}`,
        entityId: note.id,
        type: 'note',
        title: note.title,
        description: note.summary ?? null,
        start: toIsoString(noteStart),
        end: toIsoString(noteEnd),
        allDay: true,
        scope: 'personal',
        metadata: noteMetadata,
      });
    });

    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const payload: CalendarResponsePayload = {
      range: { start: toIsoString(start), end: toIsoString(end) },
      events,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to load calendar data', error);
    const message =
      error instanceof Error
        ? error.message || 'Unable to load calendar data.'
        : 'Unable to load calendar data.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
