-- Migration: Add recurrence and scheduling metadata to task reminders
-- Run against your Supabase project's Postgres database.

alter table public.tasks
  add column if not exists reminder_recurrence jsonb,
  add column if not exists reminder_next_trigger_at timestamptz,
  add column if not exists reminder_last_trigger_at timestamptz,
  add column if not exists reminder_snoozed_until timestamptz,
  add column if not exists reminder_timezone text;

create index if not exists tasks_reminder_next_trigger_idx
  on public.tasks (reminder_next_trigger_at)
  where reminder_next_trigger_at is not null and completed = false;
