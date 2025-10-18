-- Reinstate friend requests with manual acceptance flow

-- Create the friend_requests table if it no longer exists
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  requester_email text not null default '',
  requester_name text,
  target_email text not null default '',
  target_name text,
  created_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz
);

create index if not exists friend_requests_target_idx on public.friend_requests (target_id);
create index if not exists friend_requests_requester_idx on public.friend_requests (requester_id);
create unique index if not exists friend_requests_pending_unique
  on public.friend_requests (requester_id, target_id)
  where status = 'pending';

alter table public.friend_requests enable row level security;

-- Policies to align with tasks/lists style access control
drop policy if exists "Friend requests viewable by participants" on public.friend_requests;
drop policy if exists "Users can create friend requests" on public.friend_requests;
drop policy if exists "Participants can update friend requests" on public.friend_requests;
drop policy if exists "Requesters can delete friend requests" on public.friend_requests;

create policy "Friend requests viewable by participants"
  on public.friend_requests
  for select
  using (auth.uid() = requester_id or auth.uid() = target_id);

create policy "Users can create friend requests"
  on public.friend_requests
  for insert
  with check (auth.uid() = requester_id);

create policy "Participants can update friend requests"
  on public.friend_requests
  for update
  using (auth.uid() = requester_id or auth.uid() = target_id)
  with check (auth.uid() = requester_id or auth.uid() = target_id);

create policy "Requesters can delete friend requests"
  on public.friend_requests
  for delete
  using (auth.uid() = requester_id);

-- Recreate helper functions with manual acceptance
DROP FUNCTION IF EXISTS public.add_friend_by_email(text);

create or replace function public.add_friend_by_email(target_email text)
returns public.friend_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text;
  caller_record auth.users%rowtype;
  target_record auth.users%rowtype;
  existing_request public.friend_requests;
  target_display text;
  caller_display text;
begin
  if target_email is null then
    raise exception 'Provide an email address to add a friend.';
  end if;

  normalized_email := lower(trim(target_email));

  if normalized_email = '' then
    raise exception 'Provide an email address to add a friend.';
  end if;

  select * into caller_record
  from auth.users
  where id = auth.uid();

  if caller_record.id is null then
    raise exception 'You must be signed in to add friends.';
  end if;

  select * into target_record
  from auth.users
  where lower(email) = normalized_email;

  if target_record.id is null then
    raise exception 'No user found with email %.', normalized_email;
  end if;

  if target_record.id = caller_record.id then
    raise exception 'You cannot add yourself as a friend.';
  end if;

  if exists (
    select 1
    from public.friends
    where user_id = caller_record.id
      and friend_id = target_record.id
  ) then
    raise exception 'You are already friends with %.', normalized_email;
  end if;

  select *
    into existing_request
    from public.friend_requests
   where requester_id = caller_record.id
     and target_id = target_record.id
     and status = 'pending'
   limit 1;

  if existing_request.id is not null then
    return existing_request;
  end if;

  select *
    into existing_request
    from public.friend_requests
   where requester_id = target_record.id
     and target_id = caller_record.id
     and status = 'pending'
   limit 1;

  if existing_request.id is not null then
    raise exception 'You already have a pending request from this user. Check your incoming requests to respond.';
  end if;

  target_display := coalesce(
    nullif(target_record.raw_user_meta_data->>'full_name', ''),
    nullif(target_record.raw_user_meta_data->>'name', '')
  );

  caller_display := coalesce(
    nullif(caller_record.raw_user_meta_data->>'full_name', ''),
    nullif(caller_record.raw_user_meta_data->>'name', '')
  );

  insert into public.friend_requests (
    requester_id,
    target_id,
    requester_email,
    requester_name,
    target_email,
    target_name
  )
  values (
    caller_record.id,
    target_record.id,
    caller_record.email,
    caller_display,
    target_record.email,
    target_display
  )
  returning * into existing_request;

  return existing_request;
end;
$$;

grant execute on function public.add_friend_by_email(text) to authenticated;

DROP FUNCTION IF EXISTS public.respond_to_friend_request(uuid, text);

create or replace function public.respond_to_friend_request(request_id uuid, action text)
returns public.friend_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  request_row public.friend_requests;
  updated_row public.friend_requests;
  normalized_action text;
begin
  if caller_id is null then
    raise exception 'You must be signed in to manage friend requests.';
  end if;

  select *
    into request_row
    from public.friend_requests
   where id = request_id;

  if request_row.id is null then
    raise exception 'Friend request not found.';
  end if;

  if request_row.target_id <> caller_id then
    raise exception 'You can only respond to requests sent to you.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'This friend request has already been processed.';
  end if;

  normalized_action := lower(trim(action));

  if normalized_action = 'accept' then
    update public.friend_requests
       set status = 'accepted',
           responded_at = timezone('utc', now())
     where id = request_id
     returning * into updated_row;

    insert into public.friends (user_id, friend_id, friend_email, friend_name)
    values (updated_row.target_id, updated_row.requester_id, coalesce(updated_row.requester_email, ''), updated_row.requester_name)
    on conflict (user_id, friend_id) do update
      set friend_email = excluded.friend_email,
          friend_name = excluded.friend_name;

    insert into public.friends (user_id, friend_id, friend_email, friend_name)
    values (updated_row.requester_id, updated_row.target_id, coalesce(updated_row.target_email, ''), updated_row.target_name)
    on conflict (user_id, friend_id) do update
      set friend_email = excluded.friend_email,
          friend_name = excluded.friend_name;

    return updated_row;
  elsif normalized_action in ('decline', 'deny', 'reject') then
    update public.friend_requests
       set status = 'declined',
           responded_at = timezone('utc', now())
     where id = request_id
     returning * into updated_row;

    return updated_row;
  else
    raise exception 'Unknown action %. Use accept or decline.', action;
  end if;
end;
$$;

grant execute on function public.respond_to_friend_request(uuid, text) to authenticated;
