import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getUpcomingReminderOccurrences,
  shouldScheduleReminder,
  type ReminderScheduleLike,
  normalizeReminderRecurrence,
} from '@/utils/reminders';
import type {
  CalendarAggregationDay,
  CalendarAggregationResponse,
  CalendarNoteSummary,
  CalendarReminderSummary,
  CalendarTaskSummary,
  CalendarAccessRole,
} from '@/types/calendar';
import type { ReminderRecurrence } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 120;
const MS_PER_DAY = 86_400_000;

interface TaskRow {
  id: string;
  title: string | null;
  description: string | null;
  completed: boolean | null;
  priority: string | null;
  category: string | null;
  category_color: string | null;
  order: number | null;
  due_date: string | null;
  reminder_minutes_before: number | null;
  reminder_recurrence: ReminderRecurrence | Record<string, unknown> | null;
  reminder_next_trigger_at: string | null;
  reminder_last_trigger_at: string | null;
  reminder_snoozed_until: string | null;
  reminder_timezone: string | null;
  created_at: string | null;
  updated_at: string | null;
  user_id: string | null;
}

interface CollaboratorRow {
  role: CalendarAccessRole | null;
  task: TaskRow | null;
}

interface NoteRow {
  id: string;
  title: string | null;
  summary: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function parseDateParam(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function resolveTimeZone(timeZoneParam: string | null): string {
  if (!timeZoneParam) {
    return 'UTC';
  }

  try {
    // Intl.DateTimeFormat will throw if the timezone identifier is invalid
    new Intl.DateTimeFormat('en-US', { timeZone: timeZoneParam }).format(new Date());
    return timeZoneParam;
  } catch (error) {
    console.warn('Invalid timezone requested for calendar aggregation:', timeZoneParam, error);
    return 'UTC';
  }
}

function formatDateKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (error) {
    console.warn('Failed to format date with timezone, falling back to UTC.', { error });
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

function isWithinRange(date: Date, from: Date, to: Date): boolean {
  const time = date.getTime();
  return time >= from.getTime() && time <= to.getTime();
}

function ensureDay(map: Map<string, CalendarAggregationDay>, key: string): CalendarAggregationDay {
  if (!map.has(key)) {
    map.set(key, { date: key, tasks: [], reminders: [], notes: [] });
  }
  return map.get(key)!;
}

function normalizeTaskRow(task: TaskRow, accessRole: CalendarAccessRole): CalendarTaskSummary | null {
  if (!task.id || !task.title) {
    return null;
  }

  const recurrence = normalizeReminderRecurrence(task.reminder_recurrence ?? null);

  return {
    id: task.id,
    title: task.title,
    due_date: task.due_date ?? null,
    completed: Boolean(task.completed),
    category: task.category,
    category_color: task.category_color,
    reminder_minutes_before: task.reminder_minutes_before,
    reminder_recurrence: recurrence,
    reminder_next_trigger_at: task.reminder_next_trigger_at,
    reminder_last_trigger_at: task.reminder_last_trigger_at,
    reminder_snoozed_until: task.reminder_snoozed_until,
    reminder_timezone: task.reminder_timezone,
    access_role: accessRole,
    access: accessRole === 'owner' ? 'personal' : 'shared',
    user_id: task.user_id ?? undefined,
  };
}

function buildReminderSchedule(task: CalendarTaskSummary): ReminderScheduleLike {
  return {
    due_date: task.due_date,
    reminder_minutes_before: task.reminder_minutes_before,
    reminder_recurrence: task.reminder_recurrence,
    reminder_next_trigger_at: task.reminder_next_trigger_at,
    reminder_last_trigger_at: task.reminder_last_trigger_at,
    reminder_snoozed_until: task.reminder_snoozed_until,
    reminder_timezone: task.reminder_timezone,
  } satisfies ReminderScheduleLike;
}

function createReminderSummary(
  task: CalendarTaskSummary,
  occurrence: Date,
): CalendarReminderSummary {
  const reminderId = `${task.id}:${occurrence.toISOString()}`;
  return {
    id: reminderId,
    task_id: task.id,
    title: task.title,
    scheduled_for: occurrence.toISOString(),
    access_role: task.access_role,
    access: task.access,
    timezone: task.reminder_timezone,
    due_date: task.due_date,
    category_color: task.category_color,
  };
}

function normalizeNoteRow(row: NoteRow): CalendarNoteSummary | null {
  if (!row.id || !row.updated_at) {
    return null;
  }

  const updated = new Date(row.updated_at);
  if (Number.isNaN(updated.getTime())) {
    return null;
  }

  return {
    id: row.id,
    title: row.title ?? 'Untitled note',
    summary: row.summary,
    updated_at: updated.toISOString(),
    created_at: row.created_at,
    access: 'personal',
  };
}

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 500 });
  }

  const authorization = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing access token.' }, { status: 401 });
  }

  const accessToken = authorization.slice('Bearer '.length);
  const { data: userResult, error: userError } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !userResult.user) {
    return NextResponse.json({ error: 'Invalid access token.' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const resolvedTimeZone = resolveTimeZone(searchParams.get('timezone'));
  const parsedFrom = parseDateParam(searchParams.get('from'));
  const now = new Date();
  let fromStart = startOfUTC(parsedFrom ?? now);

  const parsedTo = parseDateParam(searchParams.get('to'));
  let toEnd = parsedTo
    ? endOfUTC(parsedTo)
    : endOfUTC(new Date(fromStart.getTime() + (DEFAULT_RANGE_DAYS - 1) * MS_PER_DAY));

  if (toEnd.getTime() < fromStart.getTime()) {
    return NextResponse.json({ error: '`to` date must be on or after the `from` date.' }, { status: 400 });
  }

  const maxDurationMs = MAX_RANGE_DAYS * MS_PER_DAY - 1;
  if (toEnd.getTime() - fromStart.getTime() > maxDurationMs) {
    toEnd = new Date(fromStart.getTime() + maxDurationMs);
  }

  const taskColumns = [
    'id',
    'title',
    'description',
    'completed',
    'priority',
    'category',
    'category_color',
    'order',
    'due_date',
    'reminder_minutes_before',
    'reminder_recurrence',
    'reminder_next_trigger_at',
    'reminder_last_trigger_at',
    'reminder_snoozed_until',
    'reminder_timezone',
    'created_at',
    'updated_at',
    'user_id',
  ];

  const taskSelect = taskColumns.join(',');

  const [ownedTasksResult, sharedTasksResult, notesResult] = await Promise.all([
    supabaseAdmin
      .from('tasks')
      .select(taskSelect)
      .eq('user_id', userResult.user.id)
      .returns<TaskRow[]>(),
    supabaseAdmin
      .from('task_collaborators')
      .select(`role, task:tasks(${taskSelect})`)
      .eq('user_id', userResult.user.id)
      .returns<CollaboratorRow[]>(),
    supabaseAdmin
      .from('notes')
      .select('id,title,summary,created_at,updated_at')
      .eq('user_id', userResult.user.id)
      .gte('updated_at', fromStart.toISOString())
      .lte('updated_at', toEnd.toISOString())
      .returns<NoteRow[]>(),
  ]);

  if (ownedTasksResult.error) {
    return NextResponse.json(
      { error: ownedTasksResult.error.message || 'Unable to load tasks for calendar aggregation.' },
      { status: 500 },
    );
  }

  if (sharedTasksResult.error) {
    return NextResponse.json(
      { error: sharedTasksResult.error.message || 'Unable to load shared tasks for calendar aggregation.' },
      { status: 500 },
    );
  }

  if (notesResult.error) {
    return NextResponse.json(
      { error: notesResult.error.message || 'Unable to load notes for calendar aggregation.' },
      { status: 500 },
    );
  }

  const taskMap = new Map<string, CalendarTaskSummary>();

  for (const task of ownedTasksResult.data ?? []) {
    const normalized = normalizeTaskRow(task, 'owner');
    if (normalized) {
      taskMap.set(normalized.id, normalized);
    }
  }

  for (const collaborator of sharedTasksResult.data ?? []) {
    const task = collaborator.task;
    if (!task) {
      continue;
    }

    if (taskMap.has(task.id)) {
      continue;
    }

    const accessRole: CalendarAccessRole = collaborator.role ?? 'viewer';
    const normalized = normalizeTaskRow(task, accessRole);
    if (normalized) {
      taskMap.set(normalized.id, normalized);
    }
  }

  const aggregatedDays = new Map<string, CalendarAggregationDay>();

  for (const task of taskMap.values()) {
    if (task.due_date) {
      const dueDate = new Date(task.due_date);
      if (!Number.isNaN(dueDate.getTime()) && isWithinRange(dueDate, fromStart, toEnd)) {
        const dateKey = formatDateKey(dueDate, resolvedTimeZone);
        const day = ensureDay(aggregatedDays, dateKey);
        day.tasks.push(task);
      }
    }

    const schedule = buildReminderSchedule(task);
    if (shouldScheduleReminder(schedule)) {
      const occurrences = getUpcomingReminderOccurrences(schedule, {
        from: fromStart,
        limit: 12,
      });

      for (const occurrence of occurrences) {
        if (!isWithinRange(occurrence, fromStart, toEnd)) {
          continue;
        }

        const dateKey = formatDateKey(occurrence, resolvedTimeZone);
        const day = ensureDay(aggregatedDays, dateKey);
        const reminderSummary = createReminderSummary(task, occurrence);

        if (!day.reminders.some((existing) => existing.id === reminderSummary.id)) {
          day.reminders.push(reminderSummary);
        }
      }
    }
  }

  for (const noteRow of notesResult.data ?? []) {
    const normalized = normalizeNoteRow(noteRow);
    if (!normalized) {
      continue;
    }

    const updatedAt = new Date(normalized.updated_at);
    if (!Number.isNaN(updatedAt.getTime()) && isWithinRange(updatedAt, fromStart, toEnd)) {
      const dateKey = formatDateKey(updatedAt, resolvedTimeZone);
      const day = ensureDay(aggregatedDays, dateKey);
      day.notes.push(normalized);
    }
  }

  for (const day of aggregatedDays.values()) {
    day.tasks.sort((a, b) => {
      const timeA = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
      const timeB = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a.title.localeCompare(b.title);
    });

    day.reminders.sort((a, b) => {
      const timeA = new Date(a.scheduled_for).getTime();
      const timeB = new Date(b.scheduled_for).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a.title.localeCompare(b.title);
    });

    day.notes.sort((a, b) => {
      const timeA = new Date(a.updated_at).getTime();
      const timeB = new Date(b.updated_at).getTime();
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return a.title.localeCompare(b.title);
    });
  }

  const days: CalendarAggregationDay[] = Array.from(aggregatedDays.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const response: CalendarAggregationResponse = {
    from: formatDateKey(fromStart, resolvedTimeZone),
    to: formatDateKey(toEnd, resolvedTimeZone),
    timezone: resolvedTimeZone,
    days,
  };

  return NextResponse.json(response);
}
