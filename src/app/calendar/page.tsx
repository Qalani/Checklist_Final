'use client';

import MobileSectionNav from '@/components/MobileSectionNav';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { addMonths, format, startOfMonth } from 'date-fns';
import {
  CalendarDays,
  Check,
  ChevronRight,
  Plus,
  RefreshCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import {
  CalendarEventDetails,
  CalendarEventForm,
  EVENT_LABELS,
  calendarEventDate,
  type CalendarSelection,
} from '@/components/calendar/CalendarEventDialog';
import type {
  CalendarViewType,
  CalendarViewEvent,
  CalendarViewProps,
} from '@/components/calendar/FullCalendarView';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useCalendarData } from '@/features/calendar/useCalendarData';
import {
  useCalendarEvents,
  type CreateCalendarEventInput,
} from '@/features/calendar/useCalendarEvents';
import type {
  CalendarEventRecord,
  CalendarEventType,
  CalendarScope,
} from '@/features/calendar/types';
import type { CalendarEvent } from '@/types';

const CalendarView = dynamic<CalendarViewProps>(
  () =>
    import('@/components/calendar/FullCalendarView').then(
      (mod) => mod.FullCalendarView
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[480px] items-center justify-center rounded-2xl border border-zen-200 bg-surface text-sm text-zen-500"
        role="status"
      >
        Preparing your calendar…
      </div>
    ),
  }
);

type EventGroup = 'events' | 'tasks' | 'reminders' | 'notes';
const GROUPS: { id: EventGroup; label: string; color: string }[] = [
  { id: 'events', label: 'Events', color: 'bg-sage-600' },
  { id: 'tasks', label: 'Tasks', color: 'bg-zen-600' },
  { id: 'reminders', label: 'Reminders', color: 'bg-warm-600' },
  { id: 'notes', label: 'Notes', color: 'bg-zen-400' },
];
const TYPE_GROUP: Record<CalendarEventType, EventGroup> = {
  event: 'events',
  task_due: 'tasks',
  task_reminder: 'reminders',
  zen_reminder: 'reminders',
  note: 'notes',
};
const COLORS: Record<CalendarEventType, string> = {
  event: '#267b6b',
  task_due: '#466f8d',
  task_reminder: '#7461aa',
  zen_reminder: '#7461aa',
  note: '#626f80',
};
const buttonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zen-200 bg-surface px-3 py-2 text-sm font-medium text-zen-700 transition-colors hover:bg-zen-50 disabled:opacity-50';

function toRecord(event: CalendarEvent): CalendarEventRecord {
  return {
    id: `event_${event.id}_${event.start_time.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    entityId: event.id,
    type: 'event',
    title: event.title,
    description: event.description,
    start: event.start_time,
    end: event.end_time,
    allDay: event.all_day,
    scope: 'personal',
    metadata: {
      eventId: event.id,
      canEdit: true,
      location: event.location,
      importSource: event.import_source,
      importUid: event.import_uid,
    },
  };
}

export default function CalendarPage() {
  const router = useRouter();
  const { user, authChecked } = useAuthSession();
  const [mobileSection, setMobileSection] = useState('calendar');
  const [scope, setScope] = useState<CalendarScope>('all');
  const [view, setView] = useState<CalendarViewType>('dayGridMonth');
  const [viewReady, setViewReady] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [range, setRange] = useState(() => ({
    start: startOfMonth(new Date()),
    end: startOfMonth(addMonths(new Date(), 1)),
  }));
  const [groups, setGroups] = useState<EventGroup[]>([
    'events',
    'tasks',
    'reminders',
    'notes',
  ]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CalendarEventRecord | null>(null);
  const [editor, setEditor] = useState<{
    initial?: CalendarSelection;
    event?: CalendarEventRecord;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authChecked && !user) router.replace('/');
  }, [authChecked, user, router]);

  useEffect(() => {
    if (window.matchMedia('(max-width: 639px)').matches) setView('listWeek');
    setViewReady(true);
  }, []);

  const { events, isLoading, isValidating, error, refresh, mutate } =
    useCalendarData(user?.id ?? null, {
      start: range.start,
      end: range.end,
      scope,
      pause: !authChecked,
    });
  const { createEvent, updateEvent, deleteEvent, importFromIcs } =
    useCalendarEvents(user?.id ?? null);
  const filtered = useMemo(
    () =>
      events.filter((event) => {
        if (!groups.includes(TYPE_GROUP[event.type])) return false;
        const query = search.trim().toLocaleLowerCase();
        const location =
          event.metadata && 'location' in event.metadata
            ? event.metadata.location
            : '';
        return (
          !query ||
          `${event.title} ${event.description ?? ''} ${location ?? ''}`
            .toLocaleLowerCase()
            .includes(query)
        );
      }),
    [events, groups, search]
  );
  const calendarEvents = useMemo<CalendarViewEvent[]>(
    () =>
      filtered.map((event) => ({
        ...event,
        backgroundColor: COLORS[event.type],
        borderColor: COLORS[event.type],
        textColor: '#ffffff',
      })),
    [filtered]
  );
  const upcoming = useMemo(
    () =>
      [...filtered]
        .filter((event) => calendarEventDate(event, 'end') > new Date())
        .sort(
          (a, b) =>
            calendarEventDate(a).getTime() - calendarEventDate(b).getTime()
        )
        .slice(0, 5),
    [filtered]
  );

  const handleDatesChange = useCallback<CalendarViewProps['onDatesChange']>(
    (payload) => {
      setRange((previous) =>
        previous.start.getTime() === payload.range.start.getTime() &&
        previous.end.getTime() === payload.range.end.getTime()
          ? previous
          : payload.range
      );
      setView(payload.view);
      setCurrentDate((previous) =>
        previous.getTime() === payload.currentDate.getTime()
          ? previous
          : payload.currentDate
      );
    },
    []
  );
  const openCreate = useCallback((initial?: CalendarSelection) => {
    setSelected(null);
    setEditor(initial ? { initial } : {});
    setActionError(null);
  }, []);
  const revalidate = () => {
    void refresh().catch(() =>
      setActionError('Your change was saved. Refresh to reload the calendar.')
    );
  };
  const cacheSaved = async (saved: CalendarEvent) => {
    const record = toRecord(saved);
    await mutate(
      (previous) =>
        previous
          ? {
              ...previous,
              events: [
                ...previous.events.filter(
                  (item) =>
                    !(item.type === 'event' && item.entityId === saved.id)
                ),
                record,
              ],
            }
          : {
              events: [record],
              range: {
                start: range.start.toISOString(),
                end: range.end.toISOString(),
              },
              generatedAt: new Date().toISOString(),
            },
      { revalidate: false }
    );
  };
  const save = async (input: CreateCalendarEventInput) => {
    const saved = editor?.event
      ? await updateEvent(editor.event.entityId, input)
      : await createEvent(input);
    await cacheSaved(saved);
    setActionError(null);
    setEditor(null);
    setSelected(null);
    if (scope === 'shared') setScope('all');
    if (!groups.includes('events'))
      setGroups((previous) => [...previous, 'events']);
    setSearch('');
    setCurrentDate(
      saved.all_day
        ? new Date(`${saved.start_time.slice(0, 10)}T12:00:00`)
        : new Date(saved.start_time)
    );
    setNotice(editor?.event ? 'Event updated.' : 'Event created.');
    revalidate();
  };
  const remove = async () => {
    if (!selected) return;
    await deleteEvent(selected.entityId);
    setActionError(null);
    await mutate(
      (previous) =>
        previous
          ? {
              ...previous,
              events: previous.events.filter(
                (item) =>
                  item.entityId !== selected.entityId || item.type !== 'event'
              ),
            }
          : previous,
      { revalidate: false }
    );
    setSelected(null);
    setNotice('Event deleted.');
    revalidate();
  };
  const moveEvent: NonNullable<CalendarViewProps['onEventMove']> = async (
    record,
    start,
    end,
    allDay
  ) => {
    try {
      const saved = await updateEvent(record.entityId, {
        start: start.toISOString(),
        end: end.toISOString(),
        allDay,
      });
      await cacheSaved(saved);
      setActionError(null);
      setNotice('Event rescheduled.');
      revalidate();
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : 'Unable to reschedule this event.'
      );
      throw cause;
    }
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || importing) return;
    setImporting(true);
    setActionError(null);
    setNotice(null);
    try {
      if (!/\.ics$/i.test(file.name))
        throw new Error('Choose an .ics calendar file.');
      if (file.size > 5 * 1024 * 1024)
        throw new Error('Choose a calendar file smaller than 5 MB.');
      const result = await importFromIcs(file);
      if (scope === 'shared') setScope('all');
      setGroups((previous) =>
        previous.includes('events') ? previous : [...previous, 'events']
      );
      setSearch('');
      setNotice(
        `${result.imported} imported, ${result.updated} updated.${result.truncated ? ` ${result.truncated} events exceeded the 500-event limit.` : ''}`
      );
      revalidate();
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : 'Unable to import this calendar.'
      );
    } finally {
      setImporting(false);
    }
  };
  const openSource = () => {
    if (!selected) return;
    router.push(
      selected.type === 'note'
        ? '/notes'
        : selected.type === 'zen_reminder'
          ? '/reminders'
          : '/tasks'
    );
    setSelected(null);
  };
  const canEdit =
    selected?.type === 'event' &&
    Boolean(
      selected.metadata &&
      'canEdit' in selected.metadata &&
      selected.metadata.canEdit === true
    );

  if (!authChecked || !user)
    return (
      <div
        role="status"
        className="flex min-h-[60vh] items-center justify-center text-sm text-zen-600"
      >
        Opening your calendar…
      </div>
    );

  return (
    <div className="mobile-screen mobile-screen-frame calendar-screen min-h-screen bg-zen-50/50">
      <header className="workspace-header border-b border-zen-200/70 bg-surface/90">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <CalendarDays className="h-6 w-6 text-sage-600" />
              <h1 className="text-2xl font-semibold tracking-tight text-zen-900">
                Calendar
              </h1>
            </div>
            <p className="mt-1 hidden text-sm text-zen-500 sm:block">
              A little space for everything you have planned.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sage-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sage-700"
              onClick={() => openCreate()}
            >
              <Plus className="h-4 w-4" />
              New event
            </button>
          </div>
        </div>
      </header>
      <main className="mobile-screen-main calendar-main mx-auto max-w-[1600px] space-y-5 px-3 py-5 sm:px-6 lg:px-8 lg:py-7">
        <MobileSectionNav value={mobileSection} onChange={setMobileSection} sections={[{ value: 'calendar', label: 'Calendar' }, { value: 'filters', label: 'Filters' }, { value: 'upcoming', label: 'Coming up' }]} />
        <div data-mobile-panel={mobileSection === 'filters'} className="calendar-filters flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[140px] basis-full sm:max-w-sm sm:flex-1 sm:basis-auto">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-zen-500"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search this calendar view"
                placeholder="Search this view"
                className="min-h-11 w-full rounded-xl border border-zen-200 bg-surface py-2 pl-10 pr-3 text-base text-zen-900 placeholder:text-zen-500 sm:text-sm"
              />
            </div>
            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as CalendarScope);
                setSelected(null);
              }}
              aria-label="Filter calendar scope"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-zen-200 bg-surface px-3 text-sm font-medium text-zen-700 sm:flex-none"
            >
              <option value="all">All spaces</option>
              <option value="personal">Personal</option>
              <option value="shared">Shared</option>
            </select>
            <button
              type="button"
              className={buttonClass}
              disabled={isValidating}
              aria-label="Refresh calendar"
              onClick={() => {
                setActionError(null);
                void refresh().catch(() =>
                  setActionError('Unable to refresh. Please try again.')
                );
              }}
            >
              <RefreshCcw
                aria-hidden="true"
                className={`h-4 w-4 ${isValidating ? 'motion-safe:animate-spin' : ''}`}
              />
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={importing}
              onClick={() => importRef.current?.click()}
              aria-label="Import .ics calendar"
            >
              <Upload className="h-4 w-4" />
              <span>{importing ? 'Importing…' : 'Import'}</span>
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".ics,text/calendar"
              onChange={importFile}
              className="hidden"
              aria-label="Calendar file"
            />
          </div>
          <div
            className="grid grid-cols-4 items-center gap-1.5 sm:flex sm:flex-wrap"
            role="group"
            aria-label="Calendar sources"
          >
            {GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                aria-pressed={groups.includes(group.id)}
                onClick={() =>
                  setGroups((previous) =>
                    previous.includes(group.id)
                      ? previous.filter((id) => id !== group.id)
                      : [...previous, group.id]
                  )
                }
                className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border px-1 text-xs transition-colors sm:px-3 sm:text-sm ${groups.includes(group.id) ? 'border-zen-200/70 bg-surface text-zen-800 shadow-soft' : 'border-transparent text-zen-500 line-through hover:bg-surface'}`}
              >
                <span
                  className={`hidden h-4 w-4 items-center justify-center rounded sm:flex ${groups.includes(group.id) ? group.color : 'border border-zen-300'}`}
                >
                  {groups.includes(group.id) && (
                    <Check className="h-3 w-3 text-white" />
                  )}
                </span>
                {group.label}
              </button>
            ))}
            {(search || groups.length !== 4) && (
              <button
                type="button"
                onClick={() => {
                  setGroups(GROUPS.map((group) => group.id));
                  setSearch('');
                }}
                className="col-span-4 min-h-11 rounded-xl px-3 text-sm text-sage-700 underline-offset-4 hover:underline"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
        {(actionError || error) && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/40 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300"
          >
            <span>
              {actionError || `Unable to load your calendar. ${error}`}
            </span>
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 font-semibold underline"
              onClick={() => {
                setActionError(null);
                void refresh().catch(() =>
                  setActionError(
                    'Unable to load the calendar. Please try again.'
                  )
                );
              }}
            >
              Try again
            </button>
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border border-sage-300/50 bg-sage-100/50 px-4 py-2 text-sm text-sage-800"
          >
            <span>{notice}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-sage-200/40"
              onClick={() => setNotice(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="calendar-grid mobile-panel-layout grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_260px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <section data-mobile-panel={mobileSection === 'calendar'} aria-label="Your calendar" className="calendar-primary min-w-0">
            {viewReady && (
              <CalendarView
                events={calendarEvents}
                view={view}
                date={currentDate}
                onDatesChange={handleDatesChange}
                onEventClick={(event) => setSelected(event)}
                onSelect={(selection) => openCreate(selection)}
                onEventMove={moveEvent}
                loading={isLoading}
              />
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs leading-relaxed text-zen-500">
              <span aria-live="polite">
                {isLoading
                  ? 'Loading your plans…'
                  : `${filtered.length} ${filtered.length === 1 ? 'item' : 'items'} in this view`}
                {isValidating && !isLoading ? ' · Updating…' : ''}
              </span>
              <span>
                Local time · {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </span>
            </div>
            {!isLoading && filtered.length === 0 && view !== 'listWeek' && (
              <div className="mt-4 rounded-2xl border border-dashed border-zen-200 p-5 text-center">
                <p className="text-sm text-zen-600">
                  {events.length
                    ? 'No items match your filters.'
                    : 'There’s room for something good.'}
                </p>
                <button
                  type="button"
                  className="mt-1 min-h-11 rounded-lg px-3 text-sm font-semibold text-sage-700"
                  onClick={() =>
                    events.length
                      ? (setSearch(''),
                        setGroups(GROUPS.map((group) => group.id)))
                      : openCreate()
                  }
                >
                  {events.length ? 'Reset filters' : 'Plan an event'}
                </button>
              </div>
            )}
          </section>
          <aside
            data-mobile-panel={mobileSection === 'upcoming'}
            className="calendar-upcoming hidden min-w-0 xl:block"
            aria-label="Coming up in this view"
          >
            <div className="flex items-center justify-between border-b border-zen-200 pb-4 pt-2">
              <h2 className="font-semibold text-zen-900">Coming up</h2>
              <span className="text-xs text-zen-500">In this view</span>
            </div>
            {upcoming.length ? (
              <div className="divide-y divide-zen-200/60">
                {upcoming.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelected(event)}
                    className="group flex w-full items-start gap-3 rounded-lg px-1 py-5 text-left transition-colors hover:bg-surface"
                  >
                    <div className="w-10 shrink-0 text-center">
                      <span className="block text-[11px] uppercase text-zen-500">
                        {format(calendarEventDate(event), 'MMM')}
                      </span>
                      <span className="text-xl font-semibold text-zen-800">
                        {format(calendarEventDate(event), 'd')}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-zen-900">
                        {event.title}
                      </p>
                      <p className="mt-1 text-xs text-zen-500">
                        {event.allDay
                          ? 'All day'
                          : format(new Date(event.start), 'HH:mm')}{' '}
                        · {EVENT_LABELS[event.type]}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zen-400 group-hover:text-sage-600" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-8">
                <CalendarDays className="mb-3 h-7 w-7 text-sage-500" />
                <p className="text-sm text-zen-600">
                  No more plans in this range.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-zen-500">
                  Browse another week or make a little time for yourself.
                </p>
              </div>
            )}
            <p className="mt-5 border-t border-zen-200 pt-4 text-xs leading-relaxed text-zen-500">
              Select a date to make a plan. In week and day views, drag across a
              time slot. You can move and resize your own events.
            </p>
          </aside>
        </div>
      </main>
      {editor && (
        <CalendarEventForm
          key={editor.event?.id ?? 'new'}
          initial={editor.initial}
          event={editor.event}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
      {selected && !editor && (
        <CalendarEventDetails
          key={selected.id}
          event={selected}
          onClose={() => setSelected(null)}
          onEdit={
            canEdit
              ? () => {
                  setEditor({ event: selected });
                  setSelected(null);
                }
              : undefined
          }
          onDelete={canEdit ? remove : undefined}
          onOpenSource={selected.type !== 'event' ? openSource : undefined}
        />
      )}
    </div>
  );
}
