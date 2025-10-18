'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import ParallaxBackground from '@/components/ParallaxBackground';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ZenPageHeader from '@/components/ZenPageHeader';
import AccountSummary from '@/components/AccountSummary';
import ZenWordProcessor from '@/components/ZenWordProcessor';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useNotes } from '@/features/notes/useNotes';
import type { Note } from '@/types';
import { extractPlainText } from '@/features/notes/noteUtils';

function LoadingScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-sage-200 border-t-sage-600" />
      </div>
    </div>
  );
}

function formatRelativeTime(timestamp?: string) {
  if (!timestamp) {
    return 'Not yet saved';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Not yet saved';
  }

  const now = Date.now();
  const diff = date.getTime() - now;
  const absDiff = Math.abs(diff);

  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.34524, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ];

  let duration = absDiff / 1000;
  let unit: Intl.RelativeTimeFormatUnit = 'second';
  for (const [amount, nextUnit] of divisions) {
    if (duration < amount) {
      unit = nextUnit;
      break;
    }
    duration /= amount;
    unit = nextUnit;
  }

  const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const value = Math.round(duration) * (diff < 0 ? -1 : 1);
  return relativeFormatter.format(value, unit);
}

const SAVE_DEBOUNCE_MS = 1200;

export default function NotesPage() {
  const router = useRouter();
  const { user, authChecked, signOut } = useAuthSession();
  const { notes, status, syncing, error, createNote, updateNote, deleteNote } = useNotes(user?.id ?? null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSavedTitleRef = useRef('');
  const lastSavedContentRef = useRef('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  useEffect(() => {
    if (status === 'ready' && notes.length > 0 && !selectedNoteId) {
      setSelectedNoteId(notes[0].id);
    }
  }, [notes, selectedNoteId, status]);

  const activeNote = useMemo(() => {
    if (!selectedNoteId) return null;
    return notes.find(note => note.id === selectedNoteId) ?? null;
  }, [notes, selectedNoteId]);

  useEffect(() => {
    if (!activeNote) {
      setDraftTitle('');
      setDraftContent('');
      lastSavedTitleRef.current = '';
      lastSavedContentRef.current = '';
      setSaveStatus('idle');
      setSaveError(null);
      return;
    }

    setDraftTitle(activeNote.title ?? 'Untitled document');
    setDraftContent(activeNote.content ?? '');
    lastSavedTitleRef.current = activeNote.title ?? 'Untitled document';
    lastSavedContentRef.current = activeNote.content ?? '';
    setSaveStatus('idle');
    setSaveError(null);
  }, [activeNote]);

  const flushSave = useCallback(async () => {
    if (!activeNote) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const trimmedTitle = draftTitle.trim() || 'Untitled document';
    const hasTitleChanged = trimmedTitle !== lastSavedTitleRef.current;
    const hasContentChanged = draftContent !== lastSavedContentRef.current;

    if (!hasTitleChanged && !hasContentChanged) {
      setSaveStatus(prev => (prev === 'saving' ? 'idle' : prev));
      return;
    }

    setSaveStatus('saving');
    setSaveError(null);

    const result = await updateNote(activeNote.id, {
      title: trimmedTitle,
      content: draftContent,
    });

    if (result && 'error' in result) {
      setSaveStatus('error');
      setSaveError(result.error);
      return;
    }

    const savedNote = result && 'note' in result ? result.note : null;
    if (savedNote) {
      lastSavedTitleRef.current = savedNote.title ?? trimmedTitle;
      lastSavedContentRef.current = savedNote.content ?? draftContent;
    } else {
      lastSavedTitleRef.current = trimmedTitle;
      lastSavedContentRef.current = draftContent;
    }

    setSaveStatus('saved');
    setTimeout(() => {
      setSaveStatus('idle');
    }, 1500);
  }, [activeNote, draftContent, draftTitle, updateNote]);

  const queueSave = useCallback(() => {
    if (!activeNote) {
      return;
    }

    setSaveStatus('saving');
    setSaveError(null);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [activeNote, flushSave]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      void flushSave();
    };
  }, [flushSave]);

  const handleSelectNote = useCallback(
    async (note: Note) => {
      if (note.id === selectedNoteId) {
        return;
      }

      await flushSave();
      setSelectedNoteId(note.id);
    },
    [flushSave, selectedNoteId],
  );

  const handleCreateNote = async () => {
    const result = await createNote();
    if (result && 'error' in result) {
      setSaveStatus('error');
      setSaveError(result.error);
      return;
    }

    if (result && 'note' in result) {
      setSelectedNoteId(result.note.id);
    }
  };

  const handleDeleteNote = async (note: Note | null) => {
    if (!note) return;
    const confirmation = typeof window !== 'undefined'
      ? window.confirm(`Delete "${note.title || 'Untitled document'}"? This cannot be undone.`)
      : true;
    if (!confirmation) {
      return;
    }

    const result = await deleteNote(note.id);
    if (result && 'error' in result) {
      setSaveStatus('error');
      setSaveError(result.error);
      return;
    }

    if (selectedNoteId === note.id) {
      const remaining = notes.filter(n => n.id !== note.id);
      setSelectedNoteId(remaining[0]?.id ?? null);
    }
  };

  const filteredNotes = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) {
      return notes;
    }

    return notes.filter(note => {
      const title = note.title?.toLowerCase() ?? '';
      const summary = note.summary?.toLowerCase() ?? '';
      return title.includes(search) || summary.includes(search);
    });
  }, [notes, searchTerm]);

  const plainText = useMemo(() => extractPlainText(draftContent), [draftContent]);
  const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
  const characterCount = plainText.length;

  const lastUpdatedLabel = useMemo(() => {
    const timestamp = activeNote?.updated_at ?? activeNote?.created_at;
    return formatRelativeTime(timestamp);
  }, [activeNote?.created_at, activeNote?.updated_at]);

  const isDirty = useMemo(() => {
    return (
      draftTitle.trim() !== lastSavedTitleRef.current.trim() ||
      draftContent !== lastSavedContentRef.current
    );
  }, [draftContent, draftTitle]);

  if (!authChecked) {
    return <LoadingScreen />;
  }

  if (!user) {
    return null;
  }

  const showEditor = activeNote != null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <ZenPageHeader
          title="Zen Notes"
          subtitle="Compose mindful documents with a focused word processor"
          icon={FileText}
          backHref="/"
          actions={
            <>
              <ThemeSwitcher />
              <button
                type="button"
                onClick={() => {
                  void handleCreateNote();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-sage-600 px-4 py-2 text-sm font-medium text-white shadow-medium transition-all hover:bg-sage-700 hover:shadow-lift sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                New document
              </button>
              <div className="hidden h-8 w-px bg-zen-200 xl:block" />
              <AccountSummary email={user.email} syncing={syncing} onSignOut={signOut} />
            </>
          }
        />

        <main className="flex-1 pb-16">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pt-8 sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <aside className="space-y-4">
                <div className="rounded-2xl border border-zen-200 bg-white/80 shadow-soft">
                  <div className="flex items-center justify-between border-b border-zen-100 px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold text-zen-900">Library</h2>
                      <p className="text-xs text-zen-500">Browse and open your documents</p>
                    </div>
                    {syncing ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zen-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Syncing
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-4 px-4 py-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zen-400" />
                      <input
                        type="search"
                        value={searchTerm}
                        onChange={event => setSearchTerm(event.target.value)}
                        placeholder="Search notes"
                        className="w-full rounded-xl border border-zen-200 bg-white/70 py-2 pl-9 pr-3 text-sm text-zen-700 shadow-soft placeholder:text-zen-400 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-100"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      {filteredNotes.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zen-200 bg-white/60 px-4 py-6 text-center text-sm text-zen-500">
                          {notes.length === 0 ? 'You have not created any documents yet.' : 'No notes match your search.'}
                        </div>
                      ) : (
                        filteredNotes.map(note => {
                          const isActive = note.id === selectedNoteId;
                          const updatedLabel = formatRelativeTime(note.updated_at ?? note.created_at ?? undefined);
                          return (
                            <button
                              type="button"
                              key={note.id}
                              onClick={() => {
                                void handleSelectNote(note);
                              }}
                              className={`group flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left shadow-soft transition-all ${
                                isActive
                                  ? 'border-sage-300 bg-sage-50/70 ring-2 ring-sage-200'
                                  : 'border-transparent bg-white/70 hover:border-sage-200 hover:bg-sage-50/60'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-semibold text-zen-900">
                                  {note.title || 'Untitled document'}
                                </p>
                                <span className="text-[11px] text-zen-400">{updatedLabel}</span>
                              </div>
                              <p className="text-xs text-zen-500" style={{ maxHeight: '2.75rem', overflow: 'hidden' }}>
                                {note.summary || 'Start writing to see a preview here.'}
                              </p>
                              <span className="text-[11px] text-zen-400">
                                {note.word_count ? `${note.word_count} words` : 'Draft'}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </aside>

              <section className="space-y-4">
                {showEditor ? (
                  <div className="rounded-2xl border border-zen-200 bg-white/80 p-6 shadow-soft">
                    <div className="flex flex-col gap-3 border-b border-zen-100 pb-4">
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={event => {
                          setDraftTitle(event.target.value);
                          queueSave();
                        }}
                        placeholder="Untitled document"
                        className="w-full rounded-xl border border-transparent bg-transparent px-3 py-2 text-2xl font-semibold text-zen-900 transition-all focus:border-sage-300 focus:outline-none focus:ring-2 focus:ring-sage-100"
                      />
                      <div className="flex flex-wrap items-center gap-3 text-xs text-zen-500">
                        <span className="inline-flex items-center gap-1 rounded-full bg-zen-100 px-3 py-1 font-medium text-zen-600">
                          <Clock className="h-3 w-3" />
                          {lastUpdatedLabel}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-zen-100 px-3 py-1 font-medium text-zen-600">
                          {wordCount} words · {characterCount} characters
                        </span>
                        {saveStatus === 'saving' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-3 py-1 font-medium text-sage-700">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Saving…
                          </span>
                        ) : null}
                        {saveStatus === 'saved' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-3 py-1 font-medium text-sage-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Saved
                          </span>
                        ) : null}
                        {saveStatus === 'error' && saveError ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 font-medium text-red-600">
                            <AlertCircle className="h-3 w-3" />
                            {saveError}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (saveTimeoutRef.current) {
                              clearTimeout(saveTimeoutRef.current);
                              saveTimeoutRef.current = null;
                            }
                            void flushSave();
                          }}
                          disabled={!isDirty}
                          className="inline-flex items-center gap-2 rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm font-medium text-sage-700 transition-colors hover:border-sage-300 hover:bg-sage-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Save className="h-4 w-4" />
                          Save now
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteNote(activeNote);
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-zen-200 bg-white px-3 py-2 text-sm font-medium text-zen-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="pt-4">
                      <ZenWordProcessor
                        value={draftContent}
                        onChange={html => {
                          setDraftContent(html);
                          queueSave();
                        }}
                        helperText="Format text, headings, quotes, and lists just like a word processor."
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[460px] flex-col items-center justify-center rounded-2xl border border-dashed border-zen-200 bg-white/70 p-10 text-center">
                    <FileText className="h-10 w-10 text-sage-500" />
                    <h2 className="mt-4 text-xl font-semibold text-zen-900">Create your first document</h2>
                    <p className="mt-2 max-w-md text-sm text-zen-500">
                      Craft ideas, meeting notes, and plans with our mindful editor. Your changes save automatically while you stay in the flow.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCreateNote();
                      }}
                      className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sage-600 px-4 py-2 text-sm font-medium text-white shadow-medium transition-all hover:bg-sage-700 hover:shadow-lift"
                    >
                      <Plus className="h-4 w-4" />
                      Start writing
                    </button>
                  </div>
                )}

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700 shadow-soft">
                    {error}
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
