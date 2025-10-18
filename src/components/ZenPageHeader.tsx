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
  backLabel = 'Dashboard',
  actions,
  footer,
}: ZenPageHeaderProps) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-surface/70 border-b border-zen-200 shadow-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface/80 border border-zen-200 text-sm font-medium text-zen-600 hover:text-zen-800 hover:border-sage-200 transition-colors shadow-soft"
                aria-label={`Back to ${backLabel}`}
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{backLabel}</span>
                <span className="sm:hidden">Back</span>
              </Link>
            ) : null}
            {Icon ? (
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 flex items-center justify-center shadow-medium">
                <Icon className="w-5 h-5 text-white" />
              </div>
            ) : null}
            <div>
              <h1 className="text-2xl font-semibold text-zen-900">{title}</h1>
              {subtitle ? <p className="text-sm text-zen-600">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-3 justify-start lg:justify-end">{actions}</div>
          ) : null}
        </div>
        {footer ? <div className="mt-3 lg:mt-4">{footer}</div> : null}
      </div>
    </header>
  );
}
