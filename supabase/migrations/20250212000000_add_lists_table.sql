create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists lists_user_id_idx on public.lists (user_id, created_at desc);

alter table public.lists enable row level security;

drop policy if exists "Lists are viewable by owner" on public.lists;
drop policy if exists "Lists are insertable by owner" on public.lists;
drop policy if exists "Lists are updatable by owner" on public.lists;
drop policy if exists "Lists are deletable by owner" on public.lists;

create policy "Lists are viewable by owner"
  on public.lists
  for select
  using (auth.uid() = user_id);

create policy "Lists are insertable by owner"
  on public.lists
  for insert
  with check (auth.uid() = user_id);

create policy "Lists are updatable by owner"
  on public.lists
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Lists are deletable by owner"
  on public.lists
  for delete
  using (auth.uid() = user_id);
