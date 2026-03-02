-- ============================================================================
-- Migration 018: Add department column to users and servers tables
-- ============================================================================

-- Add department to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);

-- Add department to servers table (users access servers matching their department)
-- department is TEXT[] to allow a server to belong to multiple departments
ALTER TABLE servers ADD COLUMN IF NOT EXISTS department TEXT[];
CREATE INDEX IF NOT EXISTS idx_servers_department ON servers USING GIN(department);

DO $$
BEGIN
  RAISE NOTICE 'Migration 018_add_department completed successfully!';
END $$;
