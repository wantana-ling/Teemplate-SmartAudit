-- Migration: Enhanced role system
-- Date: 2026-01-27
-- Purpose: Add security role and permission-based access control

-- Update role constraint to include new 'security' role
-- First drop existing constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add new constraint with all 5 roles
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'security', 'auditor', 'client'));

-- Role permissions lookup table
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT PRIMARY KEY,
  permissions JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert role definitions with their permissions
INSERT INTO role_permissions (role, permissions, description) VALUES
  ('super_admin', '{
    "all": true
  }', 'Full system access - can do everything'),

  ('admin', '{
    "users.view": true,
    "users.create": true,
    "users.edit": true,
    "users.disable": true,
    "servers.view": true,
    "servers.create": true,
    "servers.edit": true,
    "servers.delete": true,
    "groups.view": true,
    "groups.create": true,
    "groups.edit": true,
    "groups.delete": true,
    "sessions.view": true,
    "analytics.view": true
  }', 'User/server/group management, read-only sessions'),

  ('security', '{
    "sessions.view": true,
    "sessions.terminate": true,
    "sessions.ban": true,
    "sessions.review": true,
    "sessions.tag": true,
    "live.view": true,
    "analytics.view": true,
    "bans.view": true,
    "bans.create": true,
    "bans.lift": true
  }', 'Security operations - session monitoring, termination, bans'),

  ('auditor', '{
    "sessions.view": true,
    "reports.view": true,
    "analytics.view": true
  }', 'Read-only audit access to completed sessions'),

  ('client', '{
    "client.use": true
  }', 'Client desktop app only - connect to assigned servers')
ON CONFLICT (role) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

-- Function to check if a user has a specific permission
CREATE OR REPLACE FUNCTION user_has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
BEGIN
  -- Get user's role
  SELECT role INTO v_role FROM users WHERE id = p_user_id AND enabled = true;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Get role permissions
  SELECT permissions INTO v_permissions FROM role_permissions WHERE role = v_role;

  IF v_permissions IS NULL THEN
    RETURN false;
  END IF;

  -- Check for "all" permission (super_admin)
  IF (v_permissions->>'all')::boolean = true THEN
    RETURN true;
  END IF;

  -- Check for specific permission
  RETURN COALESCE((v_permissions->>p_permission)::boolean, false);
END;
$$ LANGUAGE plpgsql;

-- Function to get all permissions for a role
CREATE OR REPLACE FUNCTION get_role_permissions(p_role TEXT)
RETURNS JSONB AS $$
DECLARE
  v_permissions JSONB;
BEGIN
  SELECT permissions INTO v_permissions FROM role_permissions WHERE role = p_role;
  RETURN COALESCE(v_permissions, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- View for users with their permissions
CREATE OR REPLACE VIEW users_with_permissions AS
SELECT
  u.id,
  u.username,
  u.display_name,
  u.email,
  u.role,
  u.department,
  u.enabled,
  u.avatar_color,
  u.created_at,
  u.last_login_at,
  rp.permissions,
  rp.description AS role_description
FROM users u
LEFT JOIN role_permissions rp ON u.role = rp.role;

COMMENT ON TABLE role_permissions IS 'Permission definitions for each role';
COMMENT ON FUNCTION user_has_permission IS 'Check if a user has a specific permission';
COMMENT ON FUNCTION get_role_permissions IS 'Get all permissions for a role';
