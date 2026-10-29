'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  CheckSquare,
  Home,
  Leaf,
  ListTodo,
  MoreHorizontal,
  Sparkles,
  StickyNote,
  Users,
  X,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/notes', label: 'Notes', icon: StickyNote },
  { href: '/lists', label: 'Lists', icon: ListTodo },
  { href: '/reminders', label: 'Reminders', icon: Bell },
  { href: '/friends', label: 'Friends', icon: Users },
  { href: '/zen-insights', label: 'Zen Insights', icon: Sparkles },
] as const;

/** Persistent workspace navigation. Public shared lists remain distraction-free. */
export function GlobalNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const demoMode = searchParams?.get('demo') === '1';
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : (pathname?.startsWith(href) ?? false);
  const navigationHref = (href: string) => (demoMode ? `${href}?demo=1` : href);
  const moreActive = NAV_ITEMS.slice(4).some(({ href }) => isActive(href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    mobileNavRef.current?.querySelector<HTMLAnchorElement>('#more-navigation a')?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      if (!mobileNavRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen]);

  if (pathname?.startsWith('/lists/share')) return null;

  return (
    <>
      <div
        ref={mobileNavRef}
        className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md lg:hidden"
      >
        {moreOpen ? (
          <nav
            id="more-navigation"
            aria-label="More navigation"
            className="mb-2 grid grid-cols-2 gap-1 rounded-2xl border border-zen-100 bg-surface p-2 shadow-medium"
          >
            {NAV_ITEMS.slice(4).map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={navigationHref(href)}
                aria-current={isActive(href) ? 'page' : undefined}
                onClick={() => setMoreOpen(false)}
                className={`flex min-h-12 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600 ${isActive(href) ? 'bg-sage-100 text-sage-700' : 'text-zen-700 hover:bg-zen-50'}`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        ) : null}
        <nav
          aria-label="Main navigation"
          className="grid grid-cols-5 rounded-2xl border border-zen-100 bg-surface/95 p-1.5 shadow-medium backdrop-blur-xl"
        >
          {NAV_ITEMS.slice(0, 4).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={navigationHref(href)}
              aria-current={isActive(href) ? 'page' : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600 ${isActive(href) ? 'bg-sage-100 text-sage-700' : 'text-zen-600 hover:bg-zen-50 hover:text-zen-900'}`}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
          <button
            ref={moreButtonRef}
            type="button"
            aria-expanded={moreOpen}
            aria-controls="more-navigation"
            aria-label="More navigation"
            onClick={() => setMoreOpen((open) => !open)}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600 ${moreOpen || moreActive ? 'bg-sage-100 text-sage-700' : 'text-zen-600 hover:bg-zen-50 hover:text-zen-900'}`}
          >
            {moreOpen ? (
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
            <span>More</span>
          </button>
        </nav>
      </div>

      <aside className="workspace-sidebar fixed inset-y-0 left-0 z-40 hidden w-56 flex-col overflow-y-auto border-r border-zen-100 bg-surface px-4 pb-6 pt-8 lg:flex">
        <Link
          href={navigationHref('/')}
          aria-label="Zen Workspace home"
          className="mx-2 flex min-h-11 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-sage-700">
            <Leaf className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-zen-900">Zen Workspace</span>
        </Link>
        <p className="mb-3 mt-11 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zen-600">
          Your workspace
        </p>
        <nav aria-label="Main navigation" className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }, index) => (
            <div key={href} className={index === 7 ? 'mt-5 border-t border-zen-100 pt-5' : undefined}>
              <Link
                href={navigationHref(href)}
                aria-current={isActive(href) ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600 ${isActive(href) ? 'bg-sage-100/80 text-sage-700' : 'text-zen-700 hover:bg-zen-50 hover:text-zen-900'}`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
                {isActive(href) ? (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sage-600" aria-hidden="true" />
                ) : null}
              </Link>
            </div>
          ))}
        </nav>
        <div className="mt-auto px-3 pt-10">
          <span className="mb-3 block h-px w-8 bg-sage-200" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-zen-600">
            A little space
            <br />
            to find your focus.
          </p>
        </div>
      </aside>
    </>
  );
}
