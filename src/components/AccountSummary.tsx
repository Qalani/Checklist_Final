import { useState } from 'react';

interface AccountSummaryProps {
  email?: string | null;
  statusText?: string;
  syncing?: boolean;
  syncingLabel?: string;
  signOutLabel?: string;
  onSignOut: () => Promise<void> | void;
}

export default function AccountSummary({
  email,
  statusText = 'Signed in',
  syncing = false,
  syncingLabel = 'Syncing',
  signOutLabel = 'Sign out',
  onSignOut,
}: AccountSummaryProps) {
  const [pending, setPending] = useState(false);

  const handleSignOut = async () => {
    if (pending) {
      return;
    }

    setPending(true);
    try {
      await onSignOut();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-zen-200 bg-surface/70 px-3 py-2 shadow-soft sm:w-auto sm:flex-row sm:items-center">
      <div className="w-full sm:text-right">
        <p className="text-sm font-medium text-zen-900">{email ?? 'Account'}</p>
        <p className="text-xs text-zen-500">{statusText}</p>
        {syncing ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-zen-400 sm:justify-end">
            <span className="h-2 w-2 animate-pulse rounded-full bg-sage-500" />
            {syncingLabel}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          void handleSignOut();
        }}
        disabled={pending}
        className="w-full rounded-xl bg-zen-100 px-3 py-1.5 text-xs font-semibold text-zen-700 transition-colors hover:bg-zen-200 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        {pending ? 'Signing out…' : signOutLabel}
      </button>
    </div>
  );
}
