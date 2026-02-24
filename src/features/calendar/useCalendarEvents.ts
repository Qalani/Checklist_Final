'use client';

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { CalendarEvent } from '@/types';

export interface CreateCalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
}

export interface UpdateCalendarEventInput {
  title?: string;
  description?: string | null;
  location?: string | null;
  start?: string;
  end?: string;
  allDay?: boolean;
}

export interface ImportCalendarEventsResult {
  imported: number;
  updated: number;
  processed: number;
  truncated: number;
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVENTS = 500;

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeSourceName(name: string | null | undefined): string {
  if (!name) return 'ics-import';
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : 'ics-import';
}

export function useCalendarEvents(userId: string | null) {
  const createEvent = useCallback(
    async (input: CreateCalendarEventInput): Promise<CalendarEvent> => {
      if (!userId) {
        throw new Error('You must be signed in to create events.');
      }

      if (!input.title?.trim()) {
        throw new Error('Event title is required.');
      }

      const startDate = new Date(input.start);
      const endDate = new Date(input.end);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('start and end must be valid ISO date strings.');
      }

      if (endDate.getTime() < startDate.getTime()) {
        throw new Error('End time must be on or after the start time.');
      }

      const { data, error } = await supabase
        .from('calendar_events')
        .insert({
          user_id: userId,
          title: input.title.trim(),
          description:
            typeof input.description === 'string' && input.description.trim()
              ? input.description.trim()
              : null,
          location:
            typeof input.location === 'string' && input.location.trim()
              ? input.location.trim()
              : null,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          all_day: typeof input.allDay === 'boolean' ? input.allDay : false,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Unable to create event.');
      }

      return data as CalendarEvent;
    },
    [userId],
  );

  const updateEvent = useCallback(
    async (eventId: string, updates: UpdateCalendarEventInput): Promise<CalendarEvent> => {
      if (!userId) {
        throw new Error('You must be signed in to update events.');
      }

      const dbUpdates: Record<string, unknown> = {};

      if (updates.title !== undefined) {
        if (!updates.title?.trim()) {
          throw new Error('Title must be a non-empty string.');
        }
        dbUpdates.title = updates.title.trim();
      }

      if ('description' in updates) {
        dbUpdates.description =
          typeof updates.description === 'string' && updates.description.trim()
            ? updates.description.trim()
            : null;
      }

      if ('location' in updates) {
        dbUpdates.location =
          typeof updates.location === 'string' && updates.location.trim()
            ? updates.location.trim()
            : null;
      }

      const hasStart = updates.start !== undefined;
      const hasEnd = updates.end !== undefined;

      if (hasStart !== hasEnd) {
        throw new Error('Both start and end times are required when updating the schedule.');
      }

      if (hasStart && hasEnd) {
        const startDate = new Date(updates.start!);
        const endDate = new Date(updates.end!);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error('start and end must be valid ISO date strings.');
        }

        if (endDate.getTime() < startDate.getTime()) {
          throw new Error('End time must be on or after the start time.');
        }

        dbUpdates.start_time = startDate.toISOString();
        dbUpdates.end_time = endDate.toISOString();
      }

      if (updates.allDay !== undefined) {
        dbUpdates.all_day = updates.allDay;
      }

      if (Object.keys(dbUpdates).length === 0) {
        throw new Error('Provide at least one field to update.');
      }

      const { data, error } = await supabase
        .from('calendar_events')
        .update(dbUpdates)
        .eq('id', eventId)
        .eq('user_id', userId)
        .select()
        .maybeSingle();

      if (error) {
        throw new Error(error.message || 'Unable to update event. Please try again.');
      }

      if (!data) {
        throw new Error('Event not found.');
      }

      return data as CalendarEvent;
    },
    [userId],
  );

  const importFromIcs = useCallback(
    async (file: File): Promise<ImportCalendarEventsResult> => {
      if (!userId) {
        throw new Error('You must be signed in to import events.');
      }

      const icsString = await file.text();

      if (!icsString.trim()) {
        throw new Error('The uploaded file was empty.');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ICAL: any;
      try {
        ICAL = await import('ical.js');
      } catch {
        throw new Error('Unable to process calendar file. Please try again later.');
      }

      let parsed: unknown;
      try {
        parsed = ICAL.parse(icsString);
      } catch {
        throw new Error('Unable to parse the provided .ics file.');
      }

      const component = new ICAL.Component(parsed);
      const vevents = component.getAllSubcomponents('vevent');

      if (!vevents || vevents.length === 0) {
        throw new Error('No events were found in this file.');
      }

      const sourceName = sanitizeSourceName(file.name);

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

      const candidateRecords: CalendarEventRow[] = [];

      for (const vevent of vevents) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const event = new ICAL.Event(vevent as any);
          if (!event.startDate) continue;

          const startJs = event.startDate.toJSDate() as Date;
          if (isNaN(startJs.getTime())) continue;

          let endJs: Date | null = null;
          if (event.endDate) {
            endJs = event.endDate.toJSDate() as Date;
          } else if (event.duration) {
            const endClone = event.startDate.clone();
            endClone.addDuration(event.duration);
            endJs = endClone.toJSDate() as Date;
          }

          if (!endJs || isNaN(endJs.getTime())) {
            endJs = new Date(
              startJs.getTime() + (event.startDate.isDate ? ONE_DAY_MS : THIRTY_MINUTES_MS),
            );
          }

          if (endJs.getTime() <= startJs.getTime()) {
            endJs = new Date(
              startJs.getTime() + (event.startDate.isDate ? ONE_DAY_MS : THIRTY_MINUTES_MS),
            );
          }

          const uidBase =
            (event.uid as string | undefined) ||
            `${(event.summary as string | undefined) || ''}:${event.startDate.toString()}:${event.endDate?.toString() ?? ''}`;
          const uid = await sha256Hex(uidBase);

          candidateRecords.push({
            user_id: userId,
            title: normalizeText(event.summary as string | undefined) ?? 'Imported event',
            description: normalizeText(event.description as string | undefined),
            location: normalizeText(event.location as string | undefined),
            start_time: startJs.toISOString(),
            end_time: endJs.toISOString(),
            all_day: Boolean(event.startDate.isDate),
            import_source: sourceName,
            import_uid: uid,
          });
        } catch {
          // skip invalid events
        }
      }

      if (candidateRecords.length === 0) {
        throw new Error('No valid events were found in this file.');
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

      const importUids = records.map((r) => r.import_uid);

      let existingUids = new Set<string>();
      if (importUids.length > 0) {
        const { data: existingRows, error: existingError } = await supabase
          .from('calendar_events')
          .select('import_uid')
          .eq('user_id', userId)
          .eq('import_source', sourceName)
          .in('import_uid', importUids);

        if (existingError) {
          throw new Error('Unable to import events right now. Please try again later.');
        }

        existingUids = new Set((existingRows ?? []).map((row) => row.import_uid as string));
      }

      const createdCount = records.filter((r) => !existingUids.has(r.import_uid)).length;
      const updatedCount = records.length - createdCount;

      const { error: upsertError } = await supabase
        .from('calendar_events')
        .upsert(records, { onConflict: 'user_id,import_source,import_uid' });

      if (upsertError) {
        throw new Error(upsertError.message || 'Unable to save imported events. Please try again.');
      }

      return {
        imported: createdCount,
        updated: updatedCount,
        processed: records.length,
        truncated: originalCount - records.length,
      };
    },
    [userId],
  );

  return { createEvent, updateEvent, importFromIcs };
}
