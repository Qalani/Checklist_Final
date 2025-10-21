'use client';

import { useCallback, useEffect, useMemo } from 'react';
import useSWR, { type KeyedMutator } from 'swr';
import { supabase } from '@/lib/supabase';
import type { CalendarEventRecord, CalendarResponsePayload, CalendarScope } from './types';

interface UseCalendarOptions {
  start: Date;
  end: Date;
  scope: CalendarScope;
  pause?: boolean;
}

interface CalendarDataResult {
  events: CalendarEventRecord[];
  range: { start: string; end: string };
  lastUpdatedAt: string | null;
  isLoading: boolean;
  isValidating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  mutate: KeyedMutator<CalendarResponsePayload>;
}

async function fetchCalendarPayload(
  startIso: string,
  endIso: string,
  scope: CalendarScope,
): Promise<CalendarResponsePayload> {
  const { data: sessionResult } = await supabase.auth.getSession();
  const token = sessionResult.session?.access_token;

  if (!token) {
    throw new Error('You must be signed in to load the calendar.');
  }

  const params = new URLSearchParams({ start: startIso, end: endIso });
  if (scope !== 'all') {
    params.set('scope', scope);
  }

  const response = await fetch(`/api/calendar?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof (payload as { error?: unknown }).error === 'string'
      ? ((payload as { error?: string }).error as string)
      : 'Failed to load calendar data.';
    throw new Error(message);
  }

  return payload as CalendarResponsePayload;
}

export function useCalendarData(userId: string | null, options: UseCalendarOptions): CalendarDataResult {
  const { start, end, scope, pause = false } = options;

  const startIso = useMemo(() => start.toISOString(), [start]);
  const endIso = useMemo(() => end.toISOString(), [end]);

  const rangeValid = start.getTime() <= end.getTime();
  const shouldFetch = Boolean(userId) && !pause && rangeValid;

  const { data, error, isLoading, isValidating, mutate } = useSWR<CalendarResponsePayload>(
    shouldFetch ? ['calendar', userId, startIso, endIso, scope] : null,
    () => fetchCalendarPayload(startIso, endIso, scope),
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (!userId || !shouldFetch) {
      return;
    }

    const tasksChannel = supabase
      .channel(`calendar:tasks:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        void mutate();
      })
      .subscribe();

    const notesChannel = supabase
      .channel(`calendar:notes:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` }, () => {
        void mutate();
      })
      .subscribe();

    const collaboratorsChannel = supabase
      .channel(`calendar:task-collaborators:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_collaborators',
        filter: `user_id=eq.${userId}`,
      }, () => {
        void mutate();
      })
      .subscribe();

    return () => {
      void tasksChannel.unsubscribe();
      void notesChannel.unsubscribe();
      void collaboratorsChannel.unsubscribe();
    };
  }, [mutate, shouldFetch, userId]);

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const events = data?.events ?? [];
  const range = data?.range ?? { start: startIso, end: endIso };

  return {
    events,
    range,
    lastUpdatedAt: data?.generatedAt ?? null,
    isLoading: Boolean(shouldFetch) && (isLoading || (!data && !error)),
    isValidating,
    error: error instanceof Error ? error.message : null,
    refresh,
    mutate,
  };
}
