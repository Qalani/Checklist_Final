-- Migration: Add user_email to task collaborators
-- Adds a cached copy of the collaborator email to avoid joins when listing collaborators.

alter table public.task_collaborators
  add column if not exists user_email text;

update public.task_collaborators tc
set user_email = lower(u.email)
from auth.users u
where tc.user_id = u.id
  and (tc.user_email is distinct from lower(u.email) or tc.user_email is null);

