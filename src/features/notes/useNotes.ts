import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
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
  createNote: (input?: { title?: string; content?: string }) => Promise<{ note: Note } | ErrorResult | void>;
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

async function fetchNotes(userId: string): Promise<Note[]> {
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
  return rows.map(row => mapRowToNote(row));
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
        setState(prev => ({
          ...prev,
          syncing: true,
          status: prev.status === 'idle' ? 'loading' : prev.status,
          error: prev.status === 'error' ? prev.error : null,
        }));

        try {
          const notes = await fetchNotes(userId);
          setState({
            status: 'ready',
            syncing: false,
            notes,
            error: null,
          });
        } catch (error) {
          const message = extractErrorMessage(error, 'Failed to load your notes.');
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
      .channel(`notes:user:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        payload => {
          setState(prev => {
            const notes = notesRef.current;

            if (payload.eventType === 'DELETE') {
              const removedId = (payload.old as NoteRow | null)?.id;
              if (!removedId) {
                return prev;
              }
              const filtered = notes.filter(note => note.id !== removedId);
              notesRef.current = filtered;
              return { ...prev, notes: filtered };
            }

            const row = (payload.new as NoteRow | null);
            if (!row) {
              return prev;
            }

            const mapped = mapRowToNote(row);
            const existingIndex = notes.findIndex(note => note.id === mapped.id);
            let nextNotes: Note[];

            if (existingIndex >= 0) {
              nextNotes = [...notes];
              nextNotes[existingIndex] = mapped;
            } else {
              nextNotes = [mapped, ...notes];
            }

            nextNotes.sort((a, b) => {
              const aDate = a.updated_at ?? a.created_at ?? '';
              const bDate = b.updated_at ?? b.created_at ?? '';
              return bDate.localeCompare(aDate);
            });

            notesRef.current = nextNotes;
            return { ...prev, notes: nextNotes };
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
      const { html, summary, wordCount } = computeNoteMetadata(rawContent);

      setState(prev => ({ ...prev, syncing: true }));

      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: userId,
          title: baseTitle,
          content: html,
          summary,
          word_count: wordCount,
        })
        .select()
        .single<NoteRow>();

      if (error) {
        const message = extractErrorMessage(error, 'Unable to create note.');
        setState(prev => ({ ...prev, syncing: false, error: message }));
        return { error: message };
      }

      const note = mapRowToNote(data);
      const nextNotes = [note, ...notesRef.current];
      nextNotes.sort((a, b) => {
        const aDate = a.updated_at ?? a.created_at ?? '';
        const bDate = b.updated_at ?? b.created_at ?? '';
        return bDate.localeCompare(aDate);
      });

      notesRef.current = nextNotes;
      setState({ status: 'ready', syncing: false, notes: nextNotes, error: null });

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

      setState(prev => ({ ...prev, syncing: true }));

      const { data, error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single<NoteRow>();

      if (error || !data) {
        const message = extractErrorMessage(error, 'Unable to update note.');
        setState(prev => ({ ...prev, syncing: false, error: message }));
        return { error: message };
      }

      const mapped = mapRowToNote(data);
      const existingIndex = notesRef.current.findIndex(note => note.id === mapped.id);
      const nextNotes = [...notesRef.current];

      if (existingIndex >= 0) {
        nextNotes[existingIndex] = mapped;
      } else {
        nextNotes.unshift(mapped);
      }

      nextNotes.sort((a, b) => {
        const aDate = a.updated_at ?? a.created_at ?? '';
        const bDate = b.updated_at ?? b.created_at ?? '';
        return bDate.localeCompare(aDate);
      });

      notesRef.current = nextNotes;
      setState(prev => ({ ...prev, syncing: false, notes: nextNotes }));

      return { note: mapped };
    },
    [userId],
  );

  const deleteNote = useCallback<UseNotesResult['deleteNote']>(
    async id => {
      if (!userId) {
        return { error: 'You must be signed in to delete a note.' };
      }

      if (!id) {
        return { error: 'Missing note identifier.' };
      }

      setState(prev => ({ ...prev, syncing: true }));

      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        const message = extractErrorMessage(error, 'Unable to delete note.');
        setState(prev => ({ ...prev, syncing: false, error: message }));
        return { error: message };
      }

      const filtered = notesRef.current.filter(note => note.id !== id);
      notesRef.current = filtered;
      setState(prev => ({ ...prev, syncing: false, notes: filtered }));
    },
    [userId],
  );

  const refresh = useCallback<UseNotesResult['refresh']>(
    async force => {
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
