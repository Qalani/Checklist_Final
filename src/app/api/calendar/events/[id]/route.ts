import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';

function parseOptionalIsoDate(value: unknown, label: string): Date {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be an ISO date string.`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be an ISO date string.`);
  }

  return parsed;
}

export async function PATCH(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 500 });
  }

  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const eventId = segments[segments.length - 1] ?? null;
  if (!eventId) {
    return NextResponse.json({ error: 'Event id is required.' }, { status: 400 });
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

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
    const title = payload.title;
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title must be a non-empty string.' }, { status: 400 });
    }
    updates.title = title.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    const description = payload.description;
    if (description === null || typeof description === 'undefined') {
      updates.description = null;
    } else if (typeof description === 'string') {
      updates.description = description.trim() ? description.trim() : null;
    } else {
      return NextResponse.json({ error: 'Description must be a string or null.' }, { status: 400 });
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'location')) {
    const location = payload.location;
    if (location === null || typeof location === 'undefined') {
      updates.location = null;
    } else if (typeof location === 'string') {
      updates.location = location.trim() ? location.trim() : null;
    } else {
      return NextResponse.json({ error: 'Location must be a string or null.' }, { status: 400 });
    }
  }

  const hasStart = Object.prototype.hasOwnProperty.call(payload, 'start');
  const hasEnd = Object.prototype.hasOwnProperty.call(payload, 'end');

  if (hasStart !== hasEnd) {
    return NextResponse.json(
      { error: 'Both start and end times are required when updating the schedule.' },
      { status: 400 },
    );
  }

  if (hasStart && hasEnd) {
    try {
      const startDate = parseOptionalIsoDate(payload.start, 'start');
      const endDate = parseOptionalIsoDate(payload.end, 'end');

      if (endDate.getTime() < startDate.getTime()) {
        return NextResponse.json({ error: 'End time must be on or after the start time.' }, { status: 400 });
      }

      updates.start_time = startDate.toISOString();
      updates.end_time = endDate.toISOString();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid start or end date provided.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'allDay')) {
    const allDay = payload.allDay;
    if (typeof allDay !== 'boolean') {
      return NextResponse.json({ error: 'allDay must be a boolean.' }, { status: 400 });
    }
    updates.all_day = allDay;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Provide at least one field to update.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('calendar_events')
    .update(updates)
    .eq('id', eventId)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Unable to update event. Please try again.' },
      { status: 400 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  return NextResponse.json({ event: data });
}
