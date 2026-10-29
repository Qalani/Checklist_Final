-- Run only against a disposable local database with the application schema and
-- all rollout migrations applied, using a database administrator connection.
-- Requires Supabase's anon/authenticated roles and auth.uid() claim handling.
-- Every fixture and test helper is rolled back on completion.
begin;

create function pg_temp.check_equal(actual text, expected text, label text)
returns void language plpgsql security invoker as $$
begin
  if actual is distinct from expected then
    raise exception '%: expected %, got %', label, expected, actual;
  end if;
  raise notice 'PASS: %', label;
end;
$$;

create function pg_temp.expect_error(statement text, expected_state text, label text)
returns void language plpgsql security invoker as $$
declare caught_state text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics caught_state = returned_sqlstate;
  end;
  if caught_state is distinct from expected_state then
    raise exception '%: expected SQLSTATE %, got %', label, expected_state, caught_state;
  end if;
  raise notice 'PASS: %', label;
end;
$$;

insert into auth.users(id,email,raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001','rollout-owner@example.invalid','{}'),
  ('00000000-0000-4000-8000-000000000002','rollout-editor@example.invalid','{}'),
  ('00000000-0000-4000-8000-000000000003','rollout-viewer@example.invalid','{}'),
  ('00000000-0000-4000-8000-000000000004','rollout-coowner@example.invalid','{}'),
  ('00000000-0000-4000-8000-000000000005','rollout-delete@example.invalid','{}');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';

insert into public.tasks(id,user_id,title,category,category_color,"order",due_date,
                         task_recurrence,task_recurrence_anchor_day) values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
   'Monthly fixture','Test','#000000',0,'2027-01-31T12:00:00Z','monthly',31),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
   'Private fixture','Test','#000000',1,null,null,null);
insert into public.lists(id,user_id,name) values
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Shared fixture'),
  ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Other fixture');

select pg_temp.check_equal((select role from public.list_members where list_id='20000000-0000-4000-8000-000000000001'),
  'owner','Creating a list creates its canonical owner membership');
select pg_temp.check_equal((public.add_friend_by_email('rollout-editor@example.invalid')).status,
  'pending','Friend request RPC creates a pending request');
select pg_temp.check_equal((select count(*)::text from public.friends),'0','A request alone creates no friendship');
select pg_temp.expect_error($q$insert into public.friends(user_id,friend_id)
  values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003')$q$,
  '42501','Direct friend insertion is denied');
select pg_temp.expect_error($q$insert into public.friend_requests(requester_id,target_id,status)
  values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','accepted')$q$,
  '42501','Direct accepted-request forgery is denied');
select pg_temp.expect_error($q$update public.friend_requests set status='accepted'$q$,
  '42501','Direct request acceptance is denied');
select pg_temp.expect_error($q$select public.respond_to_friend_request(
  (select id from public.friend_requests limit 1),'accept')$q$,
  'P0001','Requester cannot accept their own outgoing request');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select pg_temp.check_equal((public.respond_to_friend_request(
  (select id from public.friend_requests limit 1),'accept')).status,
  'accepted','Target can accept a request through the RPC');
select pg_temp.check_equal((select count(*)::text from public.friends),'1','Target sees reciprocal friendship');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select pg_temp.check_equal((select count(*)::text from public.friends),'1','Requester sees reciprocal friendship');
select pg_temp.check_equal((public.invite_task_collaborator('10000000-0000-4000-8000-000000000001',
  'rollout-editor@example.invalid','editor')).role,'editor','Owner can invite an accepted friend to a task');
select pg_temp.expect_error($q$select public.invite_task_collaborator('10000000-0000-4000-8000-000000000001',
  'rollout-viewer@example.invalid','editor')$q$,'42501','Task invitation requires accepted friendship');
select pg_temp.expect_error($q$insert into public.task_collaborators(task_id,user_id,role)
  values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','editor')$q$,
  '42501','Direct task collaborator insertion also requires friendship');

select pg_temp.check_equal((public.invite_list_member('20000000-0000-4000-8000-000000000001',
  'rollout-editor@example.invalid','editor')).role,'editor','Owner can invite a list editor');
select pg_temp.check_equal((public.invite_list_member('20000000-0000-4000-8000-000000000001',
  'rollout-viewer@example.invalid','viewer')).role,'viewer','Owner can invite a list viewer');
select pg_temp.check_equal((public.invite_list_member('20000000-0000-4000-8000-000000000001',
  'rollout-coowner@example.invalid','owner')).role,'owner','Owner can invite an explicit co-owner');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
update public.tasks set title='Edited by collaborator' where id='10000000-0000-4000-8000-000000000001';
select pg_temp.check_equal((select title from public.tasks where id='10000000-0000-4000-8000-000000000001'),
  'Edited by collaborator','Task editor can update ordinary task fields');
select pg_temp.check_equal((select task_recurrence_anchor_day::text from public.get_tasks_with_access()
  where id='10000000-0000-4000-8000-000000000001'),'31','Task RPC returns monthly anchor to collaborator');
select pg_temp.check_equal((select count(*)::text from public.get_tasks_with_access()),'1',
  'Task RPC does not expose the owner private task to collaborator');
update public.lists set name='Edited list' where id='20000000-0000-4000-8000-000000000001';
select pg_temp.check_equal((select name from public.lists where id='20000000-0000-4000-8000-000000000001'),
  'Edited list','List editor can update ordinary list fields');
select pg_temp.check_equal((public.create_list_item('20000000-0000-4000-8000-000000000001','Editor item')).content,
  'Editor item','List editor can create a list item');
select pg_temp.expect_error($q$update public.tasks set user_id='00000000-0000-4000-8000-000000000002'
  where id='10000000-0000-4000-8000-000000000001'$q$,'42501','Task editor cannot take ownership');
select pg_temp.expect_error($q$update public.lists set user_id='00000000-0000-4000-8000-000000000002'
  where id='20000000-0000-4000-8000-000000000001'$q$,'42501','List editor cannot take ownership');
select pg_temp.expect_error($q$update public.tasks set id='10000000-0000-4000-8000-000000000009'
  where id='10000000-0000-4000-8000-000000000001'$q$,'42501','Task editor cannot rewrite row identity');
select pg_temp.expect_error($q$select public.invite_task_collaborator('10000000-0000-4000-8000-000000000001',
  'rollout-viewer@example.invalid','viewer')$q$,'42501','Task editor cannot issue invitations');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
select pg_temp.check_equal((select count(*)::text from public.get_tasks_with_access()),'0',
  'Unrelated user receives no task RPC rows');
select pg_temp.expect_error($q$select public.create_list_item('20000000-0000-4000-8000-000000000001','Forbidden')$q$,
  'P0001','List viewer cannot create items');
with changed as (update public.lists set name='Forbidden' where id='20000000-0000-4000-8000-000000000001' returning id)
select pg_temp.check_equal(count(*)::text,'0','List viewer cannot update the shared list') from changed;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($q$update public.tasks set user_id='00000000-0000-4000-8000-000000000003'
  where id='10000000-0000-4000-8000-000000000001'$q$,'42501','Task owner cannot reassign ownership through row updates');
select pg_temp.expect_error($q$update public.lists set user_id='00000000-0000-4000-8000-000000000003'
  where id='20000000-0000-4000-8000-000000000001'$q$,'42501','List owner cannot reassign ownership through row updates');
select pg_temp.expect_error($q$update public.task_collaborators set task_id='10000000-0000-4000-8000-000000000002'
  where task_id='10000000-0000-4000-8000-000000000001'$q$,'42501','Task collaborator cannot be moved to another task');
select pg_temp.expect_error($q$update public.list_members set list_id='20000000-0000-4000-8000-000000000002'
  where list_id='20000000-0000-4000-8000-000000000001' and user_id='00000000-0000-4000-8000-000000000003'$q$,
  '42501','List membership cannot be moved to another list');
select pg_temp.expect_error($q$update public.list_members set user_id='00000000-0000-4000-8000-000000000005'
  where list_id='20000000-0000-4000-8000-000000000001' and user_id='00000000-0000-4000-8000-000000000003'$q$,
  '42501','List membership cannot be reassigned to another account');
select pg_temp.expect_error($q$update public.list_members set role='viewer'
  where list_id='20000000-0000-4000-8000-000000000001' and user_id='00000000-0000-4000-8000-000000000001'$q$,
  '42501','Canonical owner membership cannot be demoted');
select pg_temp.expect_error($q$delete from public.list_members
  where list_id='20000000-0000-4000-8000-000000000001' and user_id='00000000-0000-4000-8000-000000000001'$q$,
  '42501','Canonical owner membership cannot be removed');
update public.task_collaborators set role='viewer'
  where task_id='10000000-0000-4000-8000-000000000001' and user_id='00000000-0000-4000-8000-000000000002';
select pg_temp.check_equal((select role from public.task_collaborators where task_id='10000000-0000-4000-8000-000000000001'),
  'viewer','Task owner can still change collaborator roles');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004';
select pg_temp.check_equal((public.invite_list_member('20000000-0000-4000-8000-000000000001',
  'rollout-viewer@example.invalid','editor')).role,'editor','Explicit list co-owner can manage collaborators');
update public.lists set name='Co-owner edit' where id='20000000-0000-4000-8000-000000000001';
select pg_temp.check_equal((select name from public.lists where id='20000000-0000-4000-8000-000000000001'),
  'Co-owner edit','Explicit list co-owner can edit the list');
select pg_temp.expect_error($q$delete from public.list_members
  where list_id='20000000-0000-4000-8000-000000000001' and user_id='00000000-0000-4000-8000-000000000001'$q$,
  '42501','Co-owner cannot remove canonical owner');
delete from public.list_members where list_id='20000000-0000-4000-8000-000000000001'
  and user_id='00000000-0000-4000-8000-000000000004';
select pg_temp.check_equal((select count(*)::text from public.list_members
  where list_id='20000000-0000-4000-8000-000000000001' and user_id='00000000-0000-4000-8000-000000000004'),
  '0','Co-owner can leave a list');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select public.remove_friend('00000000-0000-4000-8000-000000000002');
select pg_temp.check_equal((select count(*)::text from public.friends),'0','Friend removal RPC removes caller relationship');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select pg_temp.check_equal((select count(*)::text from public.friends),'0','Friend removal RPC removes reciprocal relationship');

set local request.jwt.claim.sub = '';
select pg_temp.expect_error($q$select public.invite_task_collaborator('10000000-0000-4000-8000-000000000001',
  'rollout-viewer@example.invalid','viewer')$q$,'42501','Authenticated role without identity cannot invite task collaborators');
select pg_temp.expect_error($q$select public.invite_list_member('20000000-0000-4000-8000-000000000001',
  'rollout-viewer@example.invalid','viewer')$q$,'42501','Authenticated role without identity cannot invite list collaborators');
set local role anon;
select pg_temp.expect_error($q$select public.invite_task_collaborator('10000000-0000-4000-8000-000000000001',
  'rollout-viewer@example.invalid','viewer')$q$,'42501','Anonymous role cannot execute task invitation RPC');
select pg_temp.expect_error($q$select public.get_tasks_with_access()$q$,'42501','Anonymous role cannot execute task access RPC');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
insert into public.calendar_events(user_id,title,start_time,end_time,import_source,import_uid)
values ('00000000-0000-4000-8000-000000000001','Imported','2027-01-01T12:00Z','2027-01-01T13:00Z','ical','fixture-uid')
on conflict(user_id,import_source,import_uid) do update set title=excluded.title;
insert into public.calendar_events(user_id,title,start_time,end_time,import_source,import_uid)
values ('00000000-0000-4000-8000-000000000001','Reimported','2027-01-01T12:00Z','2027-01-01T13:00Z','ical','fixture-uid')
on conflict(user_id,import_source,import_uid) do update set title=excluded.title;
select pg_temp.check_equal((select count(*)::text from public.calendar_events),'1','Calendar reimport upserts without duplicates');
select pg_temp.check_equal((select title from public.calendar_events),'Reimported','Calendar reimport updates existing event');
insert into public.calendar_events(user_id,title,start_time,end_time) values
  ('00000000-0000-4000-8000-000000000001','Manual one','2027-01-01T12:00Z','2027-01-01T13:00Z'),
  ('00000000-0000-4000-8000-000000000001','Manual two','2027-01-01T12:00Z','2027-01-01T13:00Z');
select pg_temp.check_equal((select count(*)::text from public.calendar_events),'3','Unimported events retain NULL-distinct uniqueness');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
insert into public.calendar_events(user_id,title,start_time,end_time,import_source,import_uid)
values ('00000000-0000-4000-8000-000000000002','Other owner import','2027-01-01T12:00Z','2027-01-01T13:00Z','ical','fixture-uid')
on conflict(user_id,import_source,import_uid) do update set title=excluded.title;
select pg_temp.check_equal((select count(*)::text from public.calendar_events),'1','Import uniqueness and RLS remain scoped by user');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($q$update public.tasks set task_recurrence_anchor_day=0
  where id='10000000-0000-4000-8000-000000000001'$q$,'23514','Monthly anchor rejects zero');
select pg_temp.expect_error($q$update public.tasks set task_recurrence_anchor_day=32
  where id='10000000-0000-4000-8000-000000000001'$q$,'23514','Monthly anchor rejects values above 31');
update public.tasks set due_date='2027-02-28T12:00Z'
  where id='10000000-0000-4000-8000-000000000001';
select pg_temp.check_equal((select task_recurrence_anchor_day::text from public.get_tasks_with_access()
  where id='10000000-0000-4000-8000-000000000001'),'31','Stored anchor survives a February due date');

delete from public.lists where id='20000000-0000-4000-8000-000000000001';
select pg_temp.check_equal((select count(*)::text from public.list_members
  where list_id='20000000-0000-4000-8000-000000000001'),'0','Deleting the list cascades canonical and shared memberships');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000005';
insert into public.lists(id,user_id,name) values
  ('20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000005','Account-delete fixture');
delete from auth.users where id='00000000-0000-4000-8000-000000000005';
select pg_temp.check_equal((select count(*)::text from public.lists
  where user_id='00000000-0000-4000-8000-000000000005'),'0','Deleting an auth account cascades owned lists');

rollback;
