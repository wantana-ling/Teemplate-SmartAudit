-- ============================================================================
-- Migration 009: Fix Sessions Table User Reference
-- ============================================================================
-- The sessions table was created with client_user_id referencing auth.users,
-- but our users are now in the public.users table. This migration fixes that.

-- Step 1: Add user_id column if it doesn't exist
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_id UUID;

-- Step 2: Drop the old foreign key constraint on client_user_id
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_client_user_id_fkey;

-- Step 3: Make client_user_id nullable (we'll use user_id instead)
ALTER TABLE public.sessions ALTER COLUMN client_user_id DROP NOT NULL;

-- Step 4: Add foreign key constraint to user_id column
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Step 5: Create index on user_id if not exists
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions(user_id);

-- Step 6: Update RLS policies to allow service role access
DROP POLICY IF EXISTS "Users can view their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can create their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Service role full access on sessions" ON public.sessions;

-- Allow service role full access (backend uses service role)
CREATE POLICY "Service role full access on sessions"
  ON public.sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Success
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 009_fix_sessions_user_reference completed successfully!';
END $$;
