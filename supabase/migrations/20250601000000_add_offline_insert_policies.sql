-- Migration: add INSERT policies so authenticated clients can create their own records.
-- These policies are needed for the offline-first sync to replay queued creates
-- using the standard Supabase client (anon key + RLS) instead of the service-role key.
--
-- Using a DO block so the migration is idempotent – it will not fail if the
-- policy already exists.

-- tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'tasks'
      AND policyname = 'Users can insert own tasks'
  ) THEN
    CREATE POLICY "Users can insert own tasks"
      ON public.tasks
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'categories'
      AND policyname = 'Users can insert own categories'
  ) THEN
    CREATE POLICY "Users can insert own categories"
      ON public.categories
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- notes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'notes'
      AND policyname = 'Users can insert own notes'
  ) THEN
    CREATE POLICY "Users can insert own notes"
      ON public.notes
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- lists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'lists'
      AND policyname = 'Users can insert own lists'
  ) THEN
    CREATE POLICY "Users can insert own lists"
      ON public.lists
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- list_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'list_items'
      AND policyname = 'Users can insert own list items'
  ) THEN
    CREATE POLICY "Users can insert own list items"
      ON public.list_items
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.list_members lm
          WHERE lm.list_id = list_id
            AND lm.user_id = auth.uid()
            AND lm.role IN ('owner', 'editor')
        )
      );
  END IF;
END $$;
