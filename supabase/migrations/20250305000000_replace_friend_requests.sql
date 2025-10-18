-- Migration: introduce simplified friend invites table
drop table if exists public.friend_requests cascade;

create table if not exists public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  request_code text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint friend_invites_unique_pair unique (sender_id, receiver_id)
);

create unique index if not exists friend_invites_request_code_idx
  on public.friend_invites (request_code);

alter table public.friend_invites enable row level security;

create policy if not exists "Participants can view friend invites"
  on public.friend_invites
  for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy if not exists "Senders can create friend invites"
  on public.friend_invites
  for insert
  with check (auth.uid() = sender_id);

create policy if not exists "Participants can delete friend invites"
  on public.friend_invites
  for delete
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

