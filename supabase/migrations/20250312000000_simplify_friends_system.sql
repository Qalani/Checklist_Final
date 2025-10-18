-- Reset the friends feature to a minimal shared-list implementation

-- Drop legacy friend features
DROP FUNCTION IF EXISTS public.ensure_friend_code(target_user_id uuid);
DROP FUNCTION IF EXISTS friends_search_auth_users(text, integer);
DROP FUNCTION IF EXISTS public.update_friend_request_metadata() CASCADE;
DROP TABLE IF EXISTS public.friend_invites CASCADE;
DROP TABLE IF EXISTS public.friend_codes CASCADE;
DROP TABLE IF EXISTS public.friend_requests CASCADE;
DROP TABLE IF EXISTS public.user_blocks CASCADE;

-- Ensure the friends table has simple profile fields
ALTER TABLE public.friends
  ADD COLUMN IF NOT EXISTS friend_email text;

ALTER TABLE public.friends
  ADD COLUMN IF NOT EXISTS friend_name text;

UPDATE public.friends AS f
SET
  friend_email = COALESCE(f.friend_email, u.email, ''),
  friend_name = COALESCE(f.friend_name, NULLIF(u.raw_user_meta_data->>'full_name', ''), NULLIF(u.raw_user_meta_data->>'name', ''))
FROM auth.users AS u
WHERE u.id = f.friend_id;

ALTER TABLE public.friends
  ALTER COLUMN friend_email SET DEFAULT '';

UPDATE public.friends
SET friend_email = ''
WHERE friend_email IS NULL;

ALTER TABLE public.friends
  ALTER COLUMN friend_email SET NOT NULL;

-- Helper function: add a friend by email and create reciprocal rows
CREATE OR REPLACE FUNCTION public.add_friend_by_email(target_email text)
RETURNS public.friends
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  normalized_email text;
  caller_record RECORD;
  target_record RECORD;
  inserted_row public.friends;
  target_display text;
  caller_display text;
BEGIN
  IF target_email IS NULL THEN
    RAISE EXCEPTION 'Provide an email address to add a friend.';
  END IF;

  normalized_email := lower(trim(target_email));

  IF normalized_email = '' THEN
    RAISE EXCEPTION 'Provide an email address to add a friend.';
  END IF;

  SELECT id, email, raw_user_meta_data
  INTO caller_record
  FROM auth.users
  WHERE id = auth.uid();

  IF caller_record.id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to add friends.';
  END IF;

  SELECT id, email, raw_user_meta_data
  INTO target_record
  FROM auth.users
  WHERE lower(email) = normalized_email;

  IF target_record.id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %.', normalized_email;
  END IF;

  IF target_record.id = caller_record.id THEN
    RAISE EXCEPTION 'You cannot add yourself as a friend.';
  END IF;

  target_display := COALESCE(
    NULLIF(target_record.raw_user_meta_data->>'full_name', ''),
    NULLIF(target_record.raw_user_meta_data->>'name', '')
  );

  caller_display := COALESCE(
    NULLIF(caller_record.raw_user_meta_data->>'full_name', ''),
    NULLIF(caller_record.raw_user_meta_data->>'name', '')
  );

  INSERT INTO public.friends (user_id, friend_id, friend_email, friend_name)
  VALUES (caller_record.id, target_record.id, target_record.email, target_display)
  ON CONFLICT (user_id, friend_id) DO UPDATE
    SET friend_email = EXCLUDED.friend_email,
        friend_name = EXCLUDED.friend_name
  RETURNING * INTO inserted_row;

  INSERT INTO public.friends (user_id, friend_id, friend_email, friend_name)
  VALUES (target_record.id, caller_record.id, caller_record.email, caller_display)
  ON CONFLICT (user_id, friend_id) DO UPDATE
    SET friend_email = EXCLUDED.friend_email,
        friend_name = EXCLUDED.friend_name;

  RETURN inserted_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_friend_by_email(text) TO authenticated;

-- Helper function: remove a friend for both participants
CREATE OR REPLACE FUNCTION public.remove_friend(target_friend_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to manage friends.';
  END IF;

  IF target_friend_id IS NULL THEN
    RAISE EXCEPTION 'Provide the id of the friend you want to remove.';
  END IF;

  DELETE FROM public.friends
  WHERE user_id = caller_id
    AND friend_id = target_friend_id;

  DELETE FROM public.friends
  WHERE user_id = target_friend_id
    AND friend_id = caller_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
