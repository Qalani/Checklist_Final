-- Migration: Create calendar_events table for user-scheduled events and imports
-- Provides personal calendar events with row level security and import metadata for .ics files.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  all_day boolean not null default false,
  import_source text,
  import_uid text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists calendar_events_user_start_idx
  on public.calendar_events (user_id, start_time);

create unique index if not exists calendar_events_import_unique_idx
  on public.calendar_events (user_id, import_source, import_uid)
  where import_source is not null and import_uid is not null;

create or replace function public.set_calendar_event_updated_timestamp()
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

create trigger trg_calendar_events_updated_at
before update on public.calendar_events
for each row execute function public.set_calendar_event_updated_timestamp();

alter table public.calendar_events enable row level security;

drop policy if exists "Calendar events are viewable by owner" on public.calendar_events;
drop policy if exists "Calendar events are insertable by owner" on public.calendar_events;
drop policy if exists "Calendar events are updatable by owner" on public.calendar_events;
drop policy if exists "Calendar events are deletable by owner" on public.calendar_events;

create policy "Calendar events are viewable by owner"
  on public.calendar_events
  for select
  using (auth.uid() = user_id);

create policy "Calendar events are insertable by owner"
  on public.calendar_events
  for insert
  with check (auth.uid() = user_id);

create policy "Calendar events are updatable by owner"
  on public.calendar_events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Calendar events are deletable by owner"
  on public.calendar_events
  for delete
  using (auth.uid() = user_id);
