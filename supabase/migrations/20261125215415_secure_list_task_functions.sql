-- app_internal must not be included in PostgREST's exposed schemas. Its limited
-- SQL EXECUTE grants allow the invoker wrappers and RLS policies to call the
-- implementations; they must not become separately addressable API endpoints.
-- Public RPCs retain their existing signatures and authorization checks.
-- Fail rather than grant access to an existing schema with unknown objects.
create schema app_internal;
revoke all on schema app_internal from public;
grant usage on schema app_internal to anon, authenticated, service_role;

-- Policy expressions retain references to the original function OIDs when the
-- functions move. Their helpers must remain callable by anon: existing policies
-- target PUBLIC and anonymous table reads should return no rows, not errors.
alter function public.is_list_member(uuid, text[]) set schema app_internal;
alter function public.is_list_owner(uuid) set schema app_internal;
alter function public.is_task_owner(uuid) set schema app_internal;
alter function public.is_task_collaborator(uuid, text[]) set schema app_internal;

alter function public.create_list_item(uuid, text, integer) set schema app_internal;
alter function public.reorder_list_items(uuid, uuid[]) set schema app_internal;
alter function public.enable_list_public_share(uuid) set schema app_internal;
alter function public.rotate_list_public_share(uuid) set schema app_internal;
alter function public.disable_list_public_share(uuid) set schema app_internal;
alter function public.get_task_collaborators(uuid) set schema app_internal;
alter function public.get_public_list(uuid) set schema app_internal;

-- Inherited PUBLIC grants must be removed as well as explicit role grants.
revoke all on function app_internal.is_list_member(uuid, text[]), app_internal.is_list_owner(uuid),
  app_internal.is_task_owner(uuid), app_internal.is_task_collaborator(uuid, text[]),
  app_internal.get_public_list(uuid), app_internal.create_list_item(uuid, text, integer),
  app_internal.reorder_list_items(uuid, uuid[]), app_internal.enable_list_public_share(uuid),
  app_internal.rotate_list_public_share(uuid), app_internal.disable_list_public_share(uuid),
  app_internal.get_task_collaborators(uuid) from public, anon, authenticated;
grant execute on function app_internal.is_list_member(uuid, text[]),
  app_internal.is_list_owner(uuid), app_internal.is_task_owner(uuid),
  app_internal.is_task_collaborator(uuid, text[]), app_internal.get_public_list(uuid)
  to anon, authenticated, service_role;
grant execute on function app_internal.create_list_item(uuid, text, integer),
  app_internal.reorder_list_items(uuid, uuid[]), app_internal.enable_list_public_share(uuid),
  app_internal.rotate_list_public_share(uuid), app_internal.disable_list_public_share(uuid),
  app_internal.get_task_collaborators(uuid) to authenticated, service_role;

create function public.is_list_member(target_list_id uuid, allowed_roles text[] default array['owner','editor','viewer'])
returns boolean language sql security invoker set search_path = ''
as $$ select app_internal.is_list_member(target_list_id, allowed_roles) $$;
create function public.is_list_owner(target_list_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select app_internal.is_list_owner(target_list_id) $$;
create function public.is_task_owner(target_task_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select app_internal.is_task_owner(target_task_id) $$;
create function public.is_task_collaborator(target_task_id uuid, allowed_roles text[] default array['editor','viewer'])
returns boolean language sql security invoker set search_path = ''
as $$ select app_internal.is_task_collaborator(target_task_id, allowed_roles) $$;

create function public.create_list_item(target_list_id uuid, item_content text default '', item_position integer default null)
returns public.list_items language sql security invoker set search_path = ''
as $$ select * from app_internal.create_list_item(target_list_id, item_content, item_position) $$;
create function public.reorder_list_items(target_list_id uuid, ordered_ids uuid[])
returns void language sql security invoker set search_path = ''
as $$ select app_internal.reorder_list_items(target_list_id, ordered_ids) $$;
create function public.enable_list_public_share(list_uuid uuid)
returns public.list_public_shares language sql security invoker set search_path = ''
as $$ select * from app_internal.enable_list_public_share(list_uuid) $$;
create function public.rotate_list_public_share(list_uuid uuid)
returns public.list_public_shares language sql security invoker set search_path = ''
as $$ select * from app_internal.rotate_list_public_share(list_uuid) $$;
create function public.disable_list_public_share(list_uuid uuid)
returns void language sql security invoker set search_path = ''
as $$ select app_internal.disable_list_public_share(list_uuid) $$;
create function public.get_task_collaborators(task_uuid uuid)
returns table (id uuid, task_id uuid, user_id uuid, user_email text, role text, is_owner boolean, created_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from app_internal.get_task_collaborators(task_uuid) $$;
create function public.get_public_list(list_token uuid)
returns table (id uuid, name text, description text, created_at timestamptz, owner_email text, category_mode text, items jsonb)
language sql security invoker set search_path = ''
as $$ select * from app_internal.get_public_list(list_token) $$;

revoke all on function public.is_list_member(uuid, text[]), public.is_list_owner(uuid),
  public.is_task_owner(uuid), public.is_task_collaborator(uuid, text[]),
  public.create_list_item(uuid, text, integer), public.reorder_list_items(uuid, uuid[]),
  public.enable_list_public_share(uuid), public.rotate_list_public_share(uuid),
  public.disable_list_public_share(uuid), public.get_task_collaborators(uuid),
  public.get_public_list(uuid) from public, anon, authenticated;
grant execute on function public.is_list_member(uuid, text[]), public.is_list_owner(uuid),
  public.is_task_owner(uuid), public.is_task_collaborator(uuid, text[]),
  public.get_public_list(uuid) to anon, authenticated, service_role;
grant execute on function public.create_list_item(uuid, text, integer),
  public.reorder_list_items(uuid, uuid[]), public.enable_list_public_share(uuid),
  public.rotate_list_public_share(uuid), public.disable_list_public_share(uuid),
  public.get_task_collaborators(uuid) to authenticated, service_role;

-- These trigger functions only assign NEW.updated_at and require no elevated role.
alter function public.set_calendar_event_updated_timestamp() security invoker;
alter function public.set_note_updated_timestamp() security invoker;
alter function public.set_profile_settings_updated_at() security invoker;
alter function public.set_zen_reminder_updated_timestamp() security invoker;
revoke all on function public.set_calendar_event_updated_timestamp(),
  public.set_note_updated_timestamp(), public.set_profile_settings_updated_at(),
  public.set_zen_reminder_updated_timestamp() from public, anon, authenticated;

-- The list item timestamp function is a trigger too; pin its lookup path.
alter function public.set_current_timestamp_updated_at() set search_path = '';
