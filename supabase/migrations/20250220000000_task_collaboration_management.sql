-- Migration: Task collaboration helpers
-- Adds helper functions for inviting collaborators and listing collaborators for a task.

create or replace function public.invite_task_collaborator(
  task_uuid uuid,
  invitee_email text,
  desired_role text default 'viewer'
)
returns public.task_collaborators
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text;
  target_user uuid;
  owner_id uuid;
  result_row public.task_collaborators;
  is_friend boolean;
begin
  if desired_role not in ('editor', 'viewer') then
    raise exception 'Invalid role. Use editor or viewer.';
  end if;

  normalized_email := lower(trim(invitee_email));

  select user_id into owner_id
  from public.tasks
  where id = task_uuid;

  if owner_id is null then
    raise exception 'Task not found.';
  end if;

  if owner_id <> auth.uid() then
    raise exception 'Only owners can invite collaborators.';
  end if;

  select id into target_user
  from auth.users
  where lower(email) = normalized_email;

  if target_user is null then
    raise exception 'No user found with email %.', normalized_email;
  end if;

  if target_user = owner_id then
    raise exception 'You already own this task.';
  end if;

  select exists (
    select 1
    from public.friends f
    where f.user_id = owner_id
      and f.friend_id = target_user
  ) into is_friend;

  if not coalesce(is_friend, false) then
    raise exception 'You can only share tasks with friends.';
  end if;

  insert into public.task_collaborators (task_id, user_id, user_email, role)
  values (task_uuid, target_user, normalized_email, desired_role)
  on conflict (task_id, user_id)
  do update set role = excluded.role, user_email = excluded.user_email
  returning * into result_row;

  return result_row;
end;
$$;

grant execute on function public.invite_task_collaborator(uuid, text, text) to authenticated;

create or replace function public.get_task_collaborators(task_uuid uuid)
returns table (
  id uuid,
  task_id uuid,
  user_id uuid,
  user_email text,
  role text,
  is_owner boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  with access_check as (
    select
      t.id,
      t.user_id as owner_id,
      public.is_task_owner(task_uuid) as caller_is_owner,
      public.is_task_collaborator(task_uuid) as caller_is_collaborator
    from public.tasks t
    where t.id = task_uuid
  )
  select
    tc.id,
    tc.task_id,
    tc.user_id,
    tc.user_email,
    tc.role,
    false as is_owner,
    tc.created_at
  from public.task_collaborators tc
  join access_check ac on ac.id = tc.task_id
  where ac.caller_is_owner or tc.user_id = auth.uid()
  union all
  select
    coalesce(tc_owner.id, gen_random_uuid()) as id,
    ac.id as task_id,
    ac.owner_id as user_id,
    owner.email as user_email,
    'owner' as role,
    true as is_owner,
    coalesce(tc_owner.created_at, timezone('utc', now())) as created_at
  from access_check ac
  left join auth.users owner on owner.id = ac.owner_id
  left join public.task_collaborators tc_owner
    on tc_owner.task_id = ac.id
   and tc_owner.user_id = ac.owner_id
  where ac.caller_is_owner or ac.caller_is_collaborator;
$$;

grant execute on function public.get_task_collaborators(uuid) to authenticated;
