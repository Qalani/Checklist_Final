'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing, Check, LogOut, Settings2 } from 'lucide-react';

import ThemeSwitcher from './ThemeSwitcher';

interface SettingsMenuProps {
  userEmail?: string | null;
  onSignOut: () => Promise<void> | void;
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const updatePanelPosition = useCallback(() => {
    if (!buttonRef.current) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const gutter = 8;
    const availableWidth = Math.max(window.innerWidth - gutter * 2, 0);
    const panelWidth = Math.min(320, availableWidth);
    const maxLeft = Math.max(window.innerWidth - panelWidth - gutter, gutter);
    const idealLeft = rect.right - panelWidth;
    const left = Math.min(Math.max(idealLeft, gutter), maxLeft);

    setPanelPosition({
      top: rect.bottom + 8,
      left,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current) {
        return;
      }

      const target = event.target as Node | null;
      if (
        !target ||
        containerRef.current.contains(target) ||
        (panelRef.current && panelRef.current.contains(target))
      ) {
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
    if (!open) {
      return;
    }

    updatePanelPosition();

    const handleReposition = () => {
      updatePanelPosition();
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, updatePanelPosition]);

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

  const handleSignOut = useCallback(async () => {
    if (signingOut) {
      return;
    }

    setSignOutError(null);
    setSigningOut(true);

    try {
      await Promise.resolve(onSignOut());
      setOpen(false);
    } catch (error) {
      console.error('Failed to sign out', error);
      setSignOutError('Unable to sign out right now. Please try again.');
    } finally {
      setSigningOut(false);
    }
  }, [onSignOut, signingOut]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="inline-flex items-center gap-2 rounded-xl border border-zen-200/70 bg-surface/80 px-3 py-2 text-sm font-medium text-zen-600 transition-colors hover:bg-surface/60"
        aria-haspopup="dialog"
        aria-expanded={open}
        ref={buttonRef}
      >
        <Settings2 className="h-4 w-4" />
        Settings
      </button>

      {open && typeof document !== 'undefined' && panelPosition
        ? createPortal(
            <div
              ref={panelRef}
              style={{ top: panelPosition.top, left: panelPosition.left }}
              className="fixed z-[1000] w-80 max-w-[min(20rem,calc(100vw-1rem))] rounded-3xl border border-zen-200/80 bg-surface p-4 shadow-lift"
            >
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
                      className="mt-1 h-4 w-4 rounded border-zen-300 text-zen-600 focus:ring-zen-400"
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
                      className="mt-1 h-4 w-4 rounded border-zen-300 text-zen-600 focus:ring-zen-400"
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
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        void handleSignOut();
                      }}
                      disabled={signingOut}
                      className="w-full rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {signingOut ? 'Signing out…' : 'Sign out'}
                    </button>
                    {signOutError ? (
                      <p className="text-xs text-red-600" role="alert" aria-live="polite">
                        {signOutError}
                      </p>
                    ) : null}
                  </div>
                </section>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
