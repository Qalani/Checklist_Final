'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';

import { DEFAULT_DASHBOARD_LAYOUT, normalizeLayout, reorderWidgets } from '../layout-metadata';
import { fetchDashboardLayout, persistDashboardLayout } from '../persistence';
import type { DashboardLayout, DashboardSlot } from '../types';

export interface UseDashboardLayoutResult {
  layout: DashboardLayout;
  isLoading: boolean;
  isSaving: boolean;
  error: Error | null;
  moveWidget: (widgetId: string, slot: DashboardSlot, index: number) => Promise<void>;
  toggleWidget: (widgetId: string) => Promise<void>;
  resetLayout: () => Promise<void>;
  setLayout: (updater: (current: DashboardLayout) => DashboardLayout) => Promise<void>;
}

const EMPTY_ERROR: Error | null = null;

export function useDashboardLayout(userId: string | null): UseDashboardLayoutResult {
  const [isSaving, setIsSaving] = useState(false);
  const [localLayout, setLocalLayout] = useState(() => normalizeLayout(DEFAULT_DASHBOARD_LAYOUT));

  useEffect(() => {
    if (!userId && typeof window !== 'undefined') {
      const raw = window.localStorage.getItem('zen-dashboard-layout');
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as DashboardLayout;
          setLocalLayout(normalizeLayout(parsed));
        } catch (error) {
          console.warn('Failed to parse dashboard layout from storage', error);
        }
      }
    }
  }, [userId]);

  const shouldFetch = Boolean(userId);

  const { data, error, isLoading, mutate } = useSWR<DashboardLayout>(
    shouldFetch ? ['dashboard-layout', userId] : null,
    async () => {
      if (!userId) {
        return normalizeLayout(DEFAULT_DASHBOARD_LAYOUT);
      }
      return fetchDashboardLayout(userId);
    },
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const layout = useMemo(() => {
    if (userId) {
      if (data) {
        return normalizeLayout(data);
      }
      return normalizeLayout(DEFAULT_DASHBOARD_LAYOUT);
    }
    return localLayout;
  }, [data, localLayout, userId]);

  const commitLayout = useCallback(
    async (updater: (current: DashboardLayout) => DashboardLayout) => {
      if (!userId) {
        setLocalLayout(prev => {
          const nextLocal = normalizeLayout(updater(prev));
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('zen-dashboard-layout', JSON.stringify(nextLocal));
          }
          return nextLocal;
        });
        return;
      }

      const nextLayout = normalizeLayout(updater(layout));
      setIsSaving(true);

      try {
        await persistDashboardLayout(userId, nextLayout);
        await mutate(nextLayout, { revalidate: true });
      } finally {
        setIsSaving(false);
      }
    },
    [layout, mutate, userId],
  );

  const moveWidget = useCallback(
    async (widgetId: string, slot: DashboardSlot, index: number) => {
      await commitLayout(current => reorderWidgets(current, widgetId, slot, index));
    },
    [commitLayout],
  );

  const toggleWidget = useCallback(
    async (widgetId: string) => {
      await commitLayout(current => ({
        widgets: current.widgets.map(widget =>
          widget.id === widgetId ? { ...widget, visible: !widget.visible } : widget,
        ),
      }));
    },
    [commitLayout],
  );

  const resetLayout = useCallback(async () => {
    await commitLayout(() => normalizeLayout(DEFAULT_DASHBOARD_LAYOUT));
  }, [commitLayout]);

  const setLayout = useCallback(
    async (updater: (current: DashboardLayout) => DashboardLayout) => {
      await commitLayout(updater);
    },
    [commitLayout],
  );

  return {
    layout,
    isLoading: isLoading && !data,
    isSaving,
    error: (error as Error) ?? EMPTY_ERROR,
    moveWidget,
    toggleWidget,
    resetLayout,
    setLayout,
  };
}
