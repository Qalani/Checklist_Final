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

async function getAccessToken(): Promise<string> {
  const { data: sessionResult } = await supabase.auth.getSession();
  const token = sessionResult.session?.access_token;
  if (!token) {
    throw new Error('You must be signed in to manage calendar events.');
  }
  return token;
}

export function useCalendarEvents(userId: string | null) {
  const createEvent = useCallback(
    async (input: CreateCalendarEventInput): Promise<CalendarEvent> => {
      if (!userId) {
        throw new Error('You must be signed in to create events.');
      }

      const token = await getAccessToken();
      const response = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof (payload as { error?: unknown }).error === 'string'
          ? ((payload as { error?: string }).error as string)
          : 'Unable to create event.';
        throw new Error(message);
      }

      const event =
        payload && typeof payload === 'object'
          ? ((payload as { event?: CalendarEvent }).event as CalendarEvent | undefined)
          : undefined;

      if (!event) {
        throw new Error('Event could not be created.');
      }

      return event;
    },
    [userId],
  );

  const updateEvent = useCallback(
    async (eventId: string, updates: UpdateCalendarEventInput): Promise<CalendarEvent> => {
      if (!userId) {
        throw new Error('You must be signed in to update events.');
      }

      const token = await getAccessToken();
      const response = await fetch(`/api/calendar/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof (payload as { error?: unknown }).error === 'string'
          ? ((payload as { error?: string }).error as string)
          : 'Unable to update event.';
        throw new Error(message);
      }

      const event =
        payload && typeof payload === 'object'
          ? ((payload as { event?: CalendarEvent }).event as CalendarEvent | undefined)
          : undefined;

      if (!event) {
        throw new Error('Event could not be updated.');
      }

      return event;
    },
    [userId],
  );

  const importFromIcs = useCallback(
    async (file: File): Promise<ImportCalendarEventsResult> => {
      if (!userId) {
        throw new Error('You must be signed in to import events.');
      }

      const token = await getAccessToken();
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/calendar/events/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof (payload as { error?: unknown }).error === 'string'
          ? ((payload as { error?: string }).error as string)
          : 'Unable to import events.';
        throw new Error(message);
      }

      return (payload as ImportCalendarEventsResult) ?? {
        imported: 0,
        updated: 0,
        processed: 0,
        truncated: 0,
      };
    },
    [userId],
  );

  return { createEvent, updateEvent, importFromIcs };
}
