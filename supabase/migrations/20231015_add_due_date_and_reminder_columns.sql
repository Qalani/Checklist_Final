-- Migration: Add due date and reminder fields to the tasks table
-- Run this against your Supabase project's Postgres database.

alter table public.tasks
  add column if not exists due_date timestamptz,
  add column if not exists reminder_minutes_before integer;

alter table public.tasks
  drop constraint if exists tasks_reminder_requires_due_date,
  add constraint tasks_reminder_requires_due_date
    check (
      reminder_minutes_before is null
      or due_date is not null
    );

alter table public.tasks
  drop constraint if exists tasks_reminder_minutes_non_negative,
  add constraint tasks_reminder_minutes_non_negative
    check (
      reminder_minutes_before is null
      or reminder_minutes_before >= 0
    );

create index if not exists tasks_due_date_idx
  on public.tasks (due_date)
  where completed = false and due_date is not null;
