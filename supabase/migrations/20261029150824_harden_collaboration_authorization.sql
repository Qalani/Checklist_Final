-- Keep row identity and ownership stable across collaborative updates. RLS
-- evaluates each row version independently, so editor access alone does not
-- prevent changing user_id between the old and new versions.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.guard_collaboration_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'Row identity and ownership cannot be changed.' using errcode = '42501';
  end if;
  if tg_table_name = 'list_members' then
    if new.list_id is distinct from old.list_id then
      raise exception 'Memberships cannot be moved between lists.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'task_collaborators' then
    if new.task_id is distinct from old.task_id then
      raise exception 'Collaborators cannot be moved between tasks.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_collaboration_identity() from public, anon, authenticated;

drop trigger if exists guard_task_identity on public.tasks;
create trigger guard_task_identity before update on public.tasks
for each row execute function private.guard_collaboration_identity();
drop trigger if exists guard_list_identity on public.lists;
create trigger guard_list_identity before update on public.lists
for each row execute function private.guard_collaboration_identity();
drop trigger if exists guard_list_membership_identity on public.list_members;
create trigger guard_list_membership_identity before update on public.list_members
for each row execute function private.guard_collaboration_identity();
drop trigger if exists guard_task_collaborator_identity on public.task_collaborators;
create trigger guard_task_collaborator_identity before update on public.task_collaborators
for each row execute function private.guard_collaboration_identity();

-- The canonical list owner's membership must remain an owner. Other explicitly
-- invited co-owners retain their existing management rights.
create or replace function private.guard_canonical_list_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if tg_op = 'DELETE' then
    select l.user_id into owner_id from public.lists l where l.id = old.list_id;
    -- A cascading delete of the list itself must still remove its memberships.
    if found and old.user_id = owner_id then
      raise exception 'The list owner membership cannot be removed.' using errcode = '42501';
    end if;
    return old;
  end if;
  select l.user_id into owner_id from public.lists l where l.id = new.list_id;
  if new.user_id = owner_id and new.role is distinct from 'owner' then
    raise exception 'The list owner must retain the owner role.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_canonical_list_owner() from public, anon, authenticated;
drop trigger if exists guard_canonical_list_owner on public.list_members;
create trigger guard_canonical_list_owner before insert or update or delete on public.list_members
for each row execute function private.guard_canonical_list_owner();

-- Friendship state is created only by the existing request/response RPCs.
-- Direct inserts or participant updates could forge acceptance, replace the
-- request target, or inject identity metadata consumed by the acceptance RPC.
drop policy if exists "Users can add friendships" on public.friends;
drop policy if exists "Users can create friend requests" on public.friend_requests;
drop policy if exists "Participants can update friend requests" on public.friend_requests;
revoke insert, update on public.friends from public, anon, authenticated;
revoke insert, update on public.friend_requests from public, anon, authenticated;

-- Preserve direct owner-managed role updates, but apply the same friendship
-- requirement to direct task collaborator inserts as to the invitation RPC.
drop policy if exists "Owners manage collaborators" on public.task_collaborators;
create policy "Owners manage collaborators" on public.task_collaborators
for insert to authenticated
with check (
  public.is_task_owner(task_id)
  and exists (
    select 1 from public.friends f
    where f.user_id = (select auth.uid())
      and f.friend_id = task_collaborators.user_id
  )
);

-- Pin the pre-existing list-owner trigger's search path too.
alter function public.ensure_owner_membership() set search_path = '';
revoke all on function public.ensure_owner_membership() from public, anon, authenticated;


create or replace function private.add_friend_by_email(target_email text)
returns public.friend_requests
language plpgsql
security definer
set search_path = ''
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

create or replace function private.respond_to_friend_request(request_id uuid, action text)
returns public.friend_requests
language plpgsql
security definer
set search_path = ''
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
   where id = request_id
   for update;

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

CREATE OR REPLACE FUNCTION private.remove_friend(target_friend_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to manage friends.';
  END IF;

  IF target_friend_id IS NULL THEN
    RAISE EXCEPTION 'Provide the id of the friend you want to remove.';
  END IF;

  DELETE FROM public.friends
  WHERE user_id = caller_id
    AND friend_id = target_friend_id;

  DELETE FROM public.friends
  WHERE user_id = target_friend_id
    AND friend_id = caller_id;
END;
$$;


create or replace function private.invite_task_collaborator(
  task_uuid uuid, invitee_email text, desired_role text default 'viewer'
)
returns public.task_collaborators
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  owner_id uuid;
  target_user uuid;
  normalized_email text := lower(trim(invitee_email));
  result_row public.task_collaborators;
begin
  if caller_id is null then
    raise exception 'You must be signed in to invite collaborators.' using errcode = '42501';
  end if;
  if desired_role is null or desired_role not in ('editor', 'viewer') then
    raise exception 'Invalid role. Use editor or viewer.';
  end if;
  if normalized_email is null or normalized_email = '' then
    raise exception 'Provide an email address to invite a collaborator.';
  end if;
  select t.user_id into owner_id from public.tasks t where t.id = task_uuid;
  if owner_id is distinct from caller_id then
    raise exception 'Only owners can invite collaborators.' using errcode = '42501';
  end if;
  select u.id into target_user from auth.users u where lower(u.email) = normalized_email;
  if target_user is null then
    raise exception 'No user found with this email.';
  end if;
  if target_user = owner_id then
    raise exception 'You already own this task.';
  end if;
  if not exists (
    select 1 from public.friends f where f.user_id = caller_id and f.friend_id = target_user
  ) then
    raise exception 'You can only share tasks with friends.' using errcode = '42501';
  end if;
  insert into public.task_collaborators (task_id, user_id, user_email, role)
  values (task_uuid, target_user, normalized_email, desired_role)
  on conflict (task_id, user_id) do update
    set role = excluded.role, user_email = excluded.user_email
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function private.invite_list_member(
  list_uuid uuid, invitee_email text, desired_role text default 'viewer'
)
returns public.list_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_email text := lower(trim(invitee_email));
  target_user uuid;
  owner_id uuid;
  result_row public.list_members;
begin
  if caller_id is null then
    raise exception 'You must be signed in to invite collaborators.' using errcode = '42501';
  end if;
  if desired_role is null or desired_role not in ('owner', 'editor', 'viewer') then
    raise exception 'Invalid role. Use owner, editor, or viewer.';
  end if;
  if normalized_email is null or normalized_email = '' then
    raise exception 'Provide an email address to invite a collaborator.';
  end if;
  if not public.is_list_owner(list_uuid) then
    raise exception 'Only owners can invite collaborators.' using errcode = '42501';
  end if;
  select u.id into target_user from auth.users u where lower(u.email) = normalized_email;
  if target_user is null then
    raise exception 'No user found with this email.';
  end if;
  select l.user_id into owner_id from public.lists l where l.id = list_uuid;
  if target_user = owner_id then
    raise exception 'The list owner already has access.';
  end if;
  insert into public.list_members (list_id, user_id, user_email, role)
  values (list_uuid, target_user, normalized_email, desired_role)
  on conflict (list_id, user_id) do update
    set role = excluded.role, user_email = excluded.user_email
  returning * into result_row;
  return result_row;
end;
$$;


create or replace function public.add_friend_by_email(target_email text)
returns public.friend_requests
language sql
security invoker
set search_path = ''
as $$ select * from private.add_friend_by_email(target_email); $$;
revoke all on function public.add_friend_by_email(text) from public, anon;
grant execute on function public.add_friend_by_email(text) to authenticated, service_role;
revoke all on function private.add_friend_by_email(text) from public, anon;
grant execute on function private.add_friend_by_email(text) to authenticated, service_role;


create or replace function public.respond_to_friend_request(request_id uuid, action text)
returns public.friend_requests
language sql
security invoker
set search_path = ''
as $$ select * from private.respond_to_friend_request(request_id, action); $$;
revoke all on function public.respond_to_friend_request(uuid, text) from public, anon;
grant execute on function public.respond_to_friend_request(uuid, text) to authenticated, service_role;
revoke all on function private.respond_to_friend_request(uuid, text) from public, anon;
grant execute on function private.respond_to_friend_request(uuid, text) to authenticated, service_role;


create or replace function public.remove_friend(target_friend_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.remove_friend(target_friend_id); $$;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.remove_friend(uuid) to authenticated, service_role;
revoke all on function private.remove_friend(uuid) from public, anon;
grant execute on function private.remove_friend(uuid) to authenticated, service_role;


create or replace function public.invite_task_collaborator(task_uuid uuid, invitee_email text, desired_role text default 'viewer')
returns public.task_collaborators
language sql
security invoker
set search_path = ''
as $$ select * from private.invite_task_collaborator(task_uuid, invitee_email, desired_role); $$;
revoke all on function public.invite_task_collaborator(uuid, text, text) from public, anon;
grant execute on function public.invite_task_collaborator(uuid, text, text) to authenticated, service_role;
revoke all on function private.invite_task_collaborator(uuid, text, text) from public, anon;
grant execute on function private.invite_task_collaborator(uuid, text, text) to authenticated, service_role;


create or replace function public.invite_list_member(list_uuid uuid, invitee_email text, desired_role text default 'viewer')
returns public.list_members
language sql
security invoker
set search_path = ''
as $$ select * from private.invite_list_member(list_uuid, invitee_email, desired_role); $$;
revoke all on function public.invite_list_member(uuid, text, text) from public, anon;
grant execute on function public.invite_list_member(uuid, text, text) to authenticated, service_role;
revoke all on function private.invite_list_member(uuid, text, text) from public, anon;
grant execute on function private.invite_list_member(uuid, text, text) to authenticated, service_role;
