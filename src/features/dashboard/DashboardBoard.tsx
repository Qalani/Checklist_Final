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
}

function SortableWidget({ widget, children }: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: widget.id,
    data: {
      type: 'widget',
      slotId: widget.slot,
      widgetId: widget.id,
    } satisfies SortableWidgetData,
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
      className="cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  );
}

function SlotColumn({
  slotId,
  widgets,
  children,
}: {
  slotId: DashboardSlot;
  widgets: DashboardWidgetConfig[];
  children: ReactNode;
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
          isOver ? 'border-sage-300 dark:border-slate-600' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </SortableContext>
  );
}

export default function DashboardBoard({ userId, layout, moveWidget }: DashboardBoardProps) {
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
    if (!over) return;

    const activeId = active.id as UniqueIdentifier;
    const overData = over.data.current as SortableWidgetData | SlotDropData | undefined;
    const activeData = active.data.current as SortableWidgetData | undefined;

    if (!overData || !activeData) {
      return;
    }

    const originSlot = activeData.slotId;
    const targetSlot = overData.slotId as DashboardSlot;
    const slotAllWidgets = slots[targetSlot];

    let targetIndex: number;

    if (overData.type === 'slot') {
      targetIndex = slotAllWidgets.length;
    } else {
      const overIndexAll = slotAllWidgets.findIndex(widget => widget.id === overData.widgetId);
      targetIndex = overIndexAll >= 0 ? overIndexAll : slotAllWidgets.length;

      if (originSlot === targetSlot) {
        const activeIndexAll = slotAllWidgets.findIndex(widget => widget.id === activeData.widgetId);
        if (activeIndexAll === targetIndex) {
          return;
        }
        if (targetIndex > activeIndexAll) {
          targetIndex -= 1;
        }
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
              <SlotColumn slotId={slot.id} widgets={widgets}>
                {widgets.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-sage-200 p-6 text-center text-sm text-zen-400 dark:border-slate-700 dark:text-slate-500">
                    Drag widgets here
                  </div>
                ) : (
                  widgets.map(widget => {
                    const WidgetComponent = DASHBOARD_WIDGET_COMPONENTS[widget.type];
                    return (
                      <SortableWidget key={widget.id} widget={widget}>
                        <WidgetComponent userId={userId} />
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
