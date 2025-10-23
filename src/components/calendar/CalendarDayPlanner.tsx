'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import {
  CalendarPlus,
  CheckSquare,
  ListPlus,
  Sparkles,
  StickyNote,
} from 'lucide-react';

import type { Category, Task } from '@/types';

type PlannerActionResult = { success: boolean; error?: string };

type PlannerCategoryResult = PlannerActionResult & { category?: Category };

interface CalendarDayPlannerProps {
  date: Date;
  categories: Category[];
  onCreateTask: (input: Partial<Task>) => Promise<PlannerActionResult>;
  onCreateList: (
    input: { name: string; description?: string; createdAt?: string },
  ) => Promise<PlannerActionResult>;
  onCreateNote: (
    input: { title?: string; content?: string; timestamp?: string },
  ) => Promise<PlannerActionResult>;
  onCreateCategory: (input: { name: string; color: string }) => Promise<PlannerCategoryResult>;
}

type PlannerTab = 'task' | 'list' | 'note';

type TaskPriority = Task['priority'];

const inputClasses =
  'w-full rounded-2xl border border-zen-200/70 bg-white/80 px-4 py-2 text-sm text-zen-700 shadow-inner transition focus:outline-none focus:ring-2 focus:ring-zen-400 dark:border-zen-700/50 dark:bg-zen-900/60 dark:text-zen-100';

const textareaClasses = `${inputClasses} min-h-[120px] resize-none`;

const tabButtonClasses =
  'flex-1 rounded-full border border-transparent px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zen-400';

const categoryColorOptions = ['#5a7a5a', '#7a957a', '#8b7961', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#0ea5e9'];

function combineDateWithTime(baseDate: Date, timeValue: string, fallbackHours = 9): string {
  const [hoursString, minutesString] = timeValue.split(':');
  const hours = Number.parseInt(hoursString ?? '', 10);
  const minutes = Number.parseInt(minutesString ?? '', 10);
  const next = new Date(baseDate.getTime());
  if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
    next.setHours(hours, minutes, 0, 0);
  } else {
    next.setHours(fallbackHours, 0, 0, 0);
  }
  return next.toISOString();
}

export function CalendarDayPlanner({
  date,
  categories,
  onCreateTask,
  onCreateList,
  onCreateNote,
  onCreateCategory,
}: CalendarDayPlannerProps) {
  const [activeTab, setActiveTab] = useState<PlannerTab>('task');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskTime, setTaskTime] = useState('09:00');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [taskCategory, setTaskCategory] = useState('');
  const [taskCategoryColor, setTaskCategoryColor] = useState('#6366f1');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskSubmitting, setTaskSubmitting] = useState(false);

  const [showCategoryCreator, setShowCategoryCreator] = useState(categories.length === 0);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(categoryColorOptions[0]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categorySubmitting, setCategorySubmitting] = useState(false);

  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [listError, setListError] = useState<string | null>(null);
  const [listSubmitting, setListSubmitting] = useState(false);

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTime, setNoteTime] = useState('08:00');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const formattedDate = useMemo(() => format(date, 'EEEE, MMMM d, yyyy'), [date]);

  useEffect(() => {
    if (categories.length === 0) {
      setTaskCategory('');
      setTaskCategoryColor('#6366f1');
      setShowCategoryCreator(true);
      return;
    }

    const matching = categories.find(category => category.name === taskCategory);
    if (matching) {
      if (matching.color !== taskCategoryColor) {
        setTaskCategoryColor(matching.color);
      }
      return;
    }

    const first = categories[0];
    setTaskCategory(first.name);
    setTaskCategoryColor(first.color);
  }, [categories, taskCategory, taskCategoryColor]);

  const handleCreateCategory = async () => {
    if (categorySubmitting) {
      return;
    }

    if (!newCategoryName.trim()) {
      setCategoryError('Give your category a clear name.');
      return;
    }

    setCategoryError(null);
    setCategorySubmitting(true);

    const result = await onCreateCategory({
      name: newCategoryName.trim(),
      color: newCategoryColor,
    });

    setCategorySubmitting(false);

    if (!result.success) {
      setCategoryError(result.error ?? 'Unable to create category.');
      return;
    }

    const created = result.category;
    if (created) {
      setTaskCategory(created.name);
      setTaskCategoryColor(created.color);
    }
    setNewCategoryName('');
    setShowCategoryCreator(false);
  };

  const handleTaskSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (taskSubmitting) {
      return;
    }

    if (!taskTitle.trim()) {
      setTaskError('Add a short description so you recognise the task later.');
      return;
    }

    if (!taskCategory) {
      setTaskError('Select or create a category before saving.');
      return;
    }

    setTaskError(null);
    setTaskSubmitting(true);

    const dueIso = combineDateWithTime(date, taskTime, 9);

    const result = await onCreateTask({
      title: taskTitle.trim(),
      description: taskDescription.trim() ? taskDescription.trim() : undefined,
      priority: taskPriority,
      category: taskCategory,
      category_color: taskCategoryColor,
      completed: false,
      due_date: dueIso,
    });

    setTaskSubmitting(false);

    if (!result.success) {
      setTaskError(result.error ?? 'Unable to add this task.');
      return;
    }

    setTaskTitle('');
    setTaskDescription('');
    setTaskTime('09:00');
    setTaskPriority('medium');
  };

  const handleListSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (listSubmitting) {
      return;
    }

    if (!listName.trim()) {
      setListError('Lists need a name so you can find them again.');
      return;
    }

    setListError(null);
    setListSubmitting(true);

    const createdAt = combineDateWithTime(date, '09:00', 9);

    const result = await onCreateList({
      name: listName.trim(),
      description: listDescription.trim() ? listDescription.trim() : undefined,
      createdAt,
    });

    setListSubmitting(false);

    if (!result.success) {
      setListError(result.error ?? 'Unable to create list.');
      return;
    }

    setListName('');
    setListDescription('');
  };

  const handleNoteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (noteSubmitting) {
      return;
    }

    if (!noteTitle.trim() && !noteContent.trim()) {
      setNoteError('Add a title or some content for your note.');
      return;
    }

    setNoteError(null);
    setNoteSubmitting(true);

    const timestamp = combineDateWithTime(date, noteTime, 8);

    const result = await onCreateNote({
      title: noteTitle.trim() ? noteTitle.trim() : undefined,
      content: noteContent,
      timestamp,
    });

    setNoteSubmitting(false);

    if (!result.success) {
      setNoteError(result.error ?? 'Unable to save note.');
      return;
    }

    setNoteTitle('');
    setNoteContent('');
    setNoteTime('08:00');
  };

  const renderCategorySelector = () => {
    if (showCategoryCreator) {
      return (
        <div className="space-y-3 rounded-2xl border border-zen-200/70 bg-white/80 p-4 shadow-inner dark:border-zen-700/40 dark:bg-zen-900/60">
          <div className="text-sm font-semibold text-zen-700 dark:text-zen-100">New category</div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
            Name
            <input
              type="text"
              value={newCategoryName}
              onChange={event => setNewCategoryName(event.target.value)}
              className={`${inputClasses} mt-1`}
              placeholder="Personal, Errands, Deep work..."
            />
          </label>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
              Colour
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {categoryColorOptions.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCategoryColor(color)}
                  className={`h-8 w-8 rounded-full border-2 ${
                    newCategoryColor === color
                      ? 'border-zen-600 shadow-soft'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Use ${color} for the category colour`}
                />
              ))}
            </div>
          </div>
          {categoryError ? (
            <p className="text-xs font-semibold text-warm-600 dark:text-warm-400">{categoryError}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreateCategory}
              className="inline-flex items-center gap-2 rounded-full bg-zen-500 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-zen-600 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={categorySubmitting}
            >
              <CalendarPlus className="h-4 w-4" />
              {categorySubmitting ? 'Saving...' : 'Save category'}
            </button>
            {categories.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setShowCategoryCreator(false);
                  setCategoryError(null);
                }}
                className="text-sm font-semibold text-zen-500 underline-offset-4 hover:underline dark:text-zen-300"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
          Category
          <div className="mt-1 flex items-center gap-3">
            <select
              value={taskCategory}
              onChange={event => {
                const value = event.target.value;
                setTaskCategory(value);
                const matched = categories.find(category => category.name === value);
                if (matched) {
                  setTaskCategoryColor(matched.color);
                }
              }}
              className={`${inputClasses} appearance-none`}
              disabled={categories.length === 0}
            >
              {categories.map(category => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setShowCategoryCreator(true);
                setCategoryError(null);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-zen-200/80 px-3 py-2 text-xs font-semibold text-zen-600 transition-colors hover:border-zen-400 hover:text-zen-700 dark:border-zen-700/40 dark:text-zen-200 dark:hover:border-zen-500 dark:hover:text-zen-50"
            >
              <CalendarPlus className="h-4 w-4" />
              New
            </button>
          </div>
        </label>
        {categories.length === 0 ? (
          <p className="text-xs font-medium text-zen-500 dark:text-zen-300">
            Create a category to help organise your tasks.
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <section className="mt-8">
      <div className="rounded-3xl border border-zen-200/70 bg-surface/85 p-6 shadow-large backdrop-blur-xl dark:border-zen-700/50 dark:bg-zen-950/50">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="space-y-4 lg:w-1/3">
            <div className="inline-flex items-center gap-2 rounded-full bg-zen-500/15 px-3 py-1 text-xs font-semibold text-zen-600 dark:bg-zen-400/20 dark:text-zen-100">
              <Sparkles className="h-4 w-4" />
              Plan this day
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-zen-900 dark:text-zen-50">{formattedDate}</h2>
            <p className="text-sm leading-relaxed text-zen-600 dark:text-zen-300">
              Quickly capture tasks, collaborative lists, or note ideas and we will anchor them to this date on your calendar.
            </p>
          </div>
          <div className="space-y-5 lg:flex-1">
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setActiveTab('task')}
                className={`${tabButtonClasses} ${
                  activeTab === 'task'
                    ? 'bg-zen-500 text-white shadow-soft'
                    : 'border-zen-200 bg-white/80 text-zen-600 hover:bg-zen-100 dark:border-zen-700/40 dark:bg-zen-900/50 dark:text-zen-200 dark:hover:bg-zen-800/60'
                }`}
              >
                <CheckSquare className="mr-2 h-4 w-4" /> Task
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className={`${tabButtonClasses} ${
                  activeTab === 'list'
                    ? 'bg-sage-500 text-white shadow-soft'
                    : 'border-zen-200 bg-white/80 text-zen-600 hover:bg-zen-100 dark:border-zen-700/40 dark:bg-zen-900/50 dark:text-zen-200 dark:hover:bg-zen-800/60'
                }`}
              >
                <ListPlus className="mr-2 h-4 w-4" /> List
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('note')}
                className={`${tabButtonClasses} ${
                  activeTab === 'note'
                    ? 'bg-warm-500 text-white shadow-soft'
                    : 'border-zen-200 bg-white/80 text-zen-600 hover:bg-zen-100 dark:border-zen-700/40 dark:bg-zen-900/50 dark:text-zen-200 dark:hover:bg-zen-800/60'
                }`}
              >
                <StickyNote className="mr-2 h-4 w-4" /> Note
              </button>
            </div>

            <div className="rounded-2xl border border-zen-200/70 bg-white/75 p-5 shadow-soft dark:border-zen-700/40 dark:bg-zen-900/60">
              {activeTab === 'task' ? (
                <form onSubmit={handleTaskSubmit} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                      Task title
                      <input
                        type="text"
                        value={taskTitle}
                        onChange={event => setTaskTitle(event.target.value)}
                        className={`${inputClasses} mt-1`}
                        placeholder="What needs your attention?"
                      />
                    </label>
                    <label className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                      Notes
                      <textarea
                        value={taskDescription}
                        onChange={event => setTaskDescription(event.target.value)}
                        className={`${textareaClasses} mt-1`}
                        placeholder="Add helpful context, resources, or next steps."
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                      Due time
                      <input
                        type="time"
                        value={taskTime}
                        onChange={event => setTaskTime(event.target.value)}
                        className={`${inputClasses} mt-1`}
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                      Priority
                      <select
                        value={taskPriority}
                        onChange={event => setTaskPriority(event.target.value as TaskPriority)}
                        className={`${inputClasses} mt-1 appearance-none`}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                  </div>

                  {renderCategorySelector()}

                  {taskError ? (
                    <p className="text-sm font-semibold text-warm-600 dark:text-warm-400">{taskError}</p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-full bg-zen-500 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-zen-600 disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={taskSubmitting || (categories.length === 0 && !showCategoryCreator)}
                    >
                      <CheckSquare className="h-4 w-4" />
                      {taskSubmitting ? 'Adding...' : 'Add task'}
                    </button>
                    <span className="text-xs text-zen-500 dark:text-zen-300">
                      Tasks will appear in the calendar once saved.
                    </span>
                  </div>
                </form>
              ) : null}

              {activeTab === 'list' ? (
                <form onSubmit={handleListSubmit} className="space-y-5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                    List name
                    <input
                      type="text"
                      value={listName}
                      onChange={event => setListName(event.target.value)}
                      className={`${inputClasses} mt-1`}
                      placeholder="Grocery run, launch tasks, reading list..."
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                    Description (optional)
                    <textarea
                      value={listDescription}
                      onChange={event => setListDescription(event.target.value)}
                      className={`${textareaClasses} mt-1`}
                      placeholder="Add context or share why this list matters."
                    />
                  </label>
                  {listError ? (
                    <p className="text-sm font-semibold text-warm-600 dark:text-warm-400">{listError}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-full bg-sage-500 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-sage-600 disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={listSubmitting}
                    >
                      <ListPlus className="h-4 w-4" />
                      {listSubmitting ? 'Saving...' : 'Create list'}
                    </button>
                    <span className="text-xs text-zen-500 dark:text-zen-300">
                      We will timestamp the list with this date for future reference.
                    </span>
                  </div>
                </form>
              ) : null}

              {activeTab === 'note' ? (
                <form onSubmit={handleNoteSubmit} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                      Note title
                      <input
                        type="text"
                        value={noteTitle}
                        onChange={event => setNoteTitle(event.target.value)}
                        className={`${inputClasses} mt-1`}
                        placeholder="Planning thoughts, meeting outline..."
                      />
                    </label>
                    <label className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                      Content
                      <textarea
                        value={noteContent}
                        onChange={event => setNoteContent(event.target.value)}
                        className={`${textareaClasses} mt-1`}
                        placeholder="Capture the details while they are fresh."
                      />
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                      Time stamp
                      <input
                        type="time"
                        value={noteTime}
                        onChange={event => setNoteTime(event.target.value)}
                        className={`${inputClasses} mt-1`}
                      />
                    </label>
                  </div>
                  {noteError ? (
                    <p className="text-sm font-semibold text-warm-600 dark:text-warm-400">{noteError}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-full bg-warm-500 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-warm-600 disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={noteSubmitting}
                    >
                      <StickyNote className="h-4 w-4" />
                      {noteSubmitting ? 'Saving...' : 'Save note'}
                    </button>
                    <span className="text-xs text-zen-500 dark:text-zen-300">
                      Notes will appear on this day once saved.
                    </span>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CalendarDayPlanner;
