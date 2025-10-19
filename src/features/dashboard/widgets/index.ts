import type { ComponentType } from 'react';
import type { DashboardWidgetType } from '../types';
import DashboardProductivityWidget from './DashboardProductivityWidget';
import DashboardNotesWidget from './DashboardNotesWidget';
import DashboardListsWidget from './DashboardListsWidget';
import DashboardFriendsWidget from './DashboardFriendsWidget';

export interface DashboardWidgetProps {
  userId: string | null;
}

export const DASHBOARD_WIDGET_COMPONENTS: Record<DashboardWidgetType, ComponentType<DashboardWidgetProps>> = {
  productivity: DashboardProductivityWidget,
  notes: DashboardNotesWidget,
  lists: DashboardListsWidget,
  friends: DashboardFriendsWidget,
};
