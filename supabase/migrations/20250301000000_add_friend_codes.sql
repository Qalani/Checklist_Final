-- Migration: Add friend codes for sharing friend requests
-- Creates a table that stores a short, unique code per user for friend invites.

create table if not exists public.friend_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists friend_codes_code_idx on public.friend_codes (code);
