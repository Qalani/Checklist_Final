'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, Check, LogOut, Settings2 } from 'lucide-react';

import ThemeSwitcher from './ThemeSwitcher';

interface SettingsMenuProps {
  userEmail?: string | null;
  onSignOut: () => void;
}

type PreferenceKey = 'inAppNotifications' | 'emailDigests';

interface StoredPreferences {
  inAppNotifications: boolean;
  emailDigests: boolean;
}

const DEFAULT_PREFERENCES: StoredPreferences = {
  inAppNotifications: true,
  emailDigests: false,
};

export default function SettingsMenu({ userEmail, onSignOut }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<StoredPreferences>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_PREFERENCES;
    }

    try {
      const stored = window.localStorage.getItem('zen-settings-preferences');
      if (!stored) {
        return DEFAULT_PREFERENCES;
      }
      const parsed = JSON.parse(stored) as Partial<StoredPreferences>;
      return {
        ...DEFAULT_PREFERENCES,
        ...parsed,
      };
    } catch (error) {
      console.warn('Failed to parse stored preferences', error);
      return DEFAULT_PREFERENCES;
    }
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current) {
        return;
      }

      const target = event.target as Node | null;
      if (!target || containerRef.current.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('zen-settings-preferences', JSON.stringify(preferences));
  }, [preferences]);

  const togglePreference = (key: PreferenceKey) => {
    setPreferences(current => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="inline-flex items-center gap-2 rounded-xl border border-zen-200/70 bg-surface/80 px-3 py-2 text-sm font-medium text-zen-600 transition-colors hover:bg-surface/60"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Settings2 className="h-4 w-4" />
        Settings
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[min(20rem,calc(100vw-1rem))] rounded-3xl border border-zen-200/80 bg-surface shadow-lift p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zen-900">Workspace settings</p>
              {userEmail ? <p className="text-xs text-zen-500">Signed in as {userEmail}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-transparent p-1 text-zen-400 transition hover:border-zen-200 hover:text-zen-600"
              aria-label="Close settings"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zen-500">
                <Bell className="h-4 w-4" />
                Notifications
              </div>
              <label className="flex items-start justify-between gap-4 rounded-2xl border border-zen-200/70 bg-surface/80 p-3 text-sm text-zen-600 dark:text-zen-200">
                <span>
                  <span className="block font-medium text-zen-800 dark:text-zen-100">In-app alerts</span>
                  <span className="text-xs text-zen-500 dark:text-zen-300">Show reminders and updates inside Zen Workspace.</span>
                </span>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-sage-300 text-sage-600 focus:ring-sage-500"
                  checked={preferences.inAppNotifications}
                  onChange={() => togglePreference('inAppNotifications')}
                />
              </label>
              <label className="flex items-start justify-between gap-4 rounded-2xl border border-zen-200/70 bg-surface/80 p-3 text-sm text-zen-600 dark:text-zen-200">
                <span>
                  <span className="block font-medium text-zen-800 dark:text-zen-100">Email digests</span>
                  <span className="text-xs text-zen-500 dark:text-zen-300">Receive a weekly summary of tasks and shared activity.</span>
                </span>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-sage-300 text-sage-600 focus:ring-sage-500"
                  checked={preferences.emailDigests}
                  onChange={() => togglePreference('emailDigests')}
                />
              </label>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zen-500">
                <BellRing className="h-4 w-4" />
                Appearance & theme
              </div>
              <ThemeSwitcher />
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zen-500">
                <LogOut className="h-4 w-4" />
                Account
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="w-full rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100"
              >
                Sign out
              </button>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
