-- ============================================================================
-- Phase 4: Auditor Desktop App - Database Schema Extensions
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================================

-- Drop existing tables (in correct order due to foreign keys)
  DROP TABLE IF EXISTS audit_log CASCADE;
  DROP TABLE IF EXISTS server_permissions CASCADE;
  DROP TABLE IF EXISTS user_group_members CASCADE;
  DROP TABLE IF EXISTS user_groups CASCADE;
  DROP TABLE IF EXISTS client_users CASCADE;
  DROP TABLE IF EXISTS system_settings CASCADE;
  DROP TABLE IF EXISTS auditor_profiles CASCADE;
  
-- Create auditor_profiles table (for auditor app login)
CREATE TABLE IF NOT EXISTS auditor_profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'auditor' CHECK (role IN ('admin', 'auditor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

-- Create client_users table (managed by auditors, used by client app)
CREATE TABLE IF NOT EXISTS client_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_groups table for permission management
CREATE TABLE IF NOT EXISTS user_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_group_members table
CREATE TABLE IF NOT EXISTS user_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES client_users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, group_id)
);

-- Create server_permissions table
CREATE TABLE IF NOT EXISTS server_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES client_users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES user_groups(id) ON DELETE CASCADE,
  permission_type TEXT DEFAULT 'access',
  time_restriction JSONB,
  max_session_duration INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR group_id IS NOT NULL)
);

-- Create audit_log table for tracking admin actions
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auditor_profiles(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Add missing columns to existing tables
-- ============================================================================

-- Add enabled column to servers if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'servers' AND column_name = 'enabled')
  THEN
    ALTER TABLE servers ADD COLUMN enabled BOOLEAN DEFAULT true;
  END IF;
END $$;

-- ============================================================================
-- Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_auditor_profiles_email ON auditor_profiles(email);
CREATE INDEX IF NOT EXISTS idx_client_users_email ON client_users(email);
CREATE INDEX IF NOT EXISTS idx_client_users_enabled ON client_users(enabled);
CREATE INDEX IF NOT EXISTS idx_user_group_members_user ON user_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_user_group_members_group ON user_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_server_permissions_server ON server_permissions(server_id);
CREATE INDEX IF NOT EXISTS idx_server_permissions_user ON server_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- ============================================================================
-- Enable Row Level Security
-- ============================================================================

ALTER TABLE auditor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can view own profile" ON auditor_profiles;
DROP POLICY IF EXISTS "Service role full access auditor" ON auditor_profiles;
DROP POLICY IF EXISTS "Anyone can view settings" ON system_settings;
DROP POLICY IF EXISTS "Service role full access settings" ON system_settings;
DROP POLICY IF EXISTS "Service role full access users" ON client_users;
DROP POLICY IF EXISTS "Service role full access groups" ON user_groups;
DROP POLICY IF EXISTS "Service role full access members" ON user_group_members;
DROP POLICY IF EXISTS "Service role full access permissions" ON server_permissions;
DROP POLICY IF EXISTS "Service role full access audit" ON audit_log;

-- Auditor profiles policies
CREATE POLICY "Users can view own profile" ON auditor_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Service role full access auditor" ON auditor_profiles
  FOR ALL USING (true);

-- System settings policies
CREATE POLICY "Anyone can view settings" ON system_settings
  FOR SELECT USING (true);

CREATE POLICY "Service role full access settings" ON system_settings
  FOR ALL USING (true);

-- Client users policies
CREATE POLICY "Service role full access users" ON client_users
  FOR ALL USING (true);

-- User groups policies
CREATE POLICY "Service role full access groups" ON user_groups
  FOR ALL USING (true);

-- User group members policies
CREATE POLICY "Service role full access members" ON user_group_members
  FOR ALL USING (true);

-- Server permissions policies
CREATE POLICY "Service role full access permissions" ON server_permissions
  FOR ALL USING (true);

-- Audit log policies
CREATE POLICY "Service role full access audit" ON audit_log
  FOR ALL USING (true);

-- ============================================================================
-- Success message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 007_auditor_app_tables completed successfully!';
END $$;
