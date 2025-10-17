create table public.list_members (
  id uuid not null default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  role text not null check (role in ('owner', 'editor', 'viewer')) default 'viewer',
  created_at timestamptz not null default timezone('utc', now()),
  constraint list_members_pkey primary key (id),
  constraint list_members_unique_user unique (list_id, user_id)
);

create index if not exists list_members_list_id_idx on public.list_members (list_id);
create index if not exists list_members_user_id_idx on public.list_members (user_id);

alter table public.list_members enable row level security;

drop trigger if exists ensure_owner_membership_trigger on public.lists;
drop function if exists public.ensure_owner_membership();

create function public.ensure_owner_membership()
returns trigger
language plpgsql
security definer
as $$
declare
  owner_email text;
begin
  select email into owner_email from auth.users where id = new.user_id;

  insert into public.list_members (list_id, user_id, user_email, role)
  values (new.id, new.user_id, owner_email, 'owner')
  on conflict (list_id, user_id) do update set role = excluded.role, user_email = excluded.user_email;

  return new;
end;
$$;

create trigger ensure_owner_membership_trigger
after insert on public.lists
for each row execute function public.ensure_owner_membership();

insert into public.list_members (list_id, user_id, user_email, role)
select l.id, l.user_id, u.email, 'owner'
from public.lists l
left join auth.users u on u.id = l.user_id
on conflict (list_id, user_id) do update set role = excluded.role, user_email = coalesce(list_members.user_email, excluded.user_email);

drop policy if exists "List members can view their membership" on public.list_members;
drop policy if exists "Owners can manage memberships" on public.list_members;
drop policy if exists "Members can update their own role to viewer" on public.list_members;
drop policy if exists "Members can remove themselves" on public.list_members;

drop function if exists public.is_list_owner(uuid);
drop function if exists public.is_list_member(uuid, text[]);

create function public.is_list_member(target_list_id uuid, allowed_roles text[] default array['owner','editor','viewer'])
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.list_members
    where list_id = target_list_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

grant execute on function public.is_list_member(uuid, text[]) to authenticated;

create function public.is_list_owner(target_list_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select public.is_list_member(target_list_id, array['owner']);
$$;

grant execute on function public.is_list_owner(uuid) to authenticated;

create policy "List members can view their membership"
  on public.list_members
  for select
  using (
    auth.uid() = user_id
    or public.is_list_owner(list_members.list_id)
  );

create policy "Owners can manage memberships"
  on public.list_members
  for insert
  with check (
    public.is_list_owner(list_members.list_id)
  );

create policy "Owners can update memberships"
  on public.list_members
  for update
  using (public.is_list_owner(list_members.list_id))
  with check (public.is_list_owner(list_members.list_id));

create policy "Owners or members can remove themselves"
  on public.list_members
  for delete
  using (
    auth.uid() = user_id
    or public.is_list_owner(list_members.list_id)
  );

drop policy if exists "Lists are viewable by owner" on public.lists;
drop policy if exists "Lists are insertable by owner" on public.lists;
drop policy if exists "Lists are updatable by owner" on public.lists;
drop policy if exists "Lists are deletable by owner" on public.lists;

drop policy if exists "Lists viewable by members" on public.lists;
drop policy if exists "Lists insertable by owner" on public.lists;
drop policy if exists "Lists updatable by editors" on public.lists;
drop policy if exists "Lists deletable by owners" on public.lists;

create policy "Lists viewable by members"
  on public.lists
  for select
  using (
    auth.uid() = user_id
    or public.is_list_member(lists.id)
  );

create policy "Lists insertable by owner"
  on public.lists
  for insert
  with check (auth.uid() = user_id);

create policy "Lists updatable by editors"
  on public.lists
  for update
  using (
    auth.uid() = user_id
    or public.is_list_member(lists.id, array['owner','editor'])
  )
  with check (
    auth.uid() = user_id
    or public.is_list_member(lists.id, array['owner','editor'])
  );

create policy "Lists deletable by owners"
  on public.lists
  for delete
  using (
    auth.uid() = user_id
    or public.is_list_owner(lists.id)
  );

drop function if exists public.invite_list_member(uuid, text, text);

create function public.invite_list_member(list_uuid uuid, invitee_email text, desired_role text default 'viewer')
returns public.list_members
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text;
  target_user uuid;
  result_row public.list_members;
  caller_role text;
begin
  if desired_role not in ('owner', 'editor', 'viewer') then
    raise exception 'Invalid role. Use owner, editor, or viewer.';
  end if;

  normalized_email := lower(trim(invitee_email));

  select lm.role into caller_role
  from public.list_members lm
  where lm.list_id = list_uuid
    and lm.user_id = auth.uid();

  if caller_role is null or caller_role <> 'owner' then
    raise exception 'Only owners can invite collaborators.';
  end if;

  select id into target_user from auth.users where lower(email) = normalized_email;

  if target_user is null then
    raise exception 'No user found with email %.', normalized_email;
  end if;

  insert into public.list_members (list_id, user_id, user_email, role)
  values (list_uuid, target_user, normalized_email, desired_role)
  on conflict (list_id, user_id) do update set role = excluded.role, user_email = excluded.user_email
  returning * into result_row;

  return result_row;
end;
$$;

grant execute on function public.invite_list_member(uuid, text, text) to authenticated;
