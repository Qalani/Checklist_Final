'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CalendarDays, CheckSquare, Home, ListTodo, StickyNote, Users } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/notes', label: 'Notes', icon: StickyNote },
  { href: '/lists', label: 'Lists', icon: ListTodo },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/friends', label: 'Friends', icon: Users },
] as const;

/**
 * Persistent global navigation rendered in the root layout.
 *
 * - Mobile  : floating rounded pill bar hovering above the bottom of the screen
 * - Desktop : fixed left sidebar with icon-only buttons (tooltip on hover)
 *
 * Hidden on public shared-list pages (/lists/share/*) which require no auth.
 */
export function GlobalNav() {
  const pathname = usePathname();

  // Don't show on anonymous / public pages
  if (pathname?.startsWith('/lists/share')) return null;

  return (
    <>
      {/* ── Mobile: floating pill nav bar ──────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:hidden">
        <nav
          aria-label="Main navigation"
          className="flex items-stretch rounded-full border border-zen-200/70 bg-surface/92 shadow-lift backdrop-blur-xl dark:border-zen-700/40"
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : (pathname?.startsWith(href) ?? false);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-2.5 text-[10px] font-medium transition-colors first:rounded-l-full last:rounded-r-full ${
                  isActive
                    ? 'text-sage-600 dark:text-sage-400'
                    : 'text-zen-400 hover:text-zen-600 dark:text-zen-500 dark:hover:text-zen-300'
                }`}
              >
                <span className={`rounded-full p-1 transition-colors ${isActive ? 'bg-sage-100/80 dark:bg-sage-900/40' : ''}`}>
                  <Icon
                    className={`h-4 w-4 transition-transform ${isActive ? 'scale-110' : ''}`}
                    aria-hidden="true"
                  />
                </span>
                <span className="leading-none">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Desktop: left icon sidebar ─────────────────────────────────── */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col items-center gap-1 border-r border-zen-200/70 bg-surface/90 py-6 px-3 backdrop-blur-xl lg:flex dark:border-zen-700/40"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : (pathname?.startsWith(href) ?? false);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                isActive
                  ? 'bg-sage-100/80 text-sage-600 dark:bg-sage-900/40 dark:text-sage-400'
                  : 'text-zen-400 hover:bg-zen-100/60 hover:text-zen-700 dark:text-zen-500 dark:hover:bg-zen-800/40 dark:hover:text-zen-300'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {/* Tooltip */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-full ml-2.5 hidden whitespace-nowrap rounded-lg bg-zen-900/90 px-2.5 py-1 text-xs font-medium text-white shadow-lg group-hover:block dark:bg-zen-100/90 dark:text-zen-900"
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
