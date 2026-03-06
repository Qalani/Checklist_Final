alter table public.lists
  add column if not exists archived boolean not null default false;
