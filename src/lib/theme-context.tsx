'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_THEME_ID, ThemeId, ThemeOption, isThemeId, themeOptions } from './themes';

interface ThemeContextValue {
  theme: ThemeOption;
  themes: ThemeOption[];
  setTheme: (id: ThemeId) => void;
}

const STORAGE_KEY = 'zen-tasks-theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored && isThemeId(stored)) {
          return stored;
        }
      } catch (error) {
        console.warn('Unable to read stored theme preference', error);
      }
    }

    return DEFAULT_THEME_ID;
  });

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const theme = themeOptions.find(entry => entry.id === themeId) ?? themeOptions[0];
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    root.dataset.themeMode = theme.type;
    root.style.colorScheme = theme.type;

    if (theme.type === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, theme.id);
    } catch (error) {
      console.warn('Unable to persist theme preference', error);
    }
  }, [themeId]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = themeOptions.find(entry => entry.id === themeId) ?? themeOptions[0];
    return {
      theme,
      themes: themeOptions,
      setTheme,
    };
  }, [setTheme, themeId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
