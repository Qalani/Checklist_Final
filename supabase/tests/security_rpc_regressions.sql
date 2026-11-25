-- Run against a disposable Supabase database after all migrations.
-- All fixtures and changes are rolled back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000011','security-owner@example.invalid'), ('00000000-0000-4000-8000-000000000012','security-editor@example.invalid'), ('00000000-0000-4000-8000-000000000013','security-viewer@example.invalid');
insert into public.lists(id,user_id,name,category_mode) values ('20000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011','Groceries','grocery');
insert into public.list_members(list_id,user_id,role)
select '20000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011', 'owner'
where not exists (select 1 from public.list_members where list_id='20000000-0000-4000-8000-000000000011' and user_id='00000000-0000-4000-8000-000000000011');
insert into public.list_members(list_id,user_id,role) values
('20000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','editor'),
('20000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000013','viewer');
insert into public.tasks(id,user_id,title,category,category_color,"order") values ('30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011','Task','Work','#000',0);
insert into public.task_collaborators(task_id,user_id,role,user_email) values ('30000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000012','editor','security-editor@example.invalid');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000011';
select (public.enable_list_public_share('20000000-0000-4000-8000-000000000011')).token as old_token \gset
select (public.create_list_item('20000000-0000-4000-8000-000000000011','Bananas')).id as first_item \gset
select (public.create_list_item('20000000-0000-4000-8000-000000000011','Milk')).id as second_item \gset
select public.reorder_list_items('20000000-0000-4000-8000-000000000011', array[:'second_item'::uuid, :'first_item'::uuid]);
select 1/(case when (select position from public.list_items where id=:'second_item'::uuid)=0 and (select position from public.list_items where id=:'first_item'::uuid)=1 then 1 else 0 end) as reorder_changes_positions;
select (public.rotate_list_public_share('20000000-0000-4000-8000-000000000011')).token as rotated_token \gset
select 1/(case when count(*)=0 then 1 else 0 end) as old_token_invalidated from public.get_public_list(:'old_token'::uuid);
select 1/(case when count(*)=1 then 1 else 0 end) as rotated_token_works from public.get_public_list(:'rotated_token'::uuid);
select 1/(case when count(*)=2 then 1 else 0 end) as owner_sees_all_task_collaborators from public.get_task_collaborators('30000000-0000-4000-8000-000000000011');
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000012';
select 1/(case when count(*)=1 then 1 else 0 end) as editor_sees_shared_list from public.lists;
select 1/(case when count(*)=1 then 1 else 0 end) as editor_sees_shared_task from public.tasks;
select 1/(case when count(*)=2 then 1 else 0 end) as editor_sees_list_items from public.list_items;
select (public.create_list_item('20000000-0000-4000-8000-000000000011','Eggs')).id as editor_item;
select 1/(case when count(*)=2 then 1 else 0 end) as editor_sees_self_and_owner from public.get_task_collaborators('30000000-0000-4000-8000-000000000011');
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000013';
select 1/(case when count(*)=1 then 1 else 0 end) as viewer_sees_shared_list from public.lists;
do $$ begin perform public.create_list_item('20000000-0000-4000-8000-000000000011','Forbidden'); raise exception 'viewer create unexpectedly succeeded'; exception when raise_exception then if sqlerrm <> 'You do not have permission to add items to this list.' then raise; end if; end $$;
set request.jwt.claim.sub = '';
reset role;
select token as share_token from public.list_public_shares where list_id='20000000-0000-4000-8000-000000000011' \gset
set role anon;
select 1/(case when count(*)=0 then 1 else 0 end) as anon_direct_table_sees_nothing from public.lists;
select 1/(case when count(*)=1 then 1 else 0 end) as anon_token_can_view_shared_list from public.get_public_list(:'share_token'::uuid) where category_mode='grocery' and jsonb_array_length(items)=3;
select 1/(case when count(*)=0 then 1 else 0 end) as invalid_token_sees_nothing from public.get_public_list('00000000-0000-0000-0000-000000000000');
do $$ begin perform public.create_list_item('20000000-0000-4000-8000-000000000011','Forbidden'); raise exception 'anonymous create unexpectedly succeeded'; exception when insufficient_privilege then null; end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000011';
select public.disable_list_public_share('20000000-0000-4000-8000-000000000011');
set role anon;
select 1/(case when count(*)=0 then 1 else 0 end) as disabled_token_invalidated from public.get_public_list(:'share_token'::uuid);
reset role;
select 1/(case when not has_function_privilege('anon','public.create_list_item(uuid,text,integer)','execute') and has_function_privilege('authenticated','public.create_list_item(uuid,text,integer)','execute') and has_function_privilege('service_role','public.create_list_item(uuid,text,integer)','execute') then 1 else 0 end) as create_rpc_grants;
select 1/(case when has_function_privilege('anon','public.get_public_list(uuid)','execute') and has_function_privilege('authenticated','public.get_public_list(uuid)','execute') and has_function_privilege('service_role','public.get_public_list(uuid)','execute') then 1 else 0 end) as shared_rpc_grants;
select 1/(case when has_function_privilege('anon','app_internal.is_list_member(uuid,text[])','execute') and has_function_privilege('authenticated','app_internal.is_list_member(uuid,text[])','execute') then 1 else 0 end) as rls_helper_grants;
select 1/(case when not has_function_privilege('anon','public.set_note_updated_timestamp()','execute') and not has_function_privilege('authenticated','public.set_note_updated_timestamp()','execute') then 1 else 0 end) as trigger_direct_grants;
-- Revoking direct EXECUTE on a trigger function must not prevent ordinary updates.
create temp table trigger_calendar(updated_at timestamptz, value text);
create temp table trigger_note(updated_at timestamptz, value text);
create temp table trigger_profile(updated_at timestamptz, value text);
create temp table trigger_reminder(updated_at timestamptz, value text);
create temp table trigger_item(updated_at timestamptz, value text);
create trigger stamp before update on trigger_calendar for each row execute function public.set_calendar_event_updated_timestamp();
create trigger stamp before update on trigger_note for each row execute function public.set_note_updated_timestamp();
create trigger stamp before update on trigger_profile for each row execute function public.set_profile_settings_updated_at();
create trigger stamp before update on trigger_reminder for each row execute function public.set_zen_reminder_updated_timestamp();
create trigger stamp before update on trigger_item for each row execute function public.set_current_timestamp_updated_at();
grant select,insert,update on trigger_calendar,trigger_note,trigger_profile,trigger_reminder,trigger_item to authenticated;
set role authenticated;
insert into trigger_calendar values ('2000-01-01','before');
insert into trigger_note values ('2000-01-01','before');
insert into trigger_profile values ('2000-01-01','before');
insert into trigger_reminder values ('2000-01-01','before');
insert into trigger_item values ('2000-01-01','before');
update trigger_calendar set value='after';
update trigger_note set value='after';
update trigger_profile set value='after';
update trigger_reminder set value='after';
update trigger_item set value='after';
select 1/(case when (select updated_at > '2000-01-01' from trigger_calendar) and (select updated_at > '2000-01-01' from trigger_note) and (select updated_at > '2000-01-01' from trigger_profile) and (select updated_at > '2000-01-01' from trigger_reminder) and (select updated_at > '2000-01-01' from trigger_item) then 1 else 0 end) as timestamps_updated;
rollback;
