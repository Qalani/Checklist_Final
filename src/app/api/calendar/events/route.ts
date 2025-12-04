import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';

export const runtime = 'nodejs';

function parseIsoDate(value: unknown, label: string): Date {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be an ISO date string.`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be an ISO date string.`);
  }

  return parsed;
}

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
    location,
    start,
    end,
    allDay,
  } = body as {
    title?: unknown;
    description?: unknown;
    location?: unknown;
    start?: unknown;
    end?: unknown;
    allDay?: unknown;
  };

  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Event title is required.' }, { status: 400 });
  }

  let normalizedDescription: string | null = null;
  if (typeof description === 'string' && description.trim()) {
    normalizedDescription = description.trim();
  } else if (typeof description !== 'undefined' && description !== null && description !== '') {
    return NextResponse.json({ error: 'Description must be a string or omitted.' }, { status: 400 });
  }

  let normalizedLocation: string | null = null;
  if (typeof location === 'string' && location.trim()) {
    normalizedLocation = location.trim();
  } else if (typeof location !== 'undefined' && location !== null && location !== '') {
    return NextResponse.json({ error: 'Location must be a string or omitted.' }, { status: 400 });
  }

  let startDate: Date;
  let endDate: Date;

  try {
    startDate = parseIsoDate(start, 'start');
    endDate = parseIsoDate(end, 'end');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid start or end date provided.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (endDate.getTime() < startDate.getTime()) {
    return NextResponse.json({ error: 'End time must be on or after the start time.' }, { status: 400 });
  }

  const normalizedAllDay = typeof allDay === 'boolean' ? allDay : false;

  const { data, error } = await supabaseAdmin
    .from('calendar_events')
    .insert({
      user_id: userId,
      title: title.trim(),
      description: normalizedDescription,
      location: normalizedLocation,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      all_day: normalizedAllDay,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Unable to create event. Please try again.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ event: data }, { status: 201 });
}
