import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { ZenReminder } from '@/types';

export type ZenRemindersStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ZenRemindersState {
  status: ZenRemindersStatus;
  syncing: boolean;
  reminders: ZenReminder[];
  error: string | null;
}

const INITIAL_STATE: ZenRemindersState = {
  status: 'idle',
  syncing: false,
  reminders: [],
  error: null,
};

interface ErrorResult {
  error: string;
}

interface ZenReminderRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  remind_at: string;
  timezone: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CreateReminderInput {
  title: string;
  description?: string;
  remindAt: string | Date;
  timezone?: string | null;
}

interface UpdateReminderInput {
  title?: string;
  description?: string | null;
  remindAt?: string | Date;
  timezone?: string | null;
}

export interface UseZenRemindersResult extends ZenRemindersState {
  createReminder: (input: CreateReminderInput) => Promise<{ reminder: ZenReminder } | ErrorResult | void>;
  updateReminder: (id: string, input: UpdateReminderInput) => Promise<{ reminder: ZenReminder } | ErrorResult | void>;
  deleteReminder: (id: string) => Promise<void | ErrorResult>;
  refresh: (force?: boolean) => Promise<void>;
}

function extractErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'object' && 'message' in (error as Record<string, unknown>)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
}

function mapRowToReminder(row: ZenReminderRow): ZenReminder {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description ?? undefined,
    remind_at: row.remind_at,
    timezone: row.timezone ?? undefined,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
  } satisfies ZenReminder;
}

function normalizeDateInput(input: string | Date): string {
  if (input instanceof Date) {
    const timestamp = input.getTime();
    if (Number.isNaN(timestamp)) {
      throw new Error('Invalid reminder date provided.');
    }
    return new Date(timestamp).toISOString();
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid reminder date provided.');
  }
  return parsed.toISOString();
}

export async function fetchZenReminders(userId: string): Promise<ZenReminder[]> {
  const { data, error } = await supabase
    .from('zen_reminders')
    .select('*')
    .eq('user_id', userId)
    .order('remind_at', { ascending: true })
    .returns<ZenReminderRow[]>();

  if (error) {
    throw new Error(error.message || 'Failed to load reminders.');
  }

  const rows = data ?? [];
  return rows.map(mapRowToReminder);
}

export function useZenReminders(userId: string | null): UseZenRemindersResult {
  const [state, setState] = useState<ZenRemindersState>(INITIAL_STATE);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const remindersRef = useRef<ZenReminder[]>(INITIAL_STATE.reminders);

  useEffect(() => {
    remindersRef.current = state.reminders;
  }, [state.reminders]);

  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      const channel = channelRef.current;
      channelRef.current = null;
      void channel.unsubscribe();
    }
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
    currentUserIdRef.current = null;
    cleanupChannel();
  }, [cleanupChannel]);

  const runRefresh = useCallback(
    async (force = false) => {
      if (!userId) {
        return;
      }

      if (refreshPromiseRef.current && !force) {
        return refreshPromiseRef.current;
      }

      const performRefresh = async () => {
        setState(prev => ({
          ...prev,
          syncing: true,
          status: prev.status === 'idle' ? 'loading' : prev.status,
          error: prev.status === 'error' ? prev.error : null,
        }));

        try {
          const reminders = await fetchZenReminders(userId);
          setState({
            status: 'ready',
            syncing: false,
            reminders,
            error: null,
          });
        } catch (error) {
          const message = extractErrorMessage(error, 'Failed to load your reminders.');
          setState(prev => ({
            ...prev,
            syncing: false,
            status: prev.status === 'idle' ? 'error' : prev.status,
            error: message,
          }));
        }
      };

      refreshPromiseRef.current = performRefresh().finally(() => {
        refreshPromiseRef.current = null;
      });

      return refreshPromiseRef.current;
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }

    if (currentUserIdRef.current === userId && state.status !== 'idle') {
      return;
    }

    currentUserIdRef.current = userId;
    void runRefresh(true);
  }, [reset, runRefresh, state.status, userId]);

  useEffect(() => {
    cleanupChannel();

    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`zen_reminders:user:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'zen_reminders', filter: `user_id=eq.${userId}` },
        payload => {
          setState(prev => {
            const reminders = remindersRef.current;

            if (payload.eventType === 'DELETE') {
              const removedId = (payload.old as ZenReminderRow | null)?.id;
              if (!removedId) {
                return prev;
              }
              const filtered = reminders.filter(reminder => reminder.id !== removedId);
              remindersRef.current = filtered;
              return { ...prev, reminders: filtered };
            }

            const row = payload.new as ZenReminderRow | null;
            if (!row) {
              return prev;
            }

            const mapped = mapRowToReminder(row);
            const existingIndex = reminders.findIndex(reminder => reminder.id === mapped.id);
            let nextReminders: ZenReminder[];
            if (existingIndex >= 0) {
              nextReminders = [...reminders];
              nextReminders[existingIndex] = mapped;
            } else {
              nextReminders = [...reminders, mapped];
            }
            nextReminders.sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
            remindersRef.current = nextReminders;
            return { ...prev, reminders: nextReminders };
          });
        },
      );

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      cleanupChannel();
    };
  }, [cleanupChannel, userId]);

  const createReminder = useCallback<UseZenRemindersResult['createReminder']>(
    async (input) => {
      if (!userId) {
        return { error: 'You must be signed in to create reminders.' };
      }

      if (!input.title.trim()) {
        return { error: 'Reminders need a clear title.' };
      }

      let remindAtISO: string;
      try {
        remindAtISO = normalizeDateInput(input.remindAt);
      } catch (error) {
        return { error: extractErrorMessage(error, 'Please provide a valid reminder time.') };
      }

      const payload = {
        user_id: userId,
        title: input.title.trim(),
        description: input.description?.trim() ? input.description.trim() : null,
        remind_at: remindAtISO,
        timezone: input.timezone ?? null,
      };

      const { data, error } = await supabase
        .from('zen_reminders')
        .insert(payload)
        .select('*')
        .single();

      if (error) {
        const message = error.message || 'Unable to create reminder.';
        return { error: message };
      }

      const mapped = mapRowToReminder(data as ZenReminderRow);
      setState(prev => {
        const next = [...prev.reminders, mapped];
        next.sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
        remindersRef.current = next;
        return { ...prev, reminders: next };
      });

      return { reminder: mapped };
    },
    [userId],
  );

  const updateReminder = useCallback<UseZenRemindersResult['updateReminder']>(
    async (id, input) => {
      if (!userId) {
        return { error: 'You must be signed in to update reminders.' };
      }

      const updates: Record<string, unknown> = {};
      if (typeof input.title === 'string') {
        updates.title = input.title.trim();
      }
      if (typeof input.description !== 'undefined') {
        updates.description = input.description?.trim() ? input.description.trim() : null;
      }
      if (typeof input.timezone !== 'undefined') {
        updates.timezone = input.timezone ?? null;
      }
      if (typeof input.remindAt !== 'undefined') {
        try {
          updates.remind_at = normalizeDateInput(input.remindAt);
        } catch (error) {
          return { error: extractErrorMessage(error, 'Please provide a valid reminder time.') };
        }
      }

      if (Object.keys(updates).length === 0) {
        return;
      }

      const { data, error } = await supabase
        .from('zen_reminders')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) {
        const message = error.message || 'Unable to update reminder.';
        return { error: message };
      }

      const mapped = mapRowToReminder(data as ZenReminderRow);
      setState(prev => {
        const index = prev.reminders.findIndex(reminder => reminder.id === mapped.id);
        if (index === -1) {
          return prev;
        }
        const next = [...prev.reminders];
        next[index] = mapped;
        next.sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
        remindersRef.current = next;
        return { ...prev, reminders: next };
      });

      return { reminder: mapped };
    },
    [userId],
  );

  const deleteReminder = useCallback<UseZenRemindersResult['deleteReminder']>(
    async (id) => {
      if (!userId) {
        return { error: 'You must be signed in to delete reminders.' };
      }

      const { error } = await supabase
        .from('zen_reminders')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        const message = error.message || 'Unable to delete reminder.';
        return { error: message };
      }

      setState(prev => {
        const filtered = prev.reminders.filter(reminder => reminder.id !== id);
        remindersRef.current = filtered;
        return { ...prev, reminders: filtered };
      });
    },
    [userId],
  );

  return {
    ...state,
    createReminder,
    updateReminder,
    deleteReminder,
    refresh: runRefresh,
  };
}
