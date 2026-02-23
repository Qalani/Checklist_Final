-- Migration: Create zen_reminders table for standalone Zen Reminders feature
-- Provides personal reminders that can be scheduled and surfaced in the calendar experience.

create table if not exists public.zen_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  remind_at timestamptz not null,
  timezone text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists zen_reminders_user_id_remind_at_idx
  on public.zen_reminders (user_id, remind_at desc);

create or replace function public.set_zen_reminder_updated_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger trg_zen_reminders_updated_at
before update on public.zen_reminders
for each row execute function public.set_zen_reminder_updated_timestamp();

alter table public.zen_reminders enable row level security;

drop policy if exists "Zen reminders are viewable by owner" on public.zen_reminders;
drop policy if exists "Zen reminders are insertable by owner" on public.zen_reminders;
drop policy if exists "Zen reminders are updatable by owner" on public.zen_reminders;
drop policy if exists "Zen reminders are deletable by owner" on public.zen_reminders;

create policy "Zen reminders are viewable by owner"
  on public.zen_reminders
  for select
  using (auth.uid() = user_id);

create policy "Zen reminders are insertable by owner"
  on public.zen_reminders
  for insert
  with check (auth.uid() = user_id);

create policy "Zen reminders are updatable by owner"
  on public.zen_reminders
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Zen reminders are deletable by owner"
  on public.zen_reminders
  for delete
  using (auth.uid() = user_id);
