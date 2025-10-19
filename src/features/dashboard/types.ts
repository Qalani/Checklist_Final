export type DashboardSlot = 'primary' | 'secondary' | 'tertiary';

export type DashboardWidgetType =
  | 'productivity'
  | 'notes'
  | 'lists'
  | 'friends';

export interface DashboardWidgetConfig {
  id: string;
  type: DashboardWidgetType;
  slot: DashboardSlot;
  order: number;
  visible: boolean;
}

export interface DashboardLayout {
  widgets: DashboardWidgetConfig[];
}

export interface DashboardSlotMetadata {
  id: DashboardSlot;
  title: string;
  description: string;
  columns: string;
}

export interface DashboardWidgetDefinition {
  type: DashboardWidgetType;
  title: string;
  description: string;
  icon: string;
  defaultSlot: DashboardSlot;
}
