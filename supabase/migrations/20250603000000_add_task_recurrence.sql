-- Add task recurrence fields to tasks table.
-- task_recurrence controls whether completing a task auto-creates the next occurrence.
-- This is distinct from reminder_recurrence, which controls when notifications fire.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_recurrence text
    CHECK (task_recurrence IN ('daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS task_recurrence_interval integer NOT NULL DEFAULT 1
    CHECK (task_recurrence_interval >= 1);
