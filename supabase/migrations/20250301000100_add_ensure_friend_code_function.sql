-- Migration: Provide a database helper to guarantee friend code generation
-- Ensures each user receives an invite code without relying on repeated client retries.

create or replace function public.ensure_friend_code(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  position integer;
  attempt integer := 0;
begin
  if target_user_id is null then
    raise exception 'target_user_id cannot be null';
  end if;

  select code into existing_code
  from friend_codes
  where user_id = target_user_id;

  if existing_code is not null then
    return existing_code;
  end if;

  loop
    candidate := '';
    attempt := attempt + 1;

    for position in 1..8 loop
      candidate := candidate || substr(
        alphabet,
        1 + floor(random() * length(alphabet))::int,
        1
      );
    end loop;

    begin
      insert into friend_codes (user_id, code)
      values (target_user_id, candidate);
      return candidate;
    exception
      when unique_violation then
        -- Someone else claimed this code first. If the user now has a code, return it;
        -- otherwise, try again with a new candidate.
        select code into existing_code
        from friend_codes
        where user_id = target_user_id;

        if existing_code is not null then
          return existing_code;
        end if;
    end;

    if attempt >= 32 then
      raise exception 'Unable to generate a unique friend code for user %', target_user_id;
    end if;
  end loop;
end;
$$;

comment on function public.ensure_friend_code(uuid) is
  'Returns an existing friend code for a user or creates a new unique code when missing.';
