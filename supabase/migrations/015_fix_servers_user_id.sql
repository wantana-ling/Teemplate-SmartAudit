-- Drop all foreign key constraints on user_id
  ALTER TABLE servers DROP CONSTRAINT IF EXISTS servers_user_id_fkey;
  ALTER TABLE servers DROP CONSTRAINT IF EXISTS servers_created_by_fkey;

  -- Make user_id nullable (no foreign key - just informational)
  ALTER TABLE servers ALTER COLUMN user_id DROP NOT NULL;

  -- Clear any existing user_id values that might cause issues
  UPDATE servers SET user_id = NULL;

  -- Update RLS policies to allow service role full access
  DROP POLICY IF EXISTS "Users can view their own servers" ON servers;
  DROP POLICY IF EXISTS "Users can create their own servers" ON servers;
  DROP POLICY IF EXISTS "Users can update their own servers" ON servers;
  DROP POLICY IF EXISTS "Users can delete their own servers" ON servers;
  DROP POLICY IF EXISTS "Service role full access" ON servers;

  -- Allow service role full access (used by backend)
  CREATE POLICY "Service role full access" ON servers FOR ALL USING (true);