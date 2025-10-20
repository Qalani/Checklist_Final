import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
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
  return (
    <header className="sticky top-0 z-50 border-b border-zen-200/70 bg-surface/80 backdrop-blur-2xl shadow-soft">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 rounded-full border border-zen-200/80 bg-surface/80 px-3 py-2 text-sm font-medium text-zen-600 transition-colors hover:border-zen-400 hover:text-zen-700 shadow-soft"
                aria-label={`Back to ${backLabel}`}
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{backLabel}</span>
                <span className="sm:hidden">Back</span>
              </Link>
            ) : null}
            {Icon ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-zen-500 to-sage-500 shadow-medium">
                <Icon className="w-5 h-5 text-white" />
              </div>
            ) : null}
            <div>
              <h1 className="text-2xl font-semibold text-zen-900">{title}</h1>
              {subtitle ? <p className="text-sm text-zen-600">{subtitle}</p> : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3 justify-start lg:justify-end">{actions}</div> : null}
        {footer ? <div className="mt-3 lg:mt-4">{footer}</div> : null}
      </div>
    </header>
  );
}
