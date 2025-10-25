import type { ReminderRecurrence } from '@/types';

export type CalendarScope = 'all' | 'personal' | 'shared';

export type CalendarEventType = 'task_due' | 'task_reminder' | 'note' | 'zen_reminder';

export interface CalendarReminderMetadata {
  minutesBefore: number | null;
  recurrence: ReminderRecurrence | null;
  nextTriggerAt: string | null;
  snoozedUntil: string | null;
  timezone: string | null;
}

export interface CalendarTaskMetadata {
  taskId: string;
  accessRole: 'owner' | 'editor' | 'viewer';
  canEdit: boolean;
  category?: string;
  categoryColor?: string;
  dueDate: string | null;
  reminder?: CalendarReminderMetadata;
}

export interface CalendarNoteMetadata {
  noteId: string;
  updatedAt: string | null;
  createdAt: string | null;
}

export interface CalendarZenReminderMetadata {
  reminderId: string;
  timezone: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type CalendarEventMetadata =
  | CalendarTaskMetadata
  | CalendarNoteMetadata
  | CalendarZenReminderMetadata
  | Record<string, unknown>;

export interface CalendarEventRecord {
  id: string;
  entityId: string;
  type: CalendarEventType;
  title: string;
  description?: string | null;
  start: string;
  end: string;
  allDay: boolean;
  scope: 'personal' | 'shared';
  metadata?: CalendarEventMetadata;
}

export interface CalendarResponsePayload {
  range: { start: string; end: string };
  events: CalendarEventRecord[];
  generatedAt: string;
}
