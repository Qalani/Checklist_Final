create table if not exists public.list_public_shares (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references auth.users(id),
  constraint list_public_shares_list_unique unique (list_id)
);

create index if not exists list_public_shares_list_idx on public.list_public_shares (list_id);
create index if not exists list_public_shares_token_idx on public.list_public_shares (token);

alter table public.list_public_shares enable row level security;

drop policy if exists "Owners can view share links" on public.list_public_shares;
drop policy if exists "Owners can manage share links" on public.list_public_shares;
drop policy if exists "Owners can delete share links" on public.list_public_shares;

drop policy if exists "Owners can update share links" on public.list_public_shares;

create policy "Owners can view share links"
  on public.list_public_shares
  for select
  using (
    public.is_list_owner(list_id)
  );

create policy "Owners can manage share links"
  on public.list_public_shares
  for insert
  with check (
    public.is_list_owner(list_id)
    and created_by = auth.uid()
  );

create policy "Owners can update share links"
  on public.list_public_shares
  for update
  using (public.is_list_owner(list_id))
  with check (public.is_list_owner(list_id));

create policy "Owners can delete share links"
  on public.list_public_shares
  for delete
  using (
    public.is_list_owner(list_id)
  );

drop function if exists public.enable_list_public_share(uuid);
drop function if exists public.rotate_list_public_share(uuid);
drop function if exists public.disable_list_public_share(uuid);
drop function if exists public.get_public_list(uuid);

create function public.enable_list_public_share(list_uuid uuid)
returns public.list_public_shares
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result_row public.list_public_shares;
begin
  if not public.is_list_owner(list_uuid) then
    raise exception 'Only owners can enable public sharing for this list.';
  end if;

  insert into public.list_public_shares (list_id, created_by)
  values (list_uuid, auth.uid())
  on conflict (list_id) do update
    set created_at = excluded.created_at,
        created_by = excluded.created_by
  returning * into result_row;

  return result_row;
end;
$$;

grant execute on function public.enable_list_public_share(uuid) to authenticated;

create function public.rotate_list_public_share(list_uuid uuid)
returns public.list_public_shares
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result_row public.list_public_shares;
begin
  if not public.is_list_owner(list_uuid) then
    raise exception 'Only owners can rotate public sharing for this list.';
  end if;

  update public.list_public_shares
  set token = gen_random_uuid(),
      created_at = timezone('utc', now()),
      created_by = auth.uid()
  where list_id = list_uuid
  returning * into result_row;

  if result_row.id is null then
    raise exception 'Public sharing is not enabled for this list.';
  end if;

  return result_row;
end;
$$;

grant execute on function public.rotate_list_public_share(uuid) to authenticated;

create function public.disable_list_public_share(list_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_list_owner(list_uuid) then
    raise exception 'Only owners can disable public sharing for this list.';
  end if;

  delete from public.list_public_shares
  where list_id = list_uuid;
end;
$$;

grant execute on function public.disable_list_public_share(uuid) to authenticated;

create function public.get_public_list(list_token uuid)
returns table (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  owner_email text,
  items jsonb
)
language sql
security definer
set search_path = public, auth
as $$
  select
    l.id,
    l.name,
    l.description,
    l.created_at,
    u.email as owner_email,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'content', i.content,
            'completed', i.completed,
            'position', i.position,
            'created_at', i.created_at,
            'updated_at', i.updated_at
          )
          order by i.position, i.created_at
        )
        from public.list_items i
        where i.list_id = l.id
      ),
      '[]'::jsonb
    ) as items
  from public.list_public_shares s
  join public.lists l on l.id = s.list_id
  left join auth.users u on u.id = l.user_id
  where s.token = list_token
  limit 1;
$$;

grant execute on function public.get_public_list(uuid) to anon, authenticated;
