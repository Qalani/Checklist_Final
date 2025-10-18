-- Migration: Add notes table for Zen Notes word processing feature
-- Creates a collaborative-safe notes table with row level security and automatic timestamp updates.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled document',
  content text not null default '',
  summary text,
  word_count integer default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists notes_user_id_updated_idx on public.notes (user_id, updated_at desc);

create or replace function public.set_note_updated_timestamp()
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

create trigger trg_notes_updated_at
before update on public.notes
for each row execute function public.set_note_updated_timestamp();

alter table public.notes enable row level security;

drop policy if exists "Notes are viewable by owner" on public.notes;
drop policy if exists "Notes are insertable by owner" on public.notes;
drop policy if exists "Notes are updatable by owner" on public.notes;
drop policy if exists "Notes are deletable by owner" on public.notes;

create policy "Notes are viewable by owner"
  on public.notes
  for select
  using (auth.uid() = user_id);

create policy "Notes are insertable by owner"
  on public.notes
  for insert
  with check (auth.uid() = user_id);

create policy "Notes are updatable by owner"
  on public.notes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Notes are deletable by owner"
  on public.notes
  for delete
  using (auth.uid() = user_id);
