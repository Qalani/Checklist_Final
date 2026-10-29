import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limiter';
import { calendarTimeToDate, CalendarTimezoneError, registerCalendarTimezones } from '@/features/calendar/ics';

export const runtime = 'nodejs';
export const maxDuration = 30;

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 500;
const RECURRING_IMPORT_ERROR = 'Recurring calendar events are not supported. Export individual occurrences and import those instead.';

interface CalendarEventRow {
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  import_source: string;
  import_uid: string;
}

function sanitizeSourceName(name: string | null | undefined): string {
  if (!name) {
    return 'ics-import';
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return 'ics-import';
  }
  return trimmed.slice(0, 120);
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

  const rateLimit = checkRateLimit(userId, 'api/calendar/events/import/POST', { maxRequests: 5 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many import requests. Please wait before importing again.' },
      { status: 429, headers: rateLimitHeaders(5, rateLimit) },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid form data payload.' }, { status: 400 });
  }

  const fileEntry = formData.get('file');

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: 'Upload a .ics file to import.' }, { status: 400 });
  }

  const sourceName = sanitizeSourceName(fileEntry.name);

  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const icsString = buffer.toString('utf8');

  if (!icsString.trim()) {
    return NextResponse.json({ error: 'The uploaded file was empty.' }, { status: 400 });
  }

  let ICAL: any;

  try {
    ICAL = await import('ical.js');
  } catch (error) {
    console.error('Failed to load ical.js for import', error);
    return NextResponse.json({ error: 'Unable to process calendar file. Please try again later.' }, { status: 500 });
  }

  let parsed: unknown;
  try {
    parsed = ICAL.parse(icsString);
  } catch (error) {
    return NextResponse.json({ error: 'Unable to parse the provided .ics file.' }, { status: 400 });
  }

  const component = new ICAL.Component(parsed);
  try {
    registerCalendarTimezones(component, ICAL);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof CalendarTimezoneError ? error.message : 'Unable to read timezones in this calendar file.',
    }, { status: 400 });
  }
  const vevents = component.getAllSubcomponents('vevent');

  if (!vevents || vevents.length === 0) {
    return NextResponse.json({ error: 'No events were found in this file.' }, { status: 400 });
  }
  if (vevents.some((vevent: any) => ['rrule', 'rdate', 'recurrence-id'].some((name) => vevent.getFirstProperty?.(name)))) {
    return NextResponse.json({ error: RECURRING_IMPORT_ERROR }, { status: 400 });
  }

  const candidateRecords: CalendarEventRow[] = [];

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      if (!event.startDate) {
        continue;
      }

      const startProperty = vevent.getFirstProperty?.('dtstart');
      const endProperty = vevent.getFirstProperty?.('dtend') ?? startProperty;
      const startJs = calendarTimeToDate(event.startDate, startProperty);
      if (Number.isNaN(startJs.getTime())) {
        continue;
      }

      let endJs: Date | null = null;
      if (event.endDate) {
        endJs = calendarTimeToDate(event.endDate, endProperty);
      } else if (event.duration) {
        const endClone = event.startDate.clone();
        endClone.addDuration(event.duration);
        endJs = calendarTimeToDate(endClone, startProperty);
      }

      if (!endJs || Number.isNaN(endJs.getTime())) {
        endJs = new Date(startJs.getTime() + (event.startDate.isDate ? ONE_DAY_MS : THIRTY_MINUTES_MS));
      }

      if (endJs.getTime() <= startJs.getTime()) {
        endJs = new Date(startJs.getTime() + (event.startDate.isDate ? ONE_DAY_MS : THIRTY_MINUTES_MS));
      }

      const uidBase = event.uid || `${event.summary || ''}:${event.startDate.toString()}:${event.endDate?.toString() ?? ''}`;
      const uid = createHash('sha256').update(uidBase).digest('hex');

      candidateRecords.push({
        user_id: userId,
        title: normalizeText(event.summary) ?? 'Imported event',
        description: normalizeText(event.description),
        location: normalizeText(event.location),
        start_time: startJs.toISOString(),
        end_time: endJs.toISOString(),
        all_day: Boolean(event.startDate.isDate),
        import_source: sourceName,
        import_uid: uid,
      });
    } catch (error) {
      if (error instanceof CalendarTimezoneError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      console.warn('Skipped invalid event during import', error);
    }
  }

  if (candidateRecords.length === 0) {
    return NextResponse.json({ error: 'No valid events were found in this file.' }, { status: 400 });
  }

  const uniqueRecordsMap = new Map<string, CalendarEventRow>();
  candidateRecords.forEach((record) => {
    uniqueRecordsMap.set(record.import_uid, record);
  });

  let records = Array.from(uniqueRecordsMap.values());
  const originalCount = records.length;

  if (records.length > MAX_EVENTS) {
    records = records.slice(0, MAX_EVENTS);
  }

  const importUids = records.map((record) => record.import_uid);

  const existingIds = new Map<string, string>();
  if (importUids.length > 0) {
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('calendar_events')
      .select('id, import_uid')
      .eq('user_id', userId)
      .eq('import_source', sourceName)
      .in('import_uid', importUids);

    if (existingError) {
      console.error('Failed to check existing calendar events', existingError);
      return NextResponse.json(
        { error: 'Unable to import events right now. Please try again later.' },
        { status: 500 },
      );
    }

    (existingRows ?? []).forEach((row) => {
      existingIds.set(row.import_uid as string, row.id as string);
    });
  }

  const createdCount = records.filter((record) => !existingIds.has(record.import_uid)).length;
  const updatedCount = records.length - createdCount;

  const recordsWithIds = records.map((record) => ({
    ...record,
    id: existingIds.get(record.import_uid) ?? randomUUID(),
  }));
  const { error: upsertError } = await supabaseAdmin
    .from('calendar_events')
    .upsert(recordsWithIds, { onConflict: 'id' });

  if (upsertError) {
    console.error('Failed to upsert imported events', upsertError);
    return NextResponse.json(
      { error: upsertError.message || 'Unable to save imported events. Please try again.' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    imported: createdCount,
    updated: updatedCount,
    processed: records.length,
    truncated: originalCount - records.length,
  });
}
