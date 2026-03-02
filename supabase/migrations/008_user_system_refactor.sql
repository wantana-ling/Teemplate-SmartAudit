-- ============================================================================
-- Migration 008: User System Refactor
-- - Single users table for all user types
-- - Groups (Discord-style roles)
-- - Server access permissions
-- - Risk detection support
-- ============================================================================

-- Drop old tables if they exist (clean slate)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS server_permissions CASCADE;
DROP TABLE IF EXISTS user_group_members CASCADE;
DROP TABLE IF EXISTS user_groups CASCADE;
DROP TABLE IF EXISTS client_users CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS auditor_profiles CASCADE;

-- ============================================================================
-- Core Users Table
-- ============================================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  email_verified BOOLEAN DEFAULT false,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'auditor', 'client')),
  department TEXT,
  enabled BOOLEAN DEFAULT true,
  avatar_color TEXT DEFAULT '#3B82F6',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ============================================================================
-- Groups Table (Discord-style roles)
-- ============================================================================
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- ============================================================================
-- User-Group Membership (many-to-many)
-- ============================================================================
CREATE TABLE user_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  UNIQUE(user_id, group_id)
);

-- ============================================================================
-- Server Access Permissions
-- ============================================================================
CREATE TABLE server_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  CHECK (user_id IS NOT NULL OR group_id IS NOT NULL),
  UNIQUE NULLS NOT DISTINCT (server_id, user_id),
  UNIQUE NULLS NOT DISTINCT (server_id, group_id)
);

-- ============================================================================
-- System Settings
-- ============================================================================
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Insert default settings
INSERT INTO system_settings (key, value) VALUES
  ('recording_retention_days', '90'),
  ('auto_analyze_sessions', 'true'),
  ('risk_detection_enabled', 'true'),
  ('max_session_duration_minutes', '0'),
  ('idle_timeout_minutes', '30');

-- ============================================================================
-- Risk Alerts Table
-- ============================================================================
CREATE TABLE risk_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('low', 'medium', 'high', 'critical')),
  pattern TEXT NOT NULL,
  matched_text TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Audit Log
-- ============================================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  actor_username TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Session Tokens (for JWT refresh)
-- ============================================================================
CREATE TABLE session_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department);
CREATE INDEX idx_users_enabled ON users(enabled);
CREATE INDEX idx_user_groups_user ON user_groups(user_id);
CREATE INDEX idx_user_groups_group ON user_groups(group_id);
CREATE INDEX idx_server_access_server ON server_access(server_id);
CREATE INDEX idx_server_access_user ON server_access(user_id);
CREATE INDEX idx_server_access_group ON server_access(group_id);
CREATE INDEX idx_risk_alerts_session ON risk_alerts(session_id);
CREATE INDEX idx_risk_alerts_level ON risk_alerts(level);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_session_tokens_user ON session_tokens(user_id);

-- ============================================================================
-- Enable RLS
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS Policies (allow all for service role)
-- ============================================================================
CREATE POLICY "Service role full access" ON users FOR ALL USING (true);
CREATE POLICY "Service role full access" ON groups FOR ALL USING (true);
CREATE POLICY "Service role full access" ON user_groups FOR ALL USING (true);
CREATE POLICY "Service role full access" ON server_access FOR ALL USING (true);
CREATE POLICY "Service role full access" ON system_settings FOR ALL USING (true);
CREATE POLICY "Service role full access" ON risk_alerts FOR ALL USING (true);
CREATE POLICY "Service role full access" ON audit_log FOR ALL USING (true);
CREATE POLICY "Service role full access" ON session_tokens FOR ALL USING (true);

-- ============================================================================
-- Update sessions table to reference new users table
-- ============================================================================
-- Add user_id column if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'user_id')
  THEN
    ALTER TABLE sessions ADD COLUMN user_id UUID REFERENCES users(id);
  END IF;
END $$;

-- ============================================================================
-- Helper function to check user server access
-- ============================================================================
CREATE OR REPLACE FUNCTION user_has_server_access(p_user_id UUID, p_server_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check department-based access (server.department is TEXT[])
  IF EXISTS (
    SELECT 1 FROM users u
    JOIN servers s ON s.id = p_server_id
    WHERE u.id = p_user_id
      AND u.department IS NOT NULL
      AND u.department = ANY(s.department)
  ) THEN
    RETURN true;
  END IF;

  -- Check direct user access
  IF EXISTS (
    SELECT 1 FROM server_access
    WHERE server_id = p_server_id AND user_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  -- Check group access
  IF EXISTS (
    SELECT 1 FROM server_access sa
    JOIN user_groups ug ON ug.group_id = sa.group_id
    WHERE sa.server_id = p_server_id AND ug.user_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Success
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 008_user_system_refactor completed successfully!';
END $$;
