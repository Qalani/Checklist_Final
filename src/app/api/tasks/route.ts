import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';
import { normalizeReminderRecurrence } from '@/utils/reminders';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limiter';

const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 10_000;

export async function POST(request: Request) {
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

  const rateLimit = checkRateLimit(userId, 'api/tasks/POST', { maxRequests: 30 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before creating more tasks.' },
      { status: 429, headers: rateLimitHeaders(30, rateLimit) },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const {
    title,
    description,
    priority,
    category,
    category_color: categoryColor,
    order,
    completed,
    due_date: dueDate,
    reminder_minutes_before: reminderMinutesBefore,
    reminder_recurrence: reminderRecurrence,
    reminder_next_trigger_at: reminderNextTriggerAt,
    reminder_snoozed_until: reminderSnoozedUntil,
    reminder_timezone: reminderTimezone,
  } = body as {
    title?: unknown;
    description?: unknown;
    priority?: unknown;
    category?: unknown;
    category_color?: unknown;
    order?: unknown;
    completed?: unknown;
    due_date?: unknown;
    reminder_minutes_before?: unknown;
    reminder_recurrence?: unknown;
    reminder_next_trigger_at?: unknown;
    reminder_snoozed_until?: unknown;
    reminder_timezone?: unknown;
  };

  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Task title is required.' }, { status: 400 });
  }

  if (title.trim().length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `Task title must be ${MAX_TITLE_LENGTH} characters or fewer.` }, { status: 400 });
  }

  if (typeof priority !== 'string' || !['low', 'medium', 'high'].includes(priority)) {
    return NextResponse.json({ error: 'Priority must be low, medium, or high.' }, { status: 400 });
  }

  if (typeof category !== 'string' || !category.trim()) {
    return NextResponse.json({ error: 'Category is required.' }, { status: 400 });
  }

  if (typeof categoryColor !== 'string' || !categoryColor.trim()) {
    return NextResponse.json({ error: 'Category color is required.' }, { status: 400 });
  }

  if (typeof order !== 'number' || !Number.isInteger(order) || order < 0) {
    return NextResponse.json({ error: 'Order must be a non-negative integer.' }, { status: 400 });
  }

  const normalizedDescription =
    typeof description === 'string' && description.trim().length > 0 ? description.trim() : null;

  if (normalizedDescription && normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json({ error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.` }, { status: 400 });
  }

  const normalizedCompleted = typeof completed === 'boolean' ? completed : false;
  let normalizedDueDate: string | null = null;

  if (typeof dueDate === 'string') {
    const parsed = new Date(dueDate);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Due date must be a valid date string.' }, { status: 400 });
    }
    normalizedDueDate = parsed.toISOString();
  } else if (dueDate === null || typeof dueDate === 'undefined') {
    normalizedDueDate = null;
  } else {
    return NextResponse.json({ error: 'Due date must be a string or null.' }, { status: 400 });
  }

  let normalizedReminder: number | null = null;

  if (typeof reminderMinutesBefore === 'number') {
    if (!Number.isFinite(reminderMinutesBefore) || reminderMinutesBefore < 0) {
      return NextResponse.json({ error: 'Reminder must be a positive number of minutes.' }, { status: 400 });
    }
    normalizedReminder = Math.floor(reminderMinutesBefore);
  } else if (reminderMinutesBefore === null || typeof reminderMinutesBefore === 'undefined') {
    normalizedReminder = null;
  } else {
    return NextResponse.json({ error: 'Reminder must be a number or null.' }, { status: 400 });
  }

  if (normalizedReminder !== null && normalizedDueDate === null) {
    return NextResponse.json({ error: 'A due date is required to schedule a reminder.' }, { status: 400 });
  }

  let normalizedRecurrence = null;

  if (typeof reminderRecurrence === 'object' && reminderRecurrence !== null) {
    normalizedRecurrence = normalizeReminderRecurrence(reminderRecurrence as Record<string, unknown>);
    if (!normalizedRecurrence) {
      return NextResponse.json({ error: 'Reminder recurrence must specify a valid pattern.' }, { status: 400 });
    }
    const { monthdays } = reminderRecurrence as { monthdays?: unknown };
    if (Array.isArray(monthdays)) {
      const invalidDay = monthdays.find(
        (d) => !Number.isInteger(d) || (d as number) < 1 || (d as number) > 28,
      );
      if (invalidDay !== undefined) {
        return NextResponse.json(
          { error: 'Month days must be integers between 1 and 28.' },
          { status: 400 },
        );
      }
    }
  } else if (typeof reminderRecurrence !== 'undefined' && reminderRecurrence !== null) {
    return NextResponse.json({ error: 'Reminder recurrence must be an object or null.' }, { status: 400 });
  }

  const parseDateField = (value: unknown, fieldName: string) => {
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${fieldName} must be a valid ISO date string.`);
      }
      return parsed.toISOString();
    }
    if (value === null || typeof value === 'undefined') {
      return null;
    }
    throw new Error(`${fieldName} must be a string or null.`);
  };

  let normalizedNextTrigger: string | null;
  let normalizedSnoozedUntil: string | null;

  try {
    normalizedNextTrigger = parseDateField(reminderNextTriggerAt, 'reminder_next_trigger_at');
    normalizedSnoozedUntil = parseDateField(reminderSnoozedUntil, 'reminder_snoozed_until');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid reminder date provided.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let normalizedTimezone: string | null = null;
  if (typeof reminderTimezone === 'string') {
    const trimmed = reminderTimezone.trim();
    if (trimmed.length > 0) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: trimmed });
        normalizedTimezone = trimmed;
      } catch {
        return NextResponse.json({ error: 'Reminder timezone must be a valid IANA timezone name.' }, { status: 400 });
      }
    }
  } else if (typeof reminderTimezone !== 'undefined' && reminderTimezone !== null) {
    return NextResponse.json({ error: 'Reminder timezone must be a string or null.' }, { status: 400 });
  }

  if (
    (normalizedRecurrence || normalizedNextTrigger || normalizedSnoozedUntil) &&
    (normalizedReminder === null || normalizedDueDate === null)
  ) {
    return NextResponse.json(
      { error: 'Recurring reminders require a due date and reminder offset.' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      title: title.trim(),
      description: normalizedDescription,
      priority,
      category: category.trim(),
      category_color: categoryColor.trim(),
      order,
      completed: normalizedCompleted,
      due_date: normalizedDueDate,
      reminder_minutes_before: normalizedReminder,
      reminder_recurrence: normalizedRecurrence,
      reminder_next_trigger_at: normalizedNextTrigger,
      reminder_snoozed_until: normalizedSnoozedUntil,
      reminder_timezone: normalizedTimezone,
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Unable to save task. Please try again.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ task: data }, { status: 201 });
}
