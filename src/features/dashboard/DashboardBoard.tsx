'use client';

import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  closestCorners,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DashboardLayout, DashboardSlot, DashboardWidgetConfig } from './types';
import { DASHBOARD_SLOTS, sortWidgetsBySlot } from './layout-metadata';
import { DASHBOARD_WIDGET_COMPONENTS } from './widgets';

interface DashboardBoardProps {
  userId: string | null;
  layout: DashboardLayout;
  moveWidget: (widgetId: string, slot: DashboardSlot, index: number) => Promise<void>;
  isEditable: boolean;
  isDemoMode: boolean;
}

type SortableWidgetData = {
  type: 'widget';
  slotId: DashboardSlot;
  widgetId: string;
};

type SlotDropData = {
  type: 'slot';
  slotId: DashboardSlot;
};

interface SortableWidgetProps {
  widget: DashboardWidgetConfig;
  children: ReactNode;
  isEditable: boolean;
}

function SortableWidget({ widget, children, isEditable }: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: widget.id,
    data: {
      type: 'widget',
      slotId: widget.slot,
      widgetId: widget.id,
    } satisfies SortableWidgetData,
    disabled: !isEditable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-widget-type={widget.type}
      {...attributes}
      {...listeners}
      className={isEditable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
    >
      {children}
    </div>
  );
}

function SlotColumn({
  slotId,
  widgets,
  children,
  isEditable,
}: {
  slotId: DashboardSlot;
  widgets: DashboardWidgetConfig[];
  children: ReactNode;
  isEditable: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${slotId}-dropzone`,
    data: { type: 'slot', slotId } satisfies SlotDropData,
  });

  return (
    <SortableContext id={slotId} items={widgets.map(widget => widget.id)} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={[
          'flex flex-col gap-4 rounded-3xl border border-transparent transition-colors',
          isEditable && isOver ? 'border-sage-300 dark:border-slate-600' : '',
          isEditable ? 'min-h-[120px] bg-sage-50/40 dark:bg-slate-900/40' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </SortableContext>
  );
}

export default function DashboardBoard({ userId, layout, moveWidget, isEditable, isDemoMode }: DashboardBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const slots = useMemo(() => sortWidgetsBySlot(layout), [layout]);

  const visibleWidgetsBySlot = useMemo(() => {
    return (['primary', 'secondary', 'tertiary'] as DashboardSlot[]).reduce(
      (acc, slotId) => {
        acc[slotId] = slots[slotId].filter(widget => widget.visible);
        return acc;
      },
      {
        primary: [] as DashboardWidgetConfig[],
        secondary: [] as DashboardWidgetConfig[],
        tertiary: [] as DashboardWidgetConfig[],
      },
    );
  }, [slots]);

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!isEditable || !over) return;

    const activeId = active.id as UniqueIdentifier;
    const overData = over.data.current as SortableWidgetData | SlotDropData | undefined;
    const activeData = active.data.current as SortableWidgetData | undefined;

    if (!overData || !activeData) {
      return;
    }

    const originSlot = activeData.slotId;
    const targetSlot = overData.slotId as DashboardSlot;

    const allWidgetsInTarget = slots[targetSlot];
    const visibleWidgetsInTarget = visibleWidgetsBySlot[targetSlot];

    const activeIndexAll = slots[originSlot].findIndex(widget => widget.id === activeData.widgetId);
    const activeVisibleIndex = visibleWidgetsBySlot[originSlot].findIndex(widget => widget.id === activeData.widgetId);

    let targetIndex: number;

    if (overData.type === 'slot') {
      // Insert at the end of the target slot.
      targetIndex = allWidgetsInTarget.length;
    } else {
      const overVisibleIndex = visibleWidgetsInTarget.findIndex(widget => widget.id === overData.widgetId);
      const afterVisibleWidget = visibleWidgetsInTarget[overVisibleIndex];
      if (!afterVisibleWidget) {
        targetIndex = allWidgetsInTarget.length;
      } else {
        targetIndex = allWidgetsInTarget.findIndex(widget => widget.id === afterVisibleWidget.id);
      }

      if (originSlot === targetSlot && activeIndexAll !== -1 && targetIndex !== -1) {
        if (targetIndex > activeIndexAll) {
          targetIndex -= 1;
        }
      }
    }

    if (targetIndex < 0) {
      return;
    }

    // When moving within the same slot we keep the relative position of hidden widgets by
    // looking at the neighbour that appears after the intended drop point.
    if (originSlot === targetSlot && activeVisibleIndex !== -1 && overData.type !== 'slot') {
      const targetVisibleIndex = visibleWidgetsInTarget.findIndex(widget => widget.id === overData.widgetId);
      if (targetVisibleIndex === activeVisibleIndex) {
        return;
      }
    }

    await moveWidget(String(activeId), targetSlot, targetIndex);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="grid gap-6 lg:grid-cols-4">
        {DASHBOARD_SLOTS.map(slot => {
          const widgets = visibleWidgetsBySlot[slot.id];
          return (
            <div key={slot.id} className={`space-y-4 ${slot.columns}`}>
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zen-500 dark:text-slate-300">{slot.title}</h2>
                <p className="text-sm text-zen-400 dark:text-slate-400">{slot.description}</p>
              </div>
              <SlotColumn slotId={slot.id} widgets={widgets} isEditable={isEditable}>
                {widgets.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-sage-200 bg-white/40 p-6 text-center text-sm text-zen-400 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-500">
                    {isEditable
                      ? 'Drag widgets here to populate this column.'
                      : 'Enter edit mode to move widgets into this column.'}
                  </div>
                ) : (
                  widgets.map(widget => {
                    const WidgetComponent = DASHBOARD_WIDGET_COMPONENTS[widget.type];
                    return (
                      <SortableWidget key={widget.id} widget={widget} isEditable={isEditable}>
                        <WidgetComponent userId={userId} isDemoMode={isDemoMode} />
                      </SortableWidget>
                    );
                  })
                )}
              </SlotColumn>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
