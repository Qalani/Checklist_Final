'use client';

import { useId, useRef } from 'react';
import { Check, Moon, Palette, Sun, X } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';

export function ThemePreview({ colors }: { colors: readonly [string, string, string] }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 -space-x-1">
      {colors.map(color => (
        <span
          key={color}
          className="h-6 w-6 rounded-full border border-zen-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

function ThemeChoices() {
  const { theme, themes, setTheme } = useTheme();
  const groupId = useId();

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Colour theme</legend>
      {(['light', 'dark'] as const).map(mode => (
        <div key={mode}>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-zen-600">
            {mode === 'light' ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
            {mode === 'light' ? 'Light themes' : 'Dark themes'}
          </p>
          <div className="space-y-2">
            {themes.filter(option => option.type === mode).map(option => (
              <label key={option.id} className="relative block cursor-pointer">
                <input
                  type="radio"
                  name={groupId}
                  value={option.id}
                  checked={theme.id === option.id}
                  onChange={() => setTheme(option.id)}
                  className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span className="flex min-h-20 items-center gap-3 rounded-xl border border-zen-200 bg-zen-50/40 p-3 transition-colors hover:bg-zen-100/70 peer-checked:border-sage-500 peer-checked:bg-sage-100/70 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sage-500">
                  <ThemePreview colors={option.preview} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-zen-900">{option.label}</span>
                    <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-zen-600">{option.description}</span>
                  </span>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-sage-700" aria-hidden="true">
                    {theme.id === option.id ? <Check className="h-4 w-4" /> : null}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

export default function ThemeSwitcher({ inline = false }: { inline?: boolean }) {
  const { theme } = useTheme();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  if (inline) return <ThemeChoices />;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialogRef.current?.showModal();
          dialogRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
        }}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zen-200 bg-surface px-3 py-2 text-sm font-medium text-zen-700 transition-colors hover:bg-zen-100/70"
        aria-haspopup="dialog"
        aria-label={`Change theme, current theme: ${theme.label}`}
      >
        <Palette className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{theme.label}</span>
        <span className="sm:hidden">Theme</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={event => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
              event.currentTarget.close();
            }
          }
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-zen-200 bg-surface p-5 text-zen-900 shadow-lift backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">Choose your theme</h2>
            <p className="mt-1 text-xs text-zen-600">Preview instantly. Your choice saves automatically.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close theme picker" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zen-600 hover:bg-zen-100">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <ThemeChoices />
        <button type="button" onClick={() => dialogRef.current?.close()} className="mt-5 min-h-11 w-full rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-800">Done</button>
      </dialog>
    </>
  );
}
