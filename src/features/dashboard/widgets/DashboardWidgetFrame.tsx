'use client';

import type { ReactNode } from 'react';
interface DashboardWidgetFrameProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  isLoading?: boolean;
  footer?: ReactNode;
  className?: string;
}

export default function DashboardWidgetFrame({
  title,
  description,
  icon,
  children,
  isLoading,
  footer,
  className,
}: DashboardWidgetFrameProps) {
  return (
    <div
      className={[
        'rounded-3xl border border-sage-100 bg-white/80 p-5 shadow-small backdrop-blur-sm transition-shadow hover:shadow-medium dark:border-slate-800 dark:bg-slate-900/70',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="mb-4 flex items-center gap-3">
        {icon && <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sage-100 text-sage-700 dark:bg-slate-800 dark:text-slate-100">{icon}</span>}
        <div>
          <h3 className="text-lg font-semibold text-zen-900 dark:text-white">{title}</h3>
          {description ? <p className="text-sm text-zen-500 dark:text-slate-300">{description}</p> : null}
        </div>
      </header>
      <div className="min-h-[120px] text-zen-700 dark:text-slate-200">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-sage-200 border-t-sage-500 dark:border-slate-700 dark:border-t-slate-200" />
          </div>
        ) : (
          children
        )}
      </div>
      {footer ? <footer className="mt-4 text-sm text-zen-500 dark:text-slate-300">{footer}</footer> : null}
    </div>
  );
}
