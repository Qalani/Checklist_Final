'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { Bell, Clock, RefreshCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import ParallaxBackground from '@/components/ParallaxBackground';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ZenPageHeader from '@/components/ZenPageHeader';
import AccountSummary from '@/components/AccountSummary';
import { useAuthSession } from '@/lib/hooks/useAuthSession';
import { useZenReminders } from '@/features/reminders/useZenReminders';
import type { ZenReminder } from '@/types';
import { useNotificationPermission } from '@/lib/hooks/useNotificationPermission';

interface StatusMessage {
  type: 'success' | 'error';
  message: string;
}

const inputClasses =
  'w-full rounded-2xl border border-zen-200/70 bg-white/80 px-4 py-2 text-sm text-zen-700 shadow-inner transition focus:outline-none focus:ring-2 focus:ring-zen-400 dark:border-zen-700/50 dark:bg-zen-900/60 dark:text-zen-100';

const textareaClasses = `${inputClasses} min-h-[140px] resize-none`;

function combineDateAndTime(dateValue: string, timeValue: string): Date | null {
  if (!dateValue) {
    return null;
  }
  const safeTime = timeValue && timeValue.includes(':') ? timeValue : '09:00';
  const candidate = new Date(`${dateValue}T${safeTime}`);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }
  return candidate;
}

function formatReminderTimestamp(reminder: ZenReminder): string {
  const parsed = new Date(reminder.remind_at);
  if (Number.isNaN(parsed.getTime())) {
    return 'Scheduled time unavailable';
  }
  return format(parsed, "MMM d, yyyy 'at' HH:mm");
}

function LoadingState() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-sage-50 to-warm-50 dark:from-[rgb(var(--color-zen-50)_/_0.92)] dark:via-[rgb(var(--color-zen-100)_/_0.82)] dark:to-[rgb(var(--color-sage-100)_/_0.85)]">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zen-200 border-t-zen-500" />
      </div>
    </div>
  );
}

export default function ZenRemindersPage() {
  const router = useRouter();
  const { user, authChecked, signOut } = useAuthSession();
  const {
    reminders,
    status,
    syncing,
    error,
    createReminder,
    deleteReminder,
    refresh,
  } = useZenReminders(user?.id ?? null);
  const {
    permission: notificationPermission,
    statusMessage: notificationStatus,
    requestPermission,
    requesting: requestingNotificationPermission,
  } = useNotificationPermission();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(() => format(new Date(), 'HH:mm'));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      console.error('Unable to resolve timezone for reminders', error);
      return 'UTC';
    }
  }, []);

  useEffect(() => {
    if (!authChecked) {
      return;
    }
    if (!user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [statusMessage]);

  const userEmail = useMemo(() => user?.email ?? user?.user_metadata?.email ?? null, [user]);

  const { upcomingRemindersList, pastRemindersList } = useMemo(() => {
    const upcoming: ZenReminder[] = [];
    const past: ZenReminder[] = [];
    const now = Date.now();

    reminders.forEach((reminder) => {
      const timestamp = new Date(reminder.remind_at).getTime();
      if (Number.isNaN(timestamp)) {
        upcoming.push(reminder);
        return;
      }
      if (timestamp >= now) {
        upcoming.push(reminder);
      } else {
        past.push(reminder);
      }
    });

    upcoming.sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
    past.sort((a, b) => new Date(b.remind_at).getTime() - new Date(a.remind_at).getTime());

    return { upcomingRemindersList: upcoming, pastRemindersList: past };
  }, [reminders]);

  const handleRefresh = useCallback(() => {
    void refresh(true);
  }, [refresh]);

  const handleCreateReminder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    if (!title.trim()) {
      setFormError('Give your reminder a clear title.');
      return;
    }

    const combined = combineDateAndTime(date, time);
    if (!combined) {
      setFormError('Choose a valid date and time for this reminder.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const result = await createReminder({
      title: title.trim(),
      description: description.trim() ? description.trim() : undefined,
      remindAt: combined.toISOString(),
      timezone,
    });

    setSubmitting(false);

    if (result && 'error' in result && result.error) {
      setFormError(result.error);
      setStatusMessage({ type: 'error', message: result.error });
      return;
    }

    setTitle('');
    setDescription('');

    const label = format(combined, "MMM d, yyyy 'at' HH:mm");
    setStatusMessage({ type: 'success', message: `Zen reminder scheduled for ${label}.` });

    try {
      await refresh(true);
    } catch (refreshError) {
      console.error('Failed to refresh reminders after creation', refreshError);
    }
  };

  const handleDeleteReminder = useCallback(
    async (id: string) => {
      const result = await deleteReminder(id);
      if (result && 'error' in result && result.error) {
        setStatusMessage({ type: 'error', message: result.error });
        return;
      }
      setStatusMessage({ type: 'success', message: 'Reminder removed.' });
    },
    [deleteReminder],
  );

  if (!authChecked || !user) {
    return <LoadingState />;
  }

  const bannerMessage = statusMessage ?? (error ? { type: 'error', message: error } : null);

  const notificationInlineMessage =
    notificationPermission !== 'granted' && notificationStatus ? notificationStatus : null;
  const notificationsUnavailable =
    notificationPermission === 'unsupported' || notificationPermission === 'denied';

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-sage-50 to-warm-50 dark:from-[rgb(var(--color-zen-50)_/_0.92)] dark:via-[rgb(var(--color-zen-100)_/_0.82)] dark:to-[rgb(var(--color-sage-100)_/_0.85)]">
      <ParallaxBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <ZenPageHeader
          title="Zen Reminders"
          subtitle="Create mindful nudges that surface on your calendar and keep your rhythm balanced."
          icon={Bell}
          backHref="/"
          backLabel="Overview"
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-full border border-zen-200 bg-surface/80 px-3 py-1.5 text-xs font-semibold text-zen-600 transition-colors hover:border-zen-400 hover:text-zen-700 dark:border-zen-700/40 dark:text-zen-200"
                disabled={syncing}
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sync
              </button>
              <ThemeSwitcher />
            </div>
          }
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <AccountSummary
              email={userEmail}
              statusText="Zen reminders"
              syncing={syncing || status === 'loading'}
              syncingLabel="Updating"
              onSignOut={signOut}
            />
            <div className="rounded-full border border-zen-200/70 bg-surface/70 px-4 py-2 text-xs font-semibold text-zen-600 shadow-soft dark:border-zen-700/40 dark:text-zen-200">
              Local timezone: {timezone}
            </div>
          </div>

          {bannerMessage ? (
            <div
              className={`mb-6 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm shadow-soft ${
                bannerMessage.type === 'success'
                  ? 'border-sage-300/70 bg-sage-50 text-sage-700'
                  : 'border-warm-300/70 bg-warm-50 text-warm-700'
              }`}
            >
              {bannerMessage.type === 'success' ? '✔️' : '⚠️'} {bannerMessage.message}
            </div>
          ) : null}

          {notificationInlineMessage ? (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-zen-200/70 bg-zen-50/80 px-4 py-3 text-sm text-zen-700 shadow-soft dark:border-zen-700/40 dark:bg-zen-900/70 dark:text-zen-100">
              <div className="rounded-full bg-zen-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zen-600 dark:bg-zen-800/80 dark:text-zen-100">
                Notifications
              </div>
              <div className="space-y-2">
                <p>{notificationInlineMessage}</p>
                <p className="text-xs text-zen-500 dark:text-zen-300">
                  Use your browser&apos;s site settings (look for the lock icon near the address bar) to allow notifications, then
                  retry. Reminders will still be saved here even if alerts stay disabled.
                </p>
                {notificationPermission !== 'unsupported' ? (
                  <button
                    type="button"
                    onClick={() => {
                      void requestPermission();
                    }}
                    disabled={requestingNotificationPermission}
                    className="inline-flex items-center gap-2 rounded-full border border-zen-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-zen-700 transition hover:border-zen-400 hover:text-zen-900 disabled:cursor-not-allowed disabled:opacity-70 dark:border-zen-700/60 dark:bg-zen-900/80 dark:text-zen-100"
                  >
                    {requestingNotificationPermission ? 'Requesting…' : 'Retry permission'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-[1.1fr_1.4fr]">
            <section className="rounded-3xl border border-zen-200/70 bg-surface/85 p-6 shadow-large backdrop-blur-xl dark:border-zen-700/40">
              <div className="inline-flex items-center gap-2 rounded-full bg-sage-500/15 px-3 py-1 text-xs font-semibold text-zen-600 dark:bg-zen-400/20 dark:text-zen-100">
                <Bell className="h-4 w-4" />
                New reminder
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zen-900 dark:text-zen-50">Design a calming cue</h2>
              <p className="mt-2 text-sm leading-relaxed text-zen-600 dark:text-zen-300">
                Anchor mindful rituals in your calendar—breathing breaks, posture resets, gratitude moments. We will surface each
                reminder on schedule.
              </p>

              <form onSubmit={handleCreateReminder} className="mt-6 space-y-5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                  Reminder title
                  <input
                    type="text"
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    className={`${inputClasses} mt-1`}
                    placeholder="Stretch, reflect, hydrate..."
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                  Details (optional)
                  <textarea
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    className={`${textareaClasses} mt-1`}
                    placeholder="Add context, prompts, or a short mantra."
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                    Date
                    <input
                      type="date"
                      value={date}
                      onChange={event => setDate(event.target.value)}
                      className={`${inputClasses} mt-1`}
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">
                    Time
                    <input
                      type="time"
                      value={time}
                      onChange={event => setTime(event.target.value)}
                      className={`${inputClasses} mt-1`}
                    />
                  </label>
                </div>

                {formError ? (
                  <p className="text-sm font-semibold text-warm-600 dark:text-warm-400">{formError}</p>
                ) : null}

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full bg-sage-500 px-4 py-2 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-sage-600 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={submitting || notificationsUnavailable}
                >
                  <Bell className="h-4 w-4" />
                  {submitting ? 'Scheduling…' : 'Schedule reminder'}
                </button>
                {notificationsUnavailable ? (
                  <p className="text-xs font-semibold text-warm-600 dark:text-warm-400">
                    Browser alerts are disabled. Enable notifications in your browser settings to schedule reminders here.
                  </p>
                ) : null}
              </form>
            </section>

            <section className="space-y-6 rounded-3xl border border-zen-200/70 bg-surface/85 p-6 shadow-large backdrop-blur-xl dark:border-zen-700/40">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-zen-900 dark:text-zen-50">Upcoming reminders</h2>
                  <p className="text-sm text-zen-600 dark:text-zen-300">
                    {syncing ? 'Syncing latest schedule…' : 'Next mindful cues appear below.'}
                  </p>
                </div>
              </div>

              {upcomingRemindersList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zen-200/80 bg-white/80 p-6 text-sm text-zen-500 shadow-inner dark:border-zen-700/40 dark:bg-zen-900/40 dark:text-zen-300">
                  No upcoming reminders yet. Add one on the left to get started.
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingRemindersList.map(reminder => (
                    <article
                      key={reminder.id}
                      className="flex flex-col gap-4 rounded-2xl border border-zen-200/70 bg-white/90 p-5 shadow-soft transition hover:-translate-y-[1px] hover:shadow-lift dark:border-zen-700/40 dark:bg-zen-900/60"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold text-zen-900 dark:text-zen-50">{reminder.title}</h3>
                          {reminder.description ? (
                            <p className="mt-2 text-sm text-zen-600 dark:text-zen-200">{reminder.description}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteReminder(reminder.id);
                          }}
                          className="inline-flex items-center gap-2 rounded-full border border-zen-200/80 px-3 py-1 text-xs font-semibold text-zen-600 transition-colors hover:border-zen-400 hover:text-zen-700 dark:border-zen-700/40 dark:text-zen-200 dark:hover:border-zen-500 dark:hover:text-zen-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-zen-500 dark:text-zen-300">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {formatReminderTimestamp(reminder)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-zen-100/80 px-3 py-1 text-[11px] font-medium text-zen-600 dark:bg-zen-800/50 dark:text-zen-100">
                          {reminder.timezone ?? timezone}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {pastRemindersList.length > 0 ? (
                <div className="pt-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-300">Past reminders</h3>
                  <div className="mt-3 space-y-3">
                    {pastRemindersList.slice(0, 5).map(reminder => (
                      <article
                        key={reminder.id}
                        className="flex flex-col gap-2 rounded-2xl border border-zen-200/60 bg-white/70 p-4 text-xs text-zen-500 shadow-inner dark:border-zen-700/40 dark:bg-zen-900/40 dark:text-zen-300"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-zen-600 dark:text-zen-100">{reminder.title}</span>
                          <span>{formatReminderTimestamp(reminder)}</span>
                        </div>
                        {reminder.description ? <p>{reminder.description}</p> : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
