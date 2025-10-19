create table if not exists profile_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dashboard_layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table profile_settings enable row level security;

create or replace function public.set_profile_settings_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profile_settings_updated_at
before update on profile_settings
for each row
execute function public.set_profile_settings_updated_at();

create policy "Users can read their profile settings"
on profile_settings
for select
using (auth.uid() = user_id);

create policy "Users can insert their profile settings"
on profile_settings
for insert
with check (auth.uid() = user_id);

create policy "Users can update their profile settings"
on profile_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
