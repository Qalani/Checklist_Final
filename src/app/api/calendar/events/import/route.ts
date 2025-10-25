import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';

export const runtime = 'nodejs';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 500;

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
  const vevents = component.getAllSubcomponents('vevent');

  if (!vevents || vevents.length === 0) {
    return NextResponse.json({ error: 'No events were found in this file.' }, { status: 400 });
  }

  const candidateRecords: CalendarEventRow[] = [];

  vevents.forEach((vevent: any) => {
    try {
      const event = new ICAL.Event(vevent);
      if (!event.startDate) {
        return;
      }

      const startJs = event.startDate.toJSDate();
      if (Number.isNaN(startJs.getTime())) {
        return;
      }

      let endJs: Date | null = null;
      if (event.endDate) {
        endJs = event.endDate.toJSDate();
      } else if (event.duration) {
        const endClone = event.startDate.clone();
        endClone.addDuration(event.duration);
        endJs = endClone.toJSDate();
      }

      if (!endJs || Number.isNaN(endJs.getTime())) {
        endJs = new Date(startJs.getTime() + (event.startDate.isDate ? ONE_DAY_MS : THIRTY_MINUTES_MS));
      }

      if (endJs.getTime() <= startJs.getTime()) {
        endJs = new Date(startJs.getTime() + (event.startDate.isDate ? ONE_DAY_MS : THIRTY_MINUTES_MS));
      }

      const uidBase = event.uid || `${event.summary || ''}:${event.startDate.toString()}:${event.endDate?.toString() ?? ''}`;
      const uid = createHash('sha1').update(uidBase).digest('hex');

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
      console.warn('Skipped invalid event during import', error);
    }
  });

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

  let existingUids = new Set<string>();
  if (importUids.length > 0) {
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('calendar_events')
      .select('import_uid')
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

    existingUids = new Set((existingRows ?? []).map((row) => row.import_uid as string));
  }

  const createdCount = records.filter((record) => !existingUids.has(record.import_uid)).length;
  const updatedCount = records.length - createdCount;

  const { error: upsertError } = await supabaseAdmin
    .from('calendar_events')
    .upsert(records, { onConflict: 'user_id,import_source,import_uid' });

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
