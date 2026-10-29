-- Keep the intended day separately from a short month's clamped due date.
-- Leave existing rows unset: the original day of an already-clamped task
-- cannot be recovered. Clients initialize it from the current local due date.
alter table public.tasks
  add column if not exists task_recurrence_anchor_day smallint
  check (task_recurrence_anchor_day between 1 and 31);

comment on column public.tasks.task_recurrence_anchor_day is
  'Intended local day (1-31) for monthly task recurrence; retained across short months.';

-- The browser loads tasks through this RPC. Its original fixed projection
-- predates recurrence columns, so include the stored scheduling data as well.
-- Changing RETURNS TABLE requires replacing the function rather than CREATE
-- OR REPLACE. Run as the caller so the underlying table policies also apply.
drop function if exists public.get_tasks_with_access();

create function public.get_tasks_with_access()
returns table (
  id uuid,
  title text,
  description text,
  completed boolean,
  priority text,
  category text,
  category_color text,
  "order" integer,
  due_date timestamptz,
  reminder_minutes_before integer,
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  access_role text,
  reminder_recurrence jsonb,
  reminder_next_trigger_at timestamptz,
  reminder_last_trigger_at timestamptz,
  reminder_snoozed_until timestamptz,
  reminder_timezone text,
  task_recurrence text,
  task_recurrence_interval integer,
  task_recurrence_anchor_day smallint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id, t.title, t.description, t.completed, t.priority,
    t.category, t.category_color, t."order", t.due_date,
    t.reminder_minutes_before, t.created_at, t.updated_at, t.user_id,
    case when t.user_id = (select auth.uid()) then 'owner'
      else coalesce(tc.role, 'viewer') end as access_role,
    t.reminder_recurrence, t.reminder_next_trigger_at,
    t.reminder_last_trigger_at, t.reminder_snoozed_until,
    t.reminder_timezone, t.task_recurrence,
    t.task_recurrence_interval, t.task_recurrence_anchor_day
  from public.tasks t
  left join public.task_collaborators tc
    on tc.task_id = t.id and tc.user_id = (select auth.uid())
  where t.user_id = (select auth.uid()) or tc.user_id is not null;
$$;

revoke all on function public.get_tasks_with_access() from public, anon;
grant execute on function public.get_tasks_with_access() to authenticated, service_role;
