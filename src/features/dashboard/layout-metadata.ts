import type {
  DashboardLayout,
  DashboardSlot,
  DashboardSlotMetadata,
  DashboardWidgetConfig,
  DashboardWidgetDefinition,
  DashboardWidgetType,
} from './types';

export const DASHBOARD_SLOTS: DashboardSlotMetadata[] = [
  {
    id: 'primary',
    title: 'Priorities',
    description: 'At-a-glance information that anchors the day.',
    columns: 'lg:col-span-2',
  },
  {
    id: 'secondary',
    title: 'Workspace',
    description: 'Helpful references and ongoing documents.',
    columns: 'lg:col-span-1',
  },
  {
    id: 'tertiary',
    title: 'Connection',
    description: 'Stay in sync with collaborators and friends.',
    columns: 'lg:col-span-1',
  },
];

function createWidgetId(type: DashboardWidgetType): string {
  return `${type}-${Math.random().toString(36).slice(2, 8)}`;
}

export const DASHBOARD_WIDGET_LIBRARY: DashboardWidgetDefinition[] = [
  {
    type: 'productivity',
    title: 'Productivity Pulse',
    description: 'Track active tasks, completions, and upcoming deadlines.',
    icon: 'LayoutGrid',
    defaultSlot: 'primary',
  },
  {
    type: 'notes',
    title: 'Recent Notes',
    description: 'Jump back into your latest writing and summaries.',
    icon: 'FileText',
    defaultSlot: 'secondary',
  },
  {
    type: 'lists',
    title: 'Shared Lists',
    description: 'Review collaborative lists and membership activity.',
    icon: 'ListTodo',
    defaultSlot: 'secondary',
  },
  {
    type: 'friends',
    title: 'Friend Activity',
    description: 'See requests, connections, and collaboration invites.',
    icon: 'Users',
    defaultSlot: 'tertiary',
  },
];

function buildDefaultWidgets(): DashboardWidgetConfig[] {
  return DASHBOARD_WIDGET_LIBRARY.map((definition, index) => ({
    id: createWidgetId(definition.type),
    type: definition.type,
    slot: definition.defaultSlot,
    order: index,
    visible: true,
  }));
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  widgets: buildDefaultWidgets(),
};

export function getWidgetDefinition(type: DashboardWidgetType): DashboardWidgetDefinition | undefined {
  return DASHBOARD_WIDGET_LIBRARY.find(widget => widget.type === type);
}

export function normalizeLayout(layout: DashboardLayout | null | undefined): DashboardLayout {
  const defaults = DEFAULT_DASHBOARD_LAYOUT.widgets;
  const provided = layout?.widgets ?? [];

  const merged: DashboardWidgetConfig[] = [];

  defaults.forEach(defaultWidget => {
    const existing = provided.find(widget => widget.type === defaultWidget.type);
    if (existing) {
      merged.push({
        ...existing,
        id: existing.id || defaultWidget.id,
        slot: (['primary', 'secondary', 'tertiary'] as DashboardSlot[]).includes(existing.slot)
          ? existing.slot
          : defaultWidget.slot,
        order: typeof existing.order === 'number' ? existing.order : defaultWidget.order,
        visible: typeof existing.visible === 'boolean' ? existing.visible : defaultWidget.visible,
      });
    } else {
      merged.push({ ...defaultWidget, id: createWidgetId(defaultWidget.type) });
    }
  });

  return {
    widgets: merged.sort((a, b) => a.order - b.order),
  };
}

export function sortWidgetsBySlot(layout: DashboardLayout): Record<DashboardSlot, DashboardWidgetConfig[]> {
  return layout.widgets.reduce(
    (acc, widget) => {
      acc[widget.slot] = [...acc[widget.slot], widget].sort((a, b) => a.order - b.order);
      return acc;
    },
    {
      primary: [] as DashboardWidgetConfig[],
      secondary: [] as DashboardWidgetConfig[],
      tertiary: [] as DashboardWidgetConfig[],
    },
  );
}

export function reorderWidgets(
  layout: DashboardLayout,
  widgetId: string,
  targetSlot: DashboardSlot,
  targetIndex: number,
): DashboardLayout {
  const slots = sortWidgetsBySlot(layout);
  const movingWidget = layout.widgets.find(widget => widget.id === widgetId);
  if (!movingWidget) {
    return layout;
  }

  const originSlot = movingWidget.slot;
  slots[originSlot] = slots[originSlot].filter(widget => widget.id !== widgetId);

  const destination = [...slots[targetSlot]];
  const clampedIndex = Math.max(0, Math.min(targetIndex, destination.length));
  destination.splice(clampedIndex, 0, { ...movingWidget, slot: targetSlot });
  slots[targetSlot] = destination;

  const flattened: DashboardWidgetConfig[] = [];
  (['primary', 'secondary', 'tertiary'] as DashboardSlot[]).forEach(slot => {
    slots[slot] = slots[slot].map((widget, index) => ({ ...widget, slot, order: index }));
    flattened.push(...slots[slot]);
  });

  return { widgets: flattened };
}

