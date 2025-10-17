'use client';

import { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';

export function ThemePreview({ colors }: { colors: readonly [string, string, string] }) {
  return (
    <div className="flex items-center gap-1">
      {colors.map(color => (
        <span
          key={color}
          className="h-4 w-4 rounded-full border border-black/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export default function ThemeSwitcher() {
  const { theme, themes, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const lightThemes = themes.filter(option => option.type === 'light');
  const darkThemes = themes.filter(option => option.type === 'dark');

  return (
    <div className="relative w-full sm:w-auto" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="px-3 py-2 rounded-xl bg-surface/80 border border-zen-200/70 text-sm font-medium text-zen-600 hover:bg-surface/60 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Palette className="h-4 w-4" />
        <span className="hidden sm:inline">{theme.label}</span>
        <span className="sm:hidden">Theme</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-zen-200/80 bg-surface shadow-lift p-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zen-500">Light themes</p>
            <div className="mt-2 space-y-2">
              {lightThemes.map(option => {
                const isActive = option.id === theme.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setTheme(option.id);
                      setOpen(false);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
                      isActive
                        ? 'border-sage-400/70 bg-sage-500/15 shadow-soft'
                        : 'border-transparent hover:border-zen-200/80 hover:bg-zen-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ThemePreview colors={option.preview} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-zen-900">{option.label}</p>
                        <p className="text-xs text-zen-500">{option.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zen-500">Dark themes</p>
            <div className="mt-2 space-y-2">
              {darkThemes.map(option => {
                const isActive = option.id === theme.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setTheme(option.id);
                      setOpen(false);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
                      isActive
                        ? 'border-sage-400/70 bg-sage-500/15 shadow-soft'
                        : 'border-transparent hover:border-zen-200/80 hover:bg-zen-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ThemePreview colors={option.preview} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-zen-900">{option.label}</p>
                        <p className="text-xs text-zen-500">{option.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
