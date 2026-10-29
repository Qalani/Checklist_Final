-- PostgREST's on_conflict=user_id,import_source,import_uid cannot infer
-- the original partial index without a matching WHERE predicate. A normal
-- unique index enforces the same imported-event identity while PostgreSQL's
-- default NULL-distinct semantics still permit multiple non-imported events.
drop index if exists public.calendar_events_import_unique_idx;

create unique index calendar_events_import_unique_idx
  on public.calendar_events (user_id, import_source, import_uid);
