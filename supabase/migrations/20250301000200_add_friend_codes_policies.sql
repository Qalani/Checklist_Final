-- Migration: Add RLS policy for friend codes
-- Allows authenticated users to access their own friend code record.

alter table public.friend_codes
  enable row level security;

create policy "Users can view their own friend code"
  on public.friend_codes
  for select
  using (auth.uid() = user_id);
