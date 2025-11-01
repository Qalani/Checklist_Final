create or replace function public.create_list_item(
  target_list_id uuid,
  item_content text default '',
  item_position integer default null
)
returns public.list_items
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_row public.list_items;
  next_position integer;
begin
  if not public.is_list_member(target_list_id, array['owner','editor']) then
    raise exception 'You do not have permission to add items to this list.';
  end if;

  if item_position is null then
    select coalesce(max(position), -1) + 1 into next_position
    from public.list_items
    where list_id = target_list_id;
  else
    next_position := item_position;
  end if;

  insert into public.list_items (list_id, content, position)
  values (target_list_id, coalesce(item_content, ''), next_position)
  returning * into new_row;

  return new_row;
end;
$$;

grant execute on function public.create_list_item(uuid, text, integer) to authenticated;
