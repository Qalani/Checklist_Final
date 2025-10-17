-- Migration: Add friends, friend requests, blocking, and task collaboration support
-- Creates tables and helper functions to enable social features and collaborative tasks.

-- Friend requests table
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  requested_id uuid not null references auth.users(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz
);

create index if not exists friend_requests_requested_idx on public.friend_requests (requested_id, status);
create index if not exists friend_requests_requester_idx on public.friend_requests (requester_id, status);
create unique index if not exists friend_requests_pending_unique
  on public.friend_requests (requester_id, requested_id)
  where status = 'pending';

-- Friend relationships table
create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint friends_unique_pair unique (user_id, friend_id)
);

create index if not exists friends_user_id_idx on public.friends (user_id);

-- User blocking table
create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_blocks_unique_pair unique (user_id, blocked_user_id)
);

create index if not exists user_blocks_user_idx on public.user_blocks (user_id);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_user_id);

-- Task collaborators for shared tasks
create table if not exists public.task_collaborators (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor','viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  constraint task_collaborators_unique unique (task_id, user_id)
);

create index if not exists task_collaborators_task_idx on public.task_collaborators (task_id);
create index if not exists task_collaborators_user_idx on public.task_collaborators (user_id);

-- Helper functions

-- Function: mark updated timestamp and accepted time
create or replace function public.update_friend_request_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := timezone('utc', now());

    if new.status = 'accepted' and old.status <> 'accepted' then
      new.responded_at := timezone('utc', now());
    elsif new.status in ('declined', 'cancelled') and old.status = 'pending' then
      new.responded_at := timezone('utc', now());
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_friend_requests_update
before update on public.friend_requests
for each row execute function public.update_friend_request_metadata();

-- Function: check if the current user owns a task
create or replace function public.is_task_owner(target_task_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = target_task_id
      and t.user_id = auth.uid()
  );
$$;

grant execute on function public.is_task_owner(uuid) to authenticated;

-- Function: check collaborator role for a task
create or replace function public.is_task_collaborator(target_task_id uuid, allowed_roles text[] default array['editor','viewer'])
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.task_collaborators tc
    where tc.task_id = target_task_id
      and tc.user_id = auth.uid()
      and tc.role = any(allowed_roles)
  );
$$;

grant execute on function public.is_task_collaborator(uuid, text[]) to authenticated;

-- Function: tasks accessible to the current user
create or replace function public.get_tasks_with_access()
returns table (
  id uuid,
  title text,
  description text,
  completed boolean,
  priority text,
  category text,
  category_color text,
  "order" integer,
  due_date timestamptz,
  reminder_minutes_before integer,
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  access_role text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    t.id,
    t.title,
    t.description,
    t.completed,
    t.priority,
    t.category,
    t.category_color,
    t."order",
    t.due_date,
    t.reminder_minutes_before,
    t.created_at,
    t.updated_at,
    t.user_id,
    case
      when t.user_id = auth.uid() then 'owner'
      else coalesce(tc.role, 'viewer')
    end as access_role
  from public.tasks t
  left join public.task_collaborators tc
    on tc.task_id = t.id
   and tc.user_id = auth.uid()
  where t.user_id = auth.uid()
     or tc.user_id is not null;
$$;

grant execute on function public.get_tasks_with_access() to authenticated;

-- Row Level Security policies
alter table public.friend_requests enable row level security;
alter table public.friends enable row level security;
alter table public.user_blocks enable row level security;
alter table public.task_collaborators enable row level security;

-- Friend request policies
drop policy if exists "Friend requests viewable by participants" on public.friend_requests;
drop policy if exists "Users can create friend requests" on public.friend_requests;
drop policy if exists "Participants can update friend requests" on public.friend_requests;
drop policy if exists "Requesters can delete friend requests" on public.friend_requests;

create policy "Friend requests viewable by participants"
  on public.friend_requests
  for select
  using (auth.uid() = requester_id or auth.uid() = requested_id);

create policy "Users can create friend requests"
  on public.friend_requests
  for insert
  with check (auth.uid() = requester_id);

create policy "Participants can update friend requests"
  on public.friend_requests
  for update
  using (auth.uid() = requester_id or auth.uid() = requested_id)
  with check (auth.uid() = requester_id or auth.uid() = requested_id);

create policy "Requesters can delete friend requests"
  on public.friend_requests
  for delete
  using (auth.uid() = requester_id);

-- Friends policies
drop policy if exists "Users can view their friends" on public.friends;
drop policy if exists "Users can add friendships" on public.friends;
drop policy if exists "Users can remove friendships" on public.friends;

create policy "Users can view their friends"
  on public.friends
  for select
  using (auth.uid() = user_id);

create policy "Users can add friendships"
  on public.friends
  for insert
  with check (auth.uid() = user_id);

create policy "Users can remove friendships"
  on public.friends
  for delete
  using (auth.uid() = user_id);

-- Blocking policies
drop policy if exists "Users view their own blocks" on public.user_blocks;
drop policy if exists "Users manage their blocks" on public.user_blocks;

create policy "Users view their own blocks"
  on public.user_blocks
  for select
  using (auth.uid() = user_id);

create policy "Users manage their blocks"
  on public.user_blocks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Task collaborator policies
drop policy if exists "Task collaborators view their rows" on public.task_collaborators;
drop policy if exists "Owners manage collaborators" on public.task_collaborators;
drop policy if exists "Owners update collaborators" on public.task_collaborators;
drop policy if exists "Owners or collaborators remove entries" on public.task_collaborators;

create policy "Task collaborators view their rows"
  on public.task_collaborators
  for select
  using (auth.uid() = user_id or public.is_task_owner(task_id));

create policy "Owners manage collaborators"
  on public.task_collaborators
  for insert
  with check (public.is_task_owner(task_id));

create policy "Owners update collaborators"
  on public.task_collaborators
  for update
  using (public.is_task_owner(task_id))
  with check (public.is_task_owner(task_id));

create policy "Owners or collaborators remove entries"
  on public.task_collaborators
  for delete
  using (public.is_task_owner(task_id) or auth.uid() = user_id);

-- Extend task RLS policies to allow collaborators
drop policy if exists "Tasks selectable by collaborators" on public.tasks;
drop policy if exists "Tasks updatable by owners or editors" on public.tasks;
drop policy if exists "Tasks deletable by owners" on public.tasks;

create policy "Tasks selectable by collaborators"
  on public.tasks
  for select
  using (
    user_id = auth.uid()
    or public.is_task_collaborator(tasks.id)
  );

create policy "Tasks updatable by owners or editors"
  on public.tasks
  for update
  using (
    user_id = auth.uid()
    or public.is_task_collaborator(tasks.id, array['editor'])
  )
  with check (
    user_id = auth.uid()
    or public.is_task_collaborator(tasks.id, array['editor'])
  );

create policy "Tasks deletable by owners"
  on public.tasks
  for delete
  using (user_id = auth.uid());
