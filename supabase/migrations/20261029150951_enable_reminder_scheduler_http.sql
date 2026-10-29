-- The reminder cron job calls net.http_post. Supabase Cron does not enable
-- pg_net automatically; without it every scheduled invocation fails in SQL.
create extension if not exists pg_net with schema extensions;
