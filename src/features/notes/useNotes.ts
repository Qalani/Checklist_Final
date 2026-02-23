import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { isOnline, enqueueOp } from '@/lib/offlineSync';
import type { Note } from '@/types';
import { computeNoteMetadata } from './noteUtils';

export type NotesStatus = 'idle' | 'loading' | 'ready' | 'error';

interface NotesState {
  status: NotesStatus;
  syncing: boolean;
  notes: Note[];
  error: string | null;
}

const INITIAL_STATE: NotesState = {
  status: 'idle',
  syncing: false,
  notes: [],
  error: null,
};

interface ErrorResult {
  error: string;
}

interface NoteRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  summary: string | null;
  word_count: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface UseNotesResult extends NotesState {
  createNote: (
    input?: { title?: string; content?: string; timestamp?: string | Date },
  ) => Promise<{ note: Note } | ErrorResult | void>;
  updateNote: (
    id: string,
    input: { title?: string; content?: string },
  ) => Promise<{ note: Note } | ErrorResult | void>;
  deleteNote: (id: string) => Promise<void | ErrorResult>;
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

function mapRowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary ?? undefined,
    word_count: row.word_count ?? undefined,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
    user_id: row.user_id,
  } satisfies Note;
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const aDate = a.updated_at ?? a.created_at ?? '';
    const bDate = b.updated_at ?? b.created_at ?? '';
    return bDate.localeCompare(aDate);
  });
}

export async function fetchNotes(userId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .returns<NoteRow[]>();

  if (error) {
    throw new Error(error.message || 'Unable to load notes.');
  }

  const rows = data ?? [];
  return rows.map((row) => mapRowToNote(row));
}

export function useNotes(userId: string | null): UseNotesResult {
  const [state, setState] = useState<NotesState>(INITIAL_STATE);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const notesRef = useRef<Note[]>(INITIAL_STATE.notes);

  useEffect(() => {
    notesRef.current = state.notes;
  }, [state.notes]);

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
        setState((prev) => ({
          ...prev,
          syncing: true,
          status: prev.status === 'idle' ? 'loading' : prev.status,
          error: prev.status === 'error' ? prev.error : null,
        }));

        // Offline: serve IndexedDB
        if (!isOnline()) {
          try {
            const local = await db.notes.where('user_id').equals(userId).toArray();
            const sorted = sortNotes(local);
            notesRef.current = sorted;
            setState({ status: 'ready', syncing: false, notes: sorted, error: null });
          } catch {
            setState((prev) => ({
              ...prev,
              syncing: false,
              error: 'You are offline and no local notes are available.',
            }));
          }
          return;
        }

        try {
          const notes = await fetchNotes(userId);

          // Persist to IndexedDB in the background
          void (async () => {
            try {
              await db.notes.where('user_id').equals(userId).delete();
              await db.notes.bulkPut(notes.filter((n) => n.user_id === userId));
            } catch {
              // Non-critical
            }
          })();

          notesRef.current = notes;
          setState({ status: 'ready', syncing: false, notes, error: null });
        } catch (networkError) {
          // Fall back to IndexedDB
          try {
            const local = await db.notes.where('user_id').equals(userId).toArray();
            if (local.length > 0) {
              const sorted = sortNotes(local);
              notesRef.current = sorted;
              setState({ status: 'ready', syncing: false, notes: sorted, error: null });
              return;
            }
          } catch {
            // IndexedDB also failed
          }

          const message = extractErrorMessage(networkError, 'Failed to load your notes.');
          setState((prev) => ({
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

    // Show IndexedDB cache immediately before the network request lands
    void (async () => {
      try {
        const local = await db.notes.where('user_id').equals(userId).toArray();
        if (local.length > 0) {
          const sorted = sortNotes(local);
          notesRef.current = sorted;
          setState({ status: 'ready', syncing: true, notes: sorted, error: null });
        }
      } catch {
        // Ignore – runRefresh will set loading state
      }
    })();

    void runRefresh(true);
  }, [reset, runRefresh, state.status, userId]);

  useEffect(() => {
    cleanupChannel();

    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`notes:user:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        (payload) => {
          setState((prev) => {
            const notes = notesRef.current;

            if (payload.eventType === 'DELETE') {
              const removedId = (payload.old as NoteRow | null)?.id;
              if (!removedId) {
                return prev;
              }
              const filtered = notes.filter((note) => note.id !== removedId);
              notesRef.current = filtered;
              void db.notes.delete(removedId).catch(() => {});
              return { ...prev, notes: filtered };
            }

            const row = payload.new as NoteRow | null;
            if (!row) {
              return prev;
            }

            const mapped = mapRowToNote(row);
            void db.notes.put(mapped).catch(() => {});

            const existingIndex = notes.findIndex((note) => note.id === mapped.id);
            let nextNotes: Note[];

            if (existingIndex >= 0) {
              nextNotes = [...notes];
              nextNotes[existingIndex] = mapped;
            } else {
              nextNotes = [mapped, ...notes];
            }

            const sorted = sortNotes(nextNotes);
            notesRef.current = sorted;
            return { ...prev, notes: sorted };
          });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cleanupChannel();
    };
  }, [cleanupChannel, userId]);

  const createNote = useCallback<UseNotesResult['createNote']>(
    async (input = {}) => {
      if (!userId) {
        return { error: 'You must be signed in to create a note.' };
      }

      const draftTitle = input.title?.trim();
      const baseTitle = draftTitle && draftTitle.length > 0 ? draftTitle : 'Untitled document';
      const rawContent = input.content ?? '';
      const timestampInput = input.timestamp;
      let isoTimestamp: string | null = null;

      if (timestampInput instanceof Date) {
        const parsed = new Date(timestampInput.getTime());
        if (!Number.isNaN(parsed.getTime())) {
          isoTimestamp = parsed.toISOString();
        }
      } else if (typeof timestampInput === 'string' && timestampInput.trim().length > 0) {
        const parsed = new Date(timestampInput);
        if (!Number.isNaN(parsed.getTime())) {
          isoTimestamp = parsed.toISOString();
        }
      }

      const { html, summary, wordCount } = computeNoteMetadata(rawContent);
      const noteId = crypto.randomUUID();
      const now = isoTimestamp ?? new Date().toISOString();

      const optimisticNote: Note = {
        id: noteId,
        user_id: userId,
        title: baseTitle,
        content: html,
        summary,
        word_count: wordCount,
        created_at: now,
        updated_at: now,
      };

      // Optimistic state + IndexedDB
      const nextNotes = sortNotes([optimisticNote, ...notesRef.current]);
      notesRef.current = nextNotes;
      setState({ status: 'ready', syncing: false, notes: nextNotes, error: null });
      void db.notes.put(optimisticNote).catch(() => {});

      if (!isOnline()) {
        await enqueueOp({
          userId,
          table: 'notes',
          operation: 'create',
          recordId: noteId,
          data: optimisticNote as unknown as Record<string, unknown>,
          createdAt: Date.now(),
        });
        return { note: optimisticNote };
      }

      const record: Partial<NoteRow> & { id: string; user_id: string } = {
        id: noteId,
        user_id: userId,
        title: baseTitle,
        content: html,
        summary,
        word_count: wordCount,
      };

      if (isoTimestamp) {
        record.created_at = isoTimestamp;
        record.updated_at = isoTimestamp;
      }

      const { data, error } = await supabase
        .from('notes')
        .insert(record)
        .select()
        .single<NoteRow>();

      if (error) {
        await enqueueOp({
          userId,
          table: 'notes',
          operation: 'create',
          recordId: noteId,
          data: optimisticNote as unknown as Record<string, unknown>,
          createdAt: Date.now(),
        });
        return { note: optimisticNote };
      }

      const note = mapRowToNote(data);
      void db.notes.put(note).catch(() => {});

      const refreshed = sortNotes(notesRef.current.map((n) => (n.id === noteId ? note : n)));
      notesRef.current = refreshed;
      setState({ status: 'ready', syncing: false, notes: refreshed, error: null });

      return { note };
    },
    [userId],
  );

  const updateNote = useCallback<UseNotesResult['updateNote']>(
    async (id, input) => {
      if (!userId) {
        return { error: 'You must be signed in to update a note.' };
      }

      if (!id) {
        return { error: 'Missing note identifier.' };
      }

      const updates: Partial<NoteRow> = {};

      if (typeof input.title === 'string') {
        const nextTitle = input.title.trim();
        updates.title = nextTitle.length > 0 ? nextTitle : 'Untitled document';
      }

      if (typeof input.content === 'string') {
        const { html, summary, wordCount } = computeNoteMetadata(input.content);
        updates.content = html;
        updates.summary = summary;
        updates.word_count = wordCount;
      }

      if (Object.keys(updates).length === 0) {
        return;
      }

      // Optimistic update
      const existing = notesRef.current.find((n) => n.id === id);
      if (existing) {
        const optimistic: Note = { ...existing, ...updates, updated_at: new Date().toISOString() };
        void db.notes.put(optimistic).catch(() => {});
        const refreshed = sortNotes(notesRef.current.map((n) => (n.id === id ? optimistic : n)));
        notesRef.current = refreshed;
        setState((prev) => ({ ...prev, notes: refreshed }));
      }

      if (!isOnline()) {
        await enqueueOp({
          userId,
          table: 'notes',
          operation: 'update',
          recordId: id,
          data: updates as Record<string, unknown>,
          createdAt: Date.now(),
        });
        if (existing) return { note: { ...existing, ...updates } as Note };
        return;
      }

      const { data, error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single<NoteRow>();

      if (error || !data) {
        await enqueueOp({
          userId,
          table: 'notes',
          operation: 'update',
          recordId: id,
          data: updates as Record<string, unknown>,
          createdAt: Date.now(),
        });
        const message = extractErrorMessage(error, 'Unable to update note.');
        setState((prev) => ({ ...prev, error: message }));
        return { error: message };
      }

      const mapped = mapRowToNote(data);
      void db.notes.put(mapped).catch(() => {});

      const refreshed = sortNotes(
        notesRef.current.map((n) => (n.id === mapped.id ? mapped : n)),
      );
      notesRef.current = refreshed;
      setState((prev) => ({ ...prev, notes: refreshed }));

      return { note: mapped };
    },
    [userId],
  );

  const deleteNote = useCallback<UseNotesResult['deleteNote']>(
    async (id) => {
      if (!userId) {
        return { error: 'You must be signed in to delete a note.' };
      }

      if (!id) {
        return { error: 'Missing note identifier.' };
      }

      // Optimistic removal
      const filtered = notesRef.current.filter((n) => n.id !== id);
      notesRef.current = filtered;
      setState((prev) => ({ ...prev, notes: filtered }));
      void db.notes.delete(id).catch(() => {});

      if (!isOnline()) {
        await enqueueOp({
          userId,
          table: 'notes',
          operation: 'delete',
          recordId: id,
          data: {},
          createdAt: Date.now(),
        });
        return;
      }

      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        const message = extractErrorMessage(error, 'Unable to delete note.');
        setState((prev) => ({ ...prev, error: message }));
        return { error: message };
      }
    },
    [userId],
  );

  const refresh = useCallback<UseNotesResult['refresh']>(
    async (force) => {
      await runRefresh(force ?? false);
    },
    [runRefresh],
  );

  return useMemo(
    () => ({
      ...state,
      createNote,
      updateNote,
      deleteNote,
      refresh,
    }),
    [createNote, deleteNote, refresh, state, updateNote],
  );
}
