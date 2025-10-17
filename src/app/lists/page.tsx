'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { List as ListIcon, Sparkles, Plus, Pencil, Trash2, ArrowLeft, CheckSquare } from 'lucide-react';
import ParallaxBackground from '@/components/ParallaxBackground';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useLists } from '@/features/lists/useLists';
import { supabase } from '@/lib/supabase';
import type { List } from '@/types';
import { useRouter } from 'next/navigation';

interface FormState {
  name: string;
  description: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  description: '',
};

function LoadingScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sage-200 border-t-sage-600" />
      </div>
    </div>
  );
}

export default function ListsPage() {
  const router = useRouter();
  const { user, authChecked } = useAuthSession();
  const { lists, status, syncing, error, createList, updateList, deleteList, refresh } = useLists(user?.id ?? null);
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authChecked) {
      return;
    }

    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  useEffect(() => {
    if (!showForm) {
      setFormState(INITIAL_FORM);
      setEditingList(null);
      setFormError(null);
    }
  }, [showForm]);

  const sortedLists = useMemo(() => {
    return [...lists].sort((a, b) => {
      if (a.created_at && b.created_at) {
        return a.created_at.localeCompare(b.created_at);
      }
      if (a.created_at) return -1;
      if (b.created_at) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [lists]);

  const handleOpenCreate = () => {
    setEditingList(null);
    setFormState(INITIAL_FORM);
    setShowForm(true);
  };

  const handleOpenEdit = (list: List) => {
    setEditingList(list);
    setFormState({
      name: list.name,
      description: list.description ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formState.name.trim()) {
      setFormError('Give your list a name so it is easy to recognise.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload = {
      name: formState.name.trim(),
      description: formState.description.trim(),
    };

    const result = editingList
      ? await updateList(editingList.id, payload)
      : await createList(payload);

    if (result && 'error' in result && result.error) {
      setFormError(result.error);
    } else {
      setShowForm(false);
      setFormState(INITIAL_FORM);
    }

    setSubmitting(false);
  };

  const handleDelete = async (list: List) => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete "${list.name}"? This cannot be undone.`);
      if (!confirmed) {
        return;
      }
    }

    const result = await deleteList(list.id);
    if (result && 'error' in result && result.error) {
      setFormError(result.error);
    }
  };

  if (!authChecked || !user) {
    return <LoadingScreen />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-surface/70 border-b border-zen-200 shadow-soft">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="hidden lg:flex items-center gap-2 text-sm font-medium text-zen-500 hover:text-zen-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Dashboard
                </button>
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 flex items-center justify-center shadow-medium">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-zen-900">Lists</h1>
                  <p className="text-sm text-zen-600">Curate mindful collections</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 justify-start lg:justify-end">
                <ThemeSwitcher />
                <button
                  type="button"
                  onClick={() => {
                    void supabase.auth.signOut();
                  }}
                  className="px-4 py-2 rounded-lg bg-zen-900 text-white text-sm font-medium shadow-soft hover:bg-zen-800 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 items-start">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold text-zen-900">Shape routines, rituals, and shared moments.</h2>
                <p className="text-zen-600 max-w-2xl">
                  Lists help you organise ideas that don&apos;t fit into traditional tasks. Capture reading plans, packing essentials, or weekly rituals and keep them beautifully organised.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sage-500/90 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New list
                  </button>
                  <button
                    type="button"
                    onClick={() => refresh(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zen-200 bg-surface/80 text-sm font-medium text-zen-600 hover:text-zen-800 hover:border-zen-300 transition-colors"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="rounded-3xl bg-surface/80 border border-zen-200 shadow-soft p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 flex items-center justify-center text-white shadow-medium">
                    <ListIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm text-zen-500">Lists created</p>
                    <p className="text-2xl font-semibold text-zen-900">{syncing && status === 'loading' ? '—' : lists.length}</p>
                  </div>
                </div>
                <p className="text-sm text-zen-600">
                  {lists.length === 0
                    ? 'Start with a template that suits your moment—travel, wellness, study, or routines.'
                    : 'Tap a list to refine it. Use lists for recurring rituals, shared chores, or inspiration boards.'}
                </p>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <AnimatePresence>
              {showForm && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-3xl bg-surface/90 border border-zen-200 shadow-soft p-6 space-y-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-zen-900">
                        {editingList ? 'Update list' : 'Create a new list'}
                      </h3>
                      <p className="text-sm text-zen-600">
                        Name your list and describe its intention to stay inspired.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="text-sm text-zen-500 hover:text-zen-700"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zen-700">List name</label>
                      <input
                        type="text"
                        value={formState.name}
                        onChange={event => setFormState(prev => ({ ...prev, name: event.target.value }))}
                        placeholder="Sunday reset, Travel checklist, Reading list..."
                        className="w-full rounded-xl border border-zen-200 bg-white/80 px-4 py-2.5 text-sm text-zen-900 shadow-soft focus:border-sage-400 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zen-700">Description</label>
                      <textarea
                        value={formState.description}
                        onChange={event => setFormState(prev => ({ ...prev, description: event.target.value }))}
                        placeholder="Add a gentle reminder of what this list helps you with."
                        rows={3}
                        className="w-full rounded-xl border border-zen-200 bg-white/80 px-4 py-2.5 text-sm text-zen-900 shadow-soft focus:border-sage-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {formError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {formError}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-4 py-2 rounded-xl border border-zen-200 text-sm font-medium text-zen-600 hover:text-zen-800 hover:border-zen-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Saving…' : editingList ? 'Save changes' : 'Create list'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {status === 'loading' && lists.length === 0 ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-40 rounded-3xl bg-surface/70 border border-zen-200 shadow-soft animate-pulse"
                  />
                ))
              ) : sortedLists.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3 rounded-3xl border border-dashed border-zen-200 bg-surface/50 p-12 text-center space-y-4">
                  <ListIcon className="w-12 h-12 mx-auto text-sage-400" />
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-zen-900">No lists yet</h3>
                    <p className="text-zen-600 max-w-xl mx-auto">
                      Start with a single idea. Whether it&apos;s a weekend reset, packing guide, or gratitude list, we&apos;ll keep it safe and beautifully arranged.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sage-500 text-white text-sm font-medium shadow-soft hover:bg-sage-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create your first list
                  </button>
                </div>
              ) : (
                sortedLists.map(list => (
                  <motion.div
                    key={list.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="rounded-3xl bg-surface/80 border border-zen-200 shadow-soft p-6 flex flex-col gap-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold text-zen-900">{list.name}</h3>
                        {list.description && <p className="text-sm text-zen-600">{list.description}</p>}
                        <p className="text-xs text-zen-400">
                          {list.created_at
                            ? new Date(list.created_at).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'Recently created'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(list)}
                          className="p-2 rounded-xl border border-zen-200 text-zen-500 hover:text-zen-700 hover:border-zen-300 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(list)}
                          className="p-2 rounded-xl border border-red-200 text-red-500 hover:text-red-600 hover:border-red-300 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-zen-500">
                      <span>Mindfully curated</span>
                      {list.user_id && <span>ID: {list.id.slice(0, 8)}…</span>}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
