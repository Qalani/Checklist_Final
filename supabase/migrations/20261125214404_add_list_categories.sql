-- Existing lists remain ungrouped until their owners choose a category mode.
alter table public.lists
  add column category_mode text not null default 'none'
  check (category_mode in ('none', 'manual', 'grocery'));

alter table public.list_items
  add column category text;

-- Retain the existing token-gated public share API, including category data.
-- The return type changes, so PostgreSQL requires dropping the old function.
drop function if exists public.get_public_list(uuid);
create function public.get_public_list(list_token uuid)
returns table (
  id uuid,
  name text,
  description text,
  created_at timestamptz,
  owner_email text,
  category_mode text,
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
    l.category_mode,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'content', i.content,
            'completed', i.completed,
            'position', i.position,
            'category', i.category,
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
revoke all on function public.get_public_list(uuid) from public;
grant execute on function public.get_public_list(uuid) to anon, authenticated;
