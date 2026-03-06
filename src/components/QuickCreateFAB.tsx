'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, FileText, List, Plus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { fetchCategories } from '@/features/checklist/ChecklistManager';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/local-db';
import { enqueue } from '@/lib/sync-queue';
import { isOnline } from '@/lib/network-status';
import type { Category, ListItem } from '@/types';
import ListItemsBoard from '@/components/ListItemsBoard';

type PageMode = 'task' | 'list' | 'note' | 'reminder';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

const REMINDER_PRESETS = [
  { value: '15', label: '15 min before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
] as const;

function getPageMode(pathname: string | null): PageMode | null {
  if (!pathname) return null;
  if (pathname.startsWith('/lists/share')) return null;
  if (pathname.startsWith('/lists')) return 'list';
  if (pathname.startsWith('/notes')) return 'note';
  if (pathname.startsWith('/reminders')) return 'reminder';
  if (pathname === '/' || pathname.startsWith('/friends')) return null;
  return 'task'; // /tasks, /calendar, and any other authenticated page
}

const MODE_META: Record<PageMode, { label: string; icon: LucideIcon }> = {
  task: { label: 'New task', icon: CheckCircle2 },
  list: { label: 'New list', icon: List },
  note: { label: 'New note', icon: FileText },
  reminder: { label: 'New reminder', icon: Bell },
};

/**
 * Floating action button for fast content capture from anywhere in the app.
 *
 * Detects the current page and opens a context-appropriate quick-create form:
 * - /tasks, /calendar → full task form (title, description, due date, reminder, priority, category)
 * - /lists → list form (name, description)
 * - /notes → note form (title)
 * - /reminders → reminder form (title, description, date + time)
 * Hidden on /, /friends, /lists/share/*, and when not authenticated.
 */
export function QuickCreateFAB() {
  const pathname = usePathname();
  const { user } = useAuthSession();

  const mode = getPageMode(pathname);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successLabel, setSuccessLabel] = useState('');

  // Task fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState('');

  // Reminder-specific fields
  const [reminderDate, setReminderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reminderTime, setReminderTime] = useState(() => new Date().toTimeString().slice(0, 5));

  // List items (for list mode)
  const [listItems, setListItems] = useState<ListItem[]>([]);

  const titleRef = useRef<HTMLInputElement>(null);

  const hidden = !user || !mode;

  // Load categories when task modal opens
  useEffect(() => {
    if (!open || mode !== 'task' || !user?.id) return;
    void fetchCategories(user.id).then((cats) => {
      setCategories(cats);
      setSelectedCategory(cats[0] ?? null);
    });
  }, [open, mode, user?.id]);

  // Focus title on open — use requestAnimationFrame so the element is guaranteed
  // to be visible and mounted before we attempt to focus it.
  useEffect(() => {
    if (open) requestAnimationFrame(() => titleRef.current?.focus());
  }, [open]);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueDate('');
    setReminderMinutes('');
    setListItems([]);
    setError(null);
  }, []);

  const addListItem = useCallback(async (): Promise<string | null> => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newItem: ListItem = { id, list_id: '', content: '', completed: false, position: listItems.length, created_at: now, updated_at: now };
    setListItems(prev => [...prev, newItem]);
    return id;
  }, [listItems.length]);

  const updateListItemContent = useCallback(async (itemId: string, content: string) => {
    setListItems(prev => prev.map(item => item.id === itemId ? { ...item, content } : item));
  }, []);

  const toggleListItem = useCallback(async (itemId: string, completed: boolean) => {
    setListItems(prev => prev.map(item => item.id === itemId ? { ...item, completed } : item));
  }, []);

  const deleteListItem = useCallback(async (itemId: string) => {
    setListItems(prev => prev.filter(item => item.id !== itemId));
  }, []);

  const reorderListItems = useCallback(async (orderedIds: string[]) => {
    setListItems(prev => {
      const map = new Map(prev.map(item => [item.id, item]));
      return orderedIds.flatMap((id, idx) => {
        const item = map.get(id);
        return item ? [{ ...item, position: idx }] : [];
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const showSuccessToast = useCallback((label: string) => {
    setSuccessLabel(label);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }, []);

  const handleSubmitTask = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) { setError('Please enter a task title.'); return; }
    if (!user?.id) return;

    const category = selectedCategory?.name ?? '';
    const category_color = selectedCategory?.color ?? '#5a7a5a';
    const existingTasks = await db.tasks.where('user_id').equals(user.id).toArray();
    const nextOrder = existingTasks.reduce((max, t) => Math.max(max, t.order ?? 0), -1) + 1;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    let dueDateISO: string | null = null;
    if (dueDate) {
      const parsed = new Date(dueDate);
      if (!Number.isNaN(parsed.getTime())) dueDateISO = parsed.toISOString();
    }

    const reminderMinutesBefore = reminderMinutes ? parseInt(reminderMinutes, 10) : null;
    let reminderNextTriggerAt: string | null = null;
    if (dueDateISO && reminderMinutesBefore != null) {
      reminderNextTriggerAt = new Date(
        new Date(dueDateISO).getTime() - reminderMinutesBefore * 60_000,
      ).toISOString();
    }

    const newTask = {
      id,
      user_id: user.id,
      title: trimmed,
      description: description.trim(),
      priority,
      category,
      category_color,
      completed: false,
      due_date: dueDateISO,
      reminder_minutes_before: reminderMinutesBefore,
      reminder_recurrence: null,
      reminder_next_trigger_at: reminderNextTriggerAt,
      reminder_snoozed_until: null,
      reminder_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      order: nextOrder,
      access_role: 'owner' as const,
      created_at: now,
      updated_at: now,
    };

    if (!isOnline()) {
      await db.tasks.put(newTask);
      await enqueue({ table_name: 'tasks', operation: 'INSERT', payload: newTask });
    } else {
      const { error: insertError } = await supabase.from('tasks').insert(newTask);
      if (insertError) throw new Error(insertError.message);
    }
    showSuccessToast('Task created');
  }, [title, description, priority, selectedCategory, dueDate, reminderMinutes, user, showSuccessToast]);

  const handleSubmitList = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) { setError('Please enter a list name.'); return; }
    if (!user?.id) return;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const listRecord = { id, name: trimmed, description: description.trim() || null, user_id: user.id, created_at: now };
    const itemsToSave = listItems.filter(item => item.content.trim());

    if (!isOnline()) {
      const localItems = itemsToSave.map((item, idx) => ({ ...item, list_id: id, position: idx }));
      await db.lists.put({ ...listRecord, owner_id: user.id, access_role: 'owner' as const, public_share_token: null, public_share_enabled: false, items: localItems });
      await enqueue({ table_name: 'lists', operation: 'INSERT', payload: listRecord });
    } else {
      const { error: insertError } = await supabase.from('lists').insert(listRecord);
      if (insertError) throw new Error(insertError.message);
      if (itemsToSave.length > 0) {
        const itemRows = itemsToSave.map((item, idx) => ({
          id: item.id,
          list_id: id,
          content: item.content.trim(),
          completed: item.completed,
          position: idx,
          created_at: now,
          updated_at: now,
        }));
        const { error: itemsError } = await supabase.from('list_items').insert(itemRows);
        if (itemsError) throw new Error(itemsError.message);
      }
    }
    showSuccessToast('List created');
  }, [title, description, listItems, user, showSuccessToast]);

  const handleSubmitNote = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) { setError('Please enter a note title.'); return; }
    if (!user?.id) return;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const noteRecord = { id, user_id: user.id, title: trimmed, content: '', created_at: now, updated_at: now };

    if (!isOnline()) {
      await db.notes.put(noteRecord);
      await enqueue({ table_name: 'notes', operation: 'INSERT', payload: noteRecord });
    } else {
      const { error: insertError } = await supabase.from('notes').insert(noteRecord);
      if (insertError) throw new Error(insertError.message);
    }
    showSuccessToast('Note created');
  }, [title, user, showSuccessToast]);

  const handleSubmitReminder = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) { setError('Please enter a reminder title.'); return; }
    if (!reminderDate) { setError('Please choose a date.'); return; }
    if (!user?.id) return;

    const safeTime = reminderTime?.includes(':') ? reminderTime : '09:00';
    const remindAt = new Date(`${reminderDate}T${safeTime}`);
    if (Number.isNaN(remindAt.getTime())) { setError('Invalid date/time.'); return; }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const reminderRecord = {
      id,
      user_id: user.id,
      title: trimmed,
      description: description.trim() || null,
      remind_at: remindAt.toISOString(),
      timezone: tz,
      created_at: now,
      updated_at: now,
    };

    if (!isOnline()) {
      await db.zen_reminders.put(reminderRecord);
      await enqueue({ table_name: 'zen_reminders', operation: 'INSERT', payload: reminderRecord });
    } else {
      const { error: insertError } = await supabase.from('zen_reminders').insert(reminderRecord);
      if (insertError) throw new Error(insertError.message);
    }
    showSuccessToast('Reminder set');
  }, [title, description, reminderDate, reminderTime, user, showSuccessToast]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setError(null);
      try {
        if (mode === 'task') await handleSubmitTask();
        else if (mode === 'list') await handleSubmitList();
        else if (mode === 'note') await handleSubmitNote();
        else if (mode === 'reminder') await handleSubmitReminder();
        setOpen(false);
        setTitle('');
        setDescription('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setSubmitting(false);
      }
    },
    [mode, handleSubmitTask, handleSubmitList, handleSubmitNote, handleSubmitReminder],
  );

  // Dismiss on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  if (hidden) return null;

  const meta = MODE_META[mode];
  const ModeIcon = meta.icon;

  const submitLabel = {
    task: 'Add task',
    list: 'Create list',
    note: 'Create note',
    reminder: 'Set reminder',
  }[mode];

  return (
    <>
      {/* Success toast */}
      {showSuccess && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-28 right-4 z-50 flex items-center gap-2 rounded-xl border border-sage-200 bg-surface px-4 py-2.5 text-sm font-medium text-sage-700 shadow-lift lg:bottom-4"
        >
          <CheckCircle2 className="h-4 w-4" />
          {successLabel}
        </div>
      )}

      {/* FAB trigger */}
      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label={`Quick-create: ${meta.label}`}
          className="fixed bottom-28 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sage-500 to-zen-500 text-white shadow-lift transition hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2 lg:bottom-6"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

      {/* Quick-create modal backdrop + panel */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-zen-900/20 backdrop-blur-sm"
            aria-hidden="true"
            onClick={handleClose}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-create-title"
            className="fixed bottom-28 right-4 z-50 w-80 rounded-3xl border border-zen-200/70 bg-surface/95 shadow-lift backdrop-blur-xl dark:border-zen-700/40 lg:bottom-6"
          >
            <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ModeIcon className="h-4 w-4 text-sage-500" />
                  <h2 id="quick-create-title" className="text-sm font-semibold text-zen-900 dark:text-zen-50">
                    {meta.label}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className="rounded-lg p-1 text-zen-400 hover:text-zen-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Title / Name field */}
              <input
                ref={titleRef}
                type="text"
                placeholder={
                  mode === 'list' ? 'List name…' :
                  mode === 'note' ? 'Note title…' :
                  mode === 'reminder' ? 'Reminder title…' :
                  'What needs doing?'
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={500}
                className="w-full rounded-xl border border-zen-200/80 bg-zen-50/50 px-3 py-2.5 text-sm text-zen-900 placeholder:text-zen-400 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-100"
                aria-label={
                  mode === 'list' ? 'List name' :
                  mode === 'note' ? 'Note title' :
                  mode === 'reminder' ? 'Reminder title' :
                  'Task title'
                }
              />

              {/* --- Task-specific fields --- */}
              {mode === 'task' && (
                <>
                  <textarea
                    placeholder="Description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-zen-200/80 bg-zen-50/50 px-3 py-2.5 text-sm text-zen-900 placeholder:text-zen-400 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-100"
                    aria-label="Task description"
                  />

                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-medium text-zen-500">Priority</span>
                    <div className="flex gap-1.5">
                      {PRIORITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPriority(opt.value)}
                          aria-pressed={priority === opt.value}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                            priority === opt.value
                              ? 'bg-sage-500 text-white'
                              : 'bg-zen-100/80 text-zen-600 hover:bg-zen-200/80 dark:bg-zen-800/50 dark:text-zen-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {categories.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-medium text-zen-500">Category</span>
                      <select
                        value={selectedCategory?.id ?? ''}
                        onChange={(e) => setSelectedCategory(categories.find((c) => c.id === e.target.value) ?? null)}
                        className="flex-1 rounded-xl border border-zen-200/80 bg-zen-50/50 px-2.5 py-1.5 text-xs text-zen-700 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-200"
                        aria-label="Task category"
                      >
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs font-medium text-zen-500">Due</span>
                    <input
                      type="datetime-local"
                      value={dueDate}
                      onChange={(e) => {
                        setDueDate(e.target.value);
                        if (!e.target.value) setReminderMinutes('');
                      }}
                      className="flex-1 rounded-xl border border-zen-200/80 bg-zen-50/50 px-2.5 py-1.5 text-xs text-zen-700 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-200"
                      aria-label="Due date"
                    />
                  </div>

                  {dueDate && (
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-medium text-zen-500">Remind</span>
                      <select
                        value={reminderMinutes}
                        onChange={(e) => setReminderMinutes(e.target.value)}
                        className="flex-1 rounded-xl border border-zen-200/80 bg-zen-50/50 px-2.5 py-1.5 text-xs text-zen-700 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-200"
                        aria-label="Reminder"
                      >
                        <option value="">No reminder</option>
                        {REMINDER_PRESETS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* --- List-specific fields --- */}
              {mode === 'list' && (
                <>
                  <textarea
                    placeholder="Description (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-zen-200/80 bg-zen-50/50 px-3 py-2.5 text-sm text-zen-900 placeholder:text-zen-400 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-100"
                    aria-label="List description"
                  />
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-zen-500">List items</p>
                    <ListItemsBoard
                      items={listItems}
                      canEdit
                      editing
                      onAddItem={addListItem}
                      onToggleItem={toggleListItem}
                      onContentCommit={updateListItemContent}
                      onDeleteItem={deleteListItem}
                      onReorder={reorderListItems}
                      error={null}
                    />
                  </div>
                </>
              )}

              {/* --- Reminder-specific fields --- */}
              {mode === 'reminder' && (
                <>
                  <textarea
                    placeholder="Details (optional)"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-zen-200/80 bg-zen-50/50 px-3 py-2.5 text-sm text-zen-900 placeholder:text-zen-400 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-100"
                    aria-label="Reminder details"
                  />
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                      className="flex-1 rounded-xl border border-zen-200/80 bg-zen-50/50 px-2.5 py-1.5 text-xs text-zen-700 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-200"
                      aria-label="Reminder date"
                    />
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="flex-1 rounded-xl border border-zen-200/80 bg-zen-50/50 px-2.5 py-1.5 text-xs text-zen-700 focus:border-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-300/40 dark:border-zen-700/50 dark:bg-zen-900/40 dark:text-zen-200"
                      aria-label="Reminder time"
                    />
                  </div>
                </>
              )}

              {error && (
                <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-sage-500 to-zen-500 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2"
              >
                {submitting ? 'Saving…' : submitLabel}
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
