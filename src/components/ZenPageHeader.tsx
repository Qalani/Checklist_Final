'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, MoreHorizontal, X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ZenPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  footer?: ReactNode;
}

export default function ZenPageHeader({
  title,
  subtitle,
  icon: Icon,
  backHref,
  backLabel = 'Overview',
  actions,
  footer,
}: ZenPageHeaderProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const actionsId = useId();
  useEffect(() => {
    if (!actionsOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionsOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKey);
    };
  }, [actionsOpen]);
  return (
    <header ref={headerRef} className="workspace-header sticky top-0 z-30 border-b border-zen-100 bg-surface/95 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
        <div className="page-header-row flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-zen-100 px-3 text-sm font-medium text-zen-700 transition-colors hover:bg-zen-50 hover:text-zen-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600"
                aria-label={`Back to ${backLabel}`}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{backLabel}</span>
                <span className="sr-only sm:hidden">Back</span>
              </Link>
            ) : null}
            {Icon ? (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage-100/70 text-sage-700">
                <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
              </div>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-zen-900">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm leading-relaxed text-zen-700">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? (
            <>
              <button
                type="button"
                ref={toggleRef}
                className="page-actions-toggle"
                aria-label="Page actions"
                aria-expanded={actionsOpen}
                aria-controls={actionsId}
                onClick={() => setActionsOpen(open => !open)}
              >
                {actionsOpen ? <X className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
              </button>
              <div id={actionsId} onClick={event => { if ((event.target as HTMLElement).closest('[data-close-page-actions]')) setActionsOpen(false); }} className="page-header-actions flex flex-wrap items-center justify-start gap-2.5 xl:justify-end [&>button]:min-h-11 [&>a]:min-h-11" data-open={actionsOpen}>
                {actions}
              </div>
            </>
          ) : null}
        </div>
        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    </header>
  );
}
