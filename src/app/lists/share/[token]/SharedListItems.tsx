"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Square } from 'lucide-react';

export type SharedListItem = {
  id: string;
  content: string;
  completed: boolean;
};

type SharedListItemsProps = {
  token: string;
  items: SharedListItem[];
};

const STORAGE_PREFIX = 'zen-shared-list-progress';
const URL_PATTERN = /([([{<]?)(https?:\/\/[^\s)\]\}>]+)([)\]\}>]?)/gi;

function getStorageKey(token: string) {
  return `${STORAGE_PREFIX}:${token}`;
}

type Overrides = Record<string, boolean>;

type StoredValue = {
  overrides: Overrides;
};

export default function SharedListItems({ token, items }: SharedListItemsProps) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [isHydrated, setIsHydrated] = useState(false);

  const baseCompletion = useMemo(() => {
    const map = new Map<string, boolean>();
    items.forEach(item => {
      map.set(item.id, item.completed);
    });
    return map;
  }, [items]);

  useEffect(() => {
    const allowedIds = new Set(items.map(item => item.id));

    setOverrides(prev => {
      const next: Overrides = {};
      Object.entries(prev).forEach(([id, value]) => {
        if (allowedIds.has(id) && typeof value === 'boolean') {
          next[id] = value;
        }
      });
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(getStorageKey(token));
      if (raw) {
        const parsed: StoredValue = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.overrides && typeof parsed.overrides === 'object') {
          const next: Overrides = {};
          Object.entries(parsed.overrides).forEach(([id, value]) => {
            if (typeof value === 'boolean') {
              next[id] = value;
            }
          });
          setOverrides(next);
        }
      }
    } catch (error) {
      console.warn('Unable to restore shared list progress.', error);
    } finally {
      setIsHydrated(true);
    }
  }, [token]);

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') {
      return;
    }

    const stored: StoredValue = { overrides };
    try {
      window.localStorage.setItem(getStorageKey(token), JSON.stringify(stored));
    } catch (error) {
      console.warn('Unable to persist shared list progress.', error);
    }
  }, [overrides, token, isHydrated]);

  const displayedItems = useMemo(
    () =>
      items.map(item => {
        const override = overrides[item.id];
        const completed = typeof override === 'boolean' ? override : item.completed;
        return { ...item, completed };
      }),
    [items, overrides],
  );

  const handleToggle = (id: string) => {
    setOverrides(prev => {
      const base = baseCompletion.get(id) ?? false;
      const current = Object.prototype.hasOwnProperty.call(prev, id) ? prev[id] : base;
      const toggled = !current;

      const next: Overrides = { ...prev };
      if (toggled === base) {
        delete next[id];
      } else {
        next[id] = toggled;
      }
      return next;
    });
  };

  const renderContentWithLinks = (content: string) => {
    if (!content) {
      return <span className="text-zen-300">No details provided.</span>;
    }

    const matches = [...content.matchAll(URL_PATTERN)];
    if (matches.length === 0) {
      return content;
    }

    const parts: ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match) => {
      const fullStart = match.index ?? 0;
      const leading = match[1] ?? '';
      const url = match[2];
      const start = fullStart + leading.length;

      if (start > lastIndex) {
        parts.push(
          <span key={`text-${parts.length}`}>{content.slice(lastIndex, start)}</span>,
        );
      }

      parts.push(
        <a
          key={`link-${parts.length}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sage-700 underline"
          onClick={(event: MouseEvent<HTMLAnchorElement>) => event.stopPropagation()}
          onKeyDown={(event: KeyboardEvent<HTMLAnchorElement>) => event.stopPropagation()}
        >
          {url}
        </a>,
      );

      lastIndex = start + url.length;
    });

    if (lastIndex < content.length) {
      parts.push(<span key={`text-${parts.length}`}>{content.slice(lastIndex)}</span>);
    }

    return parts;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleToggle(id);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {displayedItems.map(item => {
        const Icon = item.completed ? CheckSquare : Square;
        const textClasses = item.completed ? 'line-through text-zen-400' : 'text-zen-700';
        const iconClasses = item.completed ? 'text-sage-600' : 'text-sage-400';

        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => handleToggle(item.id)}
            onKeyDown={event => handleKeyDown(event, item.id)}
            className="flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-zen-200 bg-surface/80 p-4 text-left transition-colors hover:border-sage-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-500"
            aria-pressed={item.completed}
          >
            <Icon className={`h-5 w-5 ${iconClasses}`} aria-hidden />
            <p className={`flex-1 whitespace-pre-wrap text-sm leading-relaxed ${textClasses}`}>
              {renderContentWithLinks(item.content)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
