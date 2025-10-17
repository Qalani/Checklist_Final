create or replace function friends_search_auth_users(
  search_term text,
  limit_count integer default 20
)
returns table (
  id uuid,
  email text,
  raw_user_meta_data jsonb
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  sanitized text;
  like_pattern text;
begin
  sanitized := coalesce(trim(search_term), '');

  if sanitized = '' then
    return;
  end if;

  sanitized := replace(replace(replace(sanitized, '\\', '\\\\'), '%', '\\%'), '_', '\\_');
  like_pattern := '%' || sanitized || '%';

  return query
  select u.id, u.email, u.raw_user_meta_data
  from auth.users as u
  where (
    u.email ilike like_pattern escape '\\'
    or coalesce(u.raw_user_meta_data->>'full_name', '') ilike like_pattern escape '\\'
    or coalesce(u.raw_user_meta_data->>'name', '') ilike like_pattern escape '\\'
  )
  order by u.created_at desc
  limit greatest(1, limit_count);
end;
$$;

comment on function friends_search_auth_users is 'Search auth.users for people matching the provided term by email or name.';
