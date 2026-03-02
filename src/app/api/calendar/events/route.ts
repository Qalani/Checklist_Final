import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limiter';
import { withTimeout, TimeoutError } from '@/lib/api/with-timeout';

export const runtime = 'nodejs';
export const maxDuration = 30;

const QUERY_TIMEOUT_MS = 10_000;

const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5_000;
const MAX_LOCATION_LENGTH = 500;

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

  const rateLimit = checkRateLimit(userId, 'api/calendar/events/POST', { maxRequests: 30 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before creating more events.' },
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

  if (title.trim().length > MAX_TITLE_LENGTH) {
    return NextResponse.json({ error: `Event title must be ${MAX_TITLE_LENGTH} characters or fewer.` }, { status: 400 });
  }

  let normalizedDescription: string | null = null;
  if (typeof description === 'string' && description.trim()) {
    normalizedDescription = description.trim();
    if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json({ error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.` }, { status: 400 });
    }
  } else if (typeof description !== 'undefined' && description !== null && description !== '') {
    return NextResponse.json({ error: 'Description must be a string or omitted.' }, { status: 400 });
  }

  let normalizedLocation: string | null = null;
  if (typeof location === 'string' && location.trim()) {
    normalizedLocation = location.trim();
    if (normalizedLocation.length > MAX_LOCATION_LENGTH) {
      return NextResponse.json({ error: `Location must be ${MAX_LOCATION_LENGTH} characters or fewer.` }, { status: 400 });
    }
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

  try {
    const { data, error } = await withTimeout(
      supabaseAdmin
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
        .single(),
      QUERY_TIMEOUT_MS,
    );

    if (error) {
      return NextResponse.json(
        { error: 'Unable to create event. Please try again.' },
        { status: 400 },
      );
    }

    return NextResponse.json({ event: data }, { status: 201 });
  } catch (err) {
    if (err instanceof TimeoutError) {
      return NextResponse.json({ error: 'Request timed out. Please try again.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
