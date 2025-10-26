create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  content text not null default '',
  completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists list_items_list_id_position_idx on public.list_items (list_id, position);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger set_list_items_updated_at
  before update on public.list_items
  for each row
  execute function public.set_current_timestamp_updated_at();

alter table public.list_items enable row level security;

drop policy if exists "List members can view items" on public.list_items;
drop policy if exists "List editors can manage items" on public.list_items;
drop policy if exists "List editors can insert items" on public.list_items;
drop policy if exists "List editors can update items" on public.list_items;
drop policy if exists "List editors can delete items" on public.list_items;

create policy "List members can view items"
  on public.list_items
  for select
  using (public.is_list_member(list_id));

create policy "List editors can insert items"
  on public.list_items
  for insert
  with check (public.is_list_member(list_id, array['owner','editor']));

create policy "List editors can update items"
  on public.list_items
  for update
  using (public.is_list_member(list_id, array['owner','editor']))
  with check (public.is_list_member(list_id, array['owner','editor']));

create policy "List editors can delete items"
  on public.list_items
  for delete
  using (public.is_list_member(list_id, array['owner','editor']));

-- Function to reorder list items in a single statement

drop function if exists public.reorder_list_items(uuid, uuid[]);

create function public.reorder_list_items(target_list_id uuid, ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
begin
  if not public.is_list_member(target_list_id, array['owner','editor']) then
    raise exception 'Only owners or editors can reorder items for this list.';
  end if;

  update public.list_items as items
  set position = new_order.ordinal - 1
  from unnest(ordered_ids) with ordinality as new_order(id, ordinal)
  where items.list_id = target_list_id
    and items.id = new_order.id;
end;
$$;

grant execute on function public.reorder_list_items(uuid, uuid[]) to authenticated;
