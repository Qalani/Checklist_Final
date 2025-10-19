'use client';

import type { DashboardLayout } from './types';
import { DASHBOARD_WIDGET_LIBRARY, getWidgetDefinition } from './layout-metadata';

export interface WidgetVisibilityMenuProps {
  layout: DashboardLayout;
  onToggle: (widgetId: string) => void;
  onReset: () => void;
  isSaving: boolean;
  isEditable: boolean;
  onRequestEditMode?: () => void;
}

export default function WidgetVisibilityMenu({
  layout,
  onToggle,
  onReset,
  isSaving,
  isEditable,
  onRequestEditMode,
}: WidgetVisibilityMenuProps) {
  const widgets = layout.widgets.map(widget => ({
    widget,
    definition: getWidgetDefinition(widget.type) ?? DASHBOARD_WIDGET_LIBRARY.find(def => def.type === widget.type),
  }));

  return (
    <aside className="rounded-3xl border border-zen-200/60 bg-surface/80 p-4 shadow-small backdrop-blur-sm dark:border-zen-700/40">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zen-500 dark:text-zen-200">Widgets</h2>
        <button
          type="button"
          onClick={onReset}
          disabled={isSaving || !isEditable}
          className="text-xs font-medium text-sage-600 transition hover:text-sage-700 disabled:opacity-50 dark:text-zen-200"
        >
          Reset
        </button>
      </div>
      {!isEditable ? (
        <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-sage-100/70 bg-sage-50/70 p-3 text-xs text-zen-500 dark:border-zen-700/40 dark:bg-zen-800/20 dark:text-zen-200">
          <p>Enable edit mode to toggle visibility for individual widgets.</p>
          {onRequestEditMode ? (
            <button
              type="button"
              onClick={onRequestEditMode}
              className="inline-flex items-center justify-center rounded-full border border-sage-500 bg-sage-500 px-3 py-1.5 font-semibold text-white transition hover:bg-sage-600 focus:outline-none focus:ring-2 focus:ring-sage-500 focus:ring-offset-2 focus:ring-offset-[rgb(var(--color-surface))] dark:border-zen-600 dark:bg-zen-700 dark:hover:bg-zen-600 dark:focus:ring-zen-500"
            >
              Enter edit mode
            </button>
          ) : null}
        </div>
      ) : null}
      <ul className="mt-4 space-y-3">
        {widgets.map(({ widget, definition }) => (
          <li key={widget.id} className="flex items-start justify-between gap-4 rounded-2xl border border-sage-100/70 p-3 dark:border-zen-700/40">
            <div>
              <p className="text-sm font-medium text-zen-700 dark:text-zen-900">{definition?.title ?? widget.type}</p>
              <p className="text-xs text-zen-400 dark:text-zen-300">{definition?.description}</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-zen-500 dark:text-zen-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-sage-300 text-sage-600 focus:ring-sage-500 dark:border-zen-600"
                checked={widget.visible}
                onChange={() => onToggle(widget.id)}
                disabled={isSaving || !isEditable}
              />
              Visible
            </label>
          </li>
        ))}
      </ul>
    </aside>
  );
}
